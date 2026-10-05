'use strict';

/**
 * ============================================================
 * 检查更新模块（静态 version.json 方案，纯网页 H5 自动更新，无需后端服务器）
 *
 * 云端数据文件：网站根目录 version.json，字段：
 *   latestVersion — 云端最新版本号（语义化 v主.次.修订，如 "1.0.11"）
 *   updateDesc    — 本次更新简介（玩家可读）
 *   downloadUrl   — 立即更新跳转地址（刷新页面加载新版静态资源）
 *
 * 逻辑规则（v2.0.3 纯网页 H5 自动更新）：
 * 1. 自动入口（页面载入完成自动检测 + 定时轮询，均 checkUpdate(false)）：
 *    · 云端 > 本地：直接自动刷新页面（location.reload() 加载最新网页资源），
 *      不弹更新弹窗；刷新前写入会话标记（sessionStorage），防止刷新后版本
 *      对比仍显示更高而无限循环刷新（同一标签页会话只自动刷新一次）。
 *    · 云端 = 本地 / 网络失败：静默不提示、不刷新。
 * 2. 手动入口（【检查更新】按钮，checkUpdate(true)）：保留弹窗确认——
 *    · 云端 > 本地：弹出更新弹窗（像素黄色边框），【立即更新】刷新页面加载
 *      新版资源，【暂不更新】仅关闭弹窗；
 *    · 云端 = 本地：Toast「当前已是最新版本」；
 *    · 网络失败：Toast「版本检查失败，请稍后重试」。
 * 3. 更新类型自动识别（SemVer 分段数字比对）：
 *    · 主版本升级（X 增大）：弹窗标题【重大版本更新】，提示「本次为底层重大更新」
 *    · 次版本升级（Y 增大）：弹窗标题【功能更新】，提示「新增功能与内容」
 *    · 修订号升级（Z 增大）：弹窗标题【补丁更新】，提示「问题修复与细节优化」
 * 4. 定时轮询：前台运行、页面后台暂停，回到前台立即补检一次（自动逻辑）。
 * 5. 硬性禁止：弹窗内硬编码任何版本号（全部变量渲染）；版本对比一律数字数组
 *    （禁止字符串直接比较）；不得保存永久忽略标记。
 * 6. 代码结构：版本解析（parseVersion）、版本比对（compareVersion）、
 *    类型识别（getUpdateTypeInfo）、弹窗渲染（showUpdateModal）、定时轮询
 *    （startPolling）单独封装，与页面渲染代码分离。
 * 7. 集成：版本检测请求/对比结果/fetch 异常/自动刷新/弹窗开关事件写入前端
 *    复盘日志（ReviewLog）；每次轮询前执行页面简易自检（SelfCheck）；版本
 *    检测请求受前端请求限流（SecurityGuard）保护。
 * ============================================================
 */
const Updater = (() => {
  /* 已确认版本记录键（localStorage）：
     仅用户点击【立即更新】时写入，用于版本记录展示；
     版本对比基准为 LOCAL_VERSION 常量，不依赖此记录。 */
  const STORAGE_KEY = 'sdv-guide:installed-version';

  /* 会话自动刷新标记（sessionStorage，仅当前标签页会话有效）：
     自动刷新前写入；刷新后页面重新检测时发现云端版本仍更高，
     凭此标记判定「本会话已自动刷新过」→ 不再刷新，防止无限循环。
     关闭网页/新开标签页为新会话，会重新检测并自动刷新。 */
  const AUTO_REFRESH_KEY = 'sdv-guide:auto-refreshed';

  /**
   * 语义化版本解析：把 v1.0.10 去掉 v 前缀、按小数点分割、转为数字数组
   * [1, 0, 10]（非法/缺段自动回退 0），供分段数字比对使用
   * @param {string} v 版本号（允许带 v 前缀，如 v1.0.0 / 1.0.0）
   * @returns {number[]} 数字数组，如 [1, 0, 10]
   */
  function parseVersion(v) {
    const s = String(v || '').replace(/^v/i, '').trim();
    const parts = s.split('.').map((x) => {
      const n = parseInt(x, 10);
      return Number.isNaN(n) ? 0 : n;
    });
    while (parts.length < 3) parts.push(0); // 主/次/修订缺位补 0
    return parts;
  }

  /**
   * 语义化版本对比（SemVer，分段数字比较，禁止字符串直接比较）：
   * @param {string} localVer 本地版本号（如 '1.0.10'）
   * @param {string} remoteVer 云端版本号（如 'v1.0.11'）
   * @returns {number} 1=云端版本更高；0=版本相同；-1=本地版本更高
   */
  function compareVersion(localVer, remoteVer) {
    const l = parseVersion(localVer);
    const r = parseVersion(remoteVer);
    for (let i = 0; i < Math.max(l.length, r.length); i++) {
      const lv = l[i] || 0;
      const rv = r[i] || 0;
      if (rv > lv) return 1;  // 云端更高
      if (rv < lv) return -1; // 本地更高
    }
    return 0; // 相同
  }

  /* 更新类型对应的弹窗标题与提示文字 */
  const TYPE_INFO = {
    major: { title: '重大版本更新', tip: '本次为底层重大更新' },
    minor: { title: '功能更新', tip: '新增功能与内容' },
    patch: { title: '补丁更新', tip: '问题修复与细节优化' },
  };

  /**
   * 更新类型自动识别：按主版本 → 次版本 → 修订号优先级判定本次更新类型
   * @param {string} remote 云端版本号
   * @param {string} local 本地版本号
   * @returns {{type: 'major'|'minor'|'patch'|null, title: string, tip: string}}
   *   主版本升级 type='major'（重大版本更新）/ 次版本 type='minor'（功能更新）/
   *   修订号 type='patch'（补丁更新）/ 无更新或云端不更高 type=null
   */
  function getUpdateTypeInfo(remote, local) {
    const r = parseVersion(remote);
    const l = parseVersion(local);
    let type = null;
    if (r[0] > l[0]) type = 'major';
    else if (r[0] < l[0]) type = null;
    else if (r[1] > l[1]) type = 'minor';
    else if (r[1] < l[1]) type = null;
    else if (r[2] > l[2]) type = 'patch';
    else type = null;
    const info = TYPE_INFO[type] || { title: '发现新版本', tip: '' };
    return { type, title: info.title, tip: info.tip };
  }

  /**
   * 读取云端版本信息：fetch 根目录 version.json
   * （拼接 Date.now() 时间戳 + cache:'no-store'，绕过浏览器/ServiceWorker 缓存）
   * @returns {Promise<{latestVersion: string, updateDesc: string, downloadUrl: string}>}
   */
  async function loadRemoteVersion() {
    if (typeof fetch !== 'function') throw new Error('no-fetch');
    const ts = Date.now(); // 时间戳：绕过浏览器 / ServiceWorker 缓存
    const res = await fetch(SDV_CONFIG.app.cloudVersionUrl + '?t=' + ts, { cache: 'no-store' });
    if (!res.ok) throw new Error('http-' + res.status);
    const json = await res.json();
    if (!json || !json.latestVersion) throw new Error('empty-version');
    return {
      latestVersion: String(json.latestVersion).trim(),
      updateDesc: String(json.updateDesc || '').trim(),
      downloadUrl: String(json.downloadUrl || '').trim(),
    };
  }

  /** 从云端 JSON 提取版本号（latestVersion 字段优先，兼容旧 version 字段；缺字段返回空串） */
  function extractVersion(json) {
    if (json) {
      if (json.latestVersion) return String(json.latestVersion).trim();
      if (json.version) return String(json.version).trim();
    }
    return '';
  }

  /* 本地版本号常量：统一管理——从 config.js 读取，
     随发布流程（config.js / sw.js 代码版本同步）自动更新，
     弹窗中所有版本文字均由该常量与云端变量输出，禁止硬编码 */
  const LOCAL_VERSION = (() => {
    try {
      return SDV_CONFIG.app.version;
    } catch (e) {
      return '0.0.0';
    }
  })();

  /** 写入已确认版本记录（仅用户点击【立即更新】时调用） */
  function setInstalledVersion(ver) {
    try {
      localStorage.setItem(STORAGE_KEY, ver);
    } catch (e) {}
  }

  /* ---------- 会话自动刷新标记（防无限循环刷新） ---------- */

  /** 本次会话是否已自动刷新过（sessionStorage 标记存在） */
  function hasAutoRefreshed() {
    try {
      return !!sessionStorage.getItem(AUTO_REFRESH_KEY);
    } catch (e) {
      return false;
    }
  }

  /** 写入会话自动刷新标记（刷新前调用，刷新后凭此标记跳过重复刷新） */
  function markAutoRefreshed() {
    try {
      sessionStorage.setItem(AUTO_REFRESH_KEY, '1');
    } catch (e) {}
  }

  /** 自动刷新页面：加载云端最新网页资源（reload 失败仅控制台记录，不阻断页面） */
  function autoRefreshPage() {
    try {
      location.reload();
    } catch (e) {
      console.error('[Updater] 自动刷新失败：', e);
    }
  }

  /* ---------- 复盘日志（模块缺失时静默，不阻断功能） ---------- */
  function log(eventType, status, message, extra) {
    try {
      if (typeof ReviewLog !== 'undefined' && ReviewLog.log) {
        ReviewLog.log(eventType, { status, message, extra });
      }
    } catch (e) { /* 日志失败不影响业务 */ }
  }

  /* ---------- 定时轮询（前台运行、页面后台暂停） ---------- */
  const POLL_INTERVAL = 30 * 60 * 1000; // 30 分钟轮询一次
  let pollTimer = null;

  /** 轮询单次执行：轮询前先执行页面简易自检，再做自动版本检测（静默失败） */
  async function pollCheck() {
    try {
      if (typeof SelfCheck !== 'undefined' && SelfCheck.run) SelfCheck.run();
    } catch (e) {
      log('self-check', 'fail', '轮询自检异常', { error: String(e && e.message ? e.message : e) });
    }
    try {
      await checkUpdate(false);
    } catch (e) {
      log('version-fetch', 'fail', '轮询版本检测异常', { error: String(e && e.message ? e.message : e) });
    }
  }

  /**
   * 启动定时轮询：仅页面处于前台时执行检测；页面切到后台暂停；
   * 从后台回到前台立即补检一次。App.init 中调用。
   */
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      // 页面后台（document.hidden）时暂停轮询
      if (typeof document !== 'undefined' && document.hidden) return;
      pollCheck();
    }, POLL_INTERVAL);
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) pollCheck(); // 回到前台立即补检一次
      });
    }
  }

  /** 停止定时轮询（预留，一般不调用） */
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /**
   * 检查更新（checkUpdate）：自动检测 + 手动入口 + 定时轮询共用同一套
   * 版本解析、比对逻辑
   * @param {boolean} manual true=【检查更新】按钮手动触发；false=自动/轮询
   * 结果：
   * - 云端 > 本地：
   *   自动：不弹弹窗，直接自动刷新页面加载最新资源（会话标记防无限循环刷新）
   *   手动：弹出更新弹窗（像素风格），【立即更新】刷新 / 【暂不更新】关闭
   * - 云端 = 本地：自动检测静默不提示；手动入口 Toast「当前已是最新版本」
   * - 网络失败：自动检测静默不提示；手动入口 Toast「版本检查失败，请稍后重试」
   * @returns {Promise<{updated: boolean, notice: string}>}
   */
  async function checkUpdate(manual) {
    // 前端请求限流：同窗口超限则跳过本次请求（自动静默 / 手动提示稍后再试）
    if (typeof SecurityGuard !== 'undefined' && SecurityGuard.allowRequest && !SecurityGuard.allowRequest('version-check')) {
      log('security', 'fail', '版本检测请求被限流', { manual: !!manual });
      if (manual) Toast.show('操作过于频繁，请稍后再试');
      return { updated: false, notice: '操作过于频繁，请稍后再试' };
    }
    log('version-fetch', 'success', '发起版本检测请求', { manual: !!manual, url: SDV_CONFIG.app.cloudVersionUrl });
    try {
      const remote = await loadRemoteVersion();
      const cmp = compareVersion(LOCAL_VERSION, remote.latestVersion);

      if (cmp > 0) {
        // 云端版本更高
        log('version-compare', 'success', '检测到新版本', { local: LOCAL_VERSION, remote: remote.latestVersion, cmp, manual: !!manual });
        if (manual) {
          // 手动入口：弹出更新弹窗，由用户确认是否刷新
          showUpdateModal(remote, LOCAL_VERSION);
        } else {
          // 自动入口：不弹弹窗，直接自动刷新页面加载最新资源；
          // 会话标记防止刷新后版本对比仍更高导致无限循环刷新
          if (hasAutoRefreshed()) {
            log('auto-refresh', 'success', '检测到新版本但本会话已自动刷新过，跳过本次刷新', { local: LOCAL_VERSION, remote: remote.latestVersion, cmp });
            return { updated: true, notice: '' };
          }
          markAutoRefreshed();
          log('auto-refresh', 'success', '检测到新版本，自动刷新页面加载最新资源', { local: LOCAL_VERSION, remote: remote.latestVersion, cmp });
          autoRefreshPage();
        }
        return { updated: true, notice: '发现新版本 v' + remote.latestVersion };
      }
      if (cmp === 0) {
        // 版本一致：自动检测静默；手动入口提示「当前已是最新版本」
        log('version-compare', 'success', '版本一致，无需更新', { local: LOCAL_VERSION, remote: remote.latestVersion, cmp });
        if (manual) Toast.show('当前已是最新版本 v' + LOCAL_VERSION);
        return { updated: false, notice: '当前已是最新版本 v' + LOCAL_VERSION };
      }
      // 本地版本高于云端（正常不出现，仅防御）
      log('version-compare', 'success', '本地版本高于云端', { local: LOCAL_VERSION, remote: remote.latestVersion, cmp });
      if (manual) Toast.show('本地版本高于云端（本地 v' + LOCAL_VERSION + ' / 云端 v' + remote.latestVersion + '）');
      return { updated: false, notice: '本地版本高于云端' };
    } catch (e) {
      // 异常：控制台打印错误；页面不崩溃；写入复盘日志
      const errMsg = e && e.message ? e.message : String(e);
      console.error('[Updater] 版本检查失败：', errMsg);
      log('version-fetch', 'fail', '版本检测请求异常', { manual: !!manual, error: errMsg });
      if (manual) {
        // 手动入口：给出提示
        Toast.show('版本检查失败，请稍后重试');
        return { updated: false, notice: '版本检查失败，请稍后重试' };
      }
      // 自动检测：静默处理，不弹出任何提示
      return { updated: false, notice: '' };
    }
  }

  /**
   * 更新弹窗（像素风格，黄色边框，沿用现有 Modal 组件）：
   * 所有版本文字均由变量输出（禁止硬编码版本号）；
   * 结构：自动识别标题 → 检测到新版本 → 当前版本 → 类型提示 → 分隔线 → 更新简介 → 双按钮
   * @param {{latestVersion: string, updateDesc: string, downloadUrl: string}} remote 云端版本信息
   * @param {string} local 本地版本号
   */
  function showUpdateModal(remote, local) {
    const info = getUpdateTypeInfo(remote.latestVersion, local);
    const desc = remote.updateDesc || '更新内容详见发布说明';
    const body =
      '<h2 class="upd-title">' + esc(info.title) + '</h2>' +
      '<p>检测到新版本 ' + esc(remote.latestVersion) + '</p>' +
      '<p>当前版本：' + esc(local) + '</p>' +
      '<p class="upd-type">' + esc(info.tip) + '</p>' +
      '<hr>' +
      '<p>' + esc(desc) + '</p>';
    log('modal-open', 'success', '更新弹窗已打开', { remote: remote.latestVersion, local });
    Modal.show({
      title: '',
      body,
      actions: [
        {
          label: '暂不更新',
          cls: 'btn-text',
          onClick: () => {
            // 仅关闭本次弹窗：不下载任何新版资源、不修改本地版本号、
            // 不保存忽略标记——下次打开页面依然会自动检测并弹窗
            log('modal-close', 'success', '暂不更新，弹窗已关闭', { remote: remote.latestVersion });
          },
        },
        {
          label: '立即更新',
          cls: 'btn-primary',
          onClick: () => {
            // 记录已确认版本 → 跳转下载地址刷新页面加载云端最新静态资源
            // （由用户动作触发，非后台静默下载）
            log('modal-close', 'success', '立即更新，跳转加载新版资源', { remote: remote.latestVersion });
            setInstalledVersion(remote.latestVersion);
            location.href = remote.downloadUrl || location.href;
          },
        },
      ],
    });
  }

  return { checkUpdate, compareVersion, extractVersion, parseVersion, getUpdateTypeInfo, startPolling, stopPolling, pollCheck };
})();
