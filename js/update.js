'use strict';

/**
 * ============================================================
 * 云端版本更新检测（手动确认模式）
 * - 禁止静默自动更新：不后台拉取新版本资源；必须弹出更新弹窗，由用户手动选择后才刷新加载新版本
 * - 页面加载第一时间读取云端 version.json / notice.json（均拼接 Date.now() 时间戳，绕过浏览器与 ServiceWorker 缓存）
 * - 版本对比使用 compareVersion：分段数字比较，禁止字符串直接比较
 * - 弹窗触发规则：仅当云端版本号 > localStorage 中记录的已确认版本号时弹窗
 * - 弹窗结构：左侧「暂不更新」纯文字（灰色、无按钮样式）/ 右侧「立即更新」红色像素方块按钮
 * - 交互：暂不更新 → 仅写 sessionStorage 会话标记并关闭；立即更新 → 云端版本写入 localStorage 并 location.reload()
 * - 异常：json 读取失败 console.error 打印错误，页面不崩溃、不弹报错弹窗
 * ============================================================
 */
const Updater = (() => {
  /* 存储键：
     installed-version：用户已确认/已安装版本（localStorage）——弹窗触发与「当前版本」显示基准；
     update-skip：本次会话跳过标记（sessionStorage）——仅当前网页会话不再弹窗，关闭网页重新打开后恢复检测 */
  const STORAGE_KEY = 'sdv-guide:installed-version';
  const SKIP_KEY = 'sdv-guide:update-skip';

  /**
   * 语义化版本对比（标准实现）：remote > local 返回 1；remote < local 返回 -1；相等返回 0
   * 分段数字比较，禁止字符串直接比较
   * @param {string} remote 远端/云端版本号
   * @param {string} local 本地版本号
   */
  function compareVersion(remote, local) {
    const r = remote.split('.').map(Number);
    const l = local.split('.').map(Number);
    for (let i = 0; i < Math.max(r.length, l.length); i++) {
      const rv = r[i] || 0;
      const lv = l[i] || 0;
      if (rv > lv) return 1;
      if (rv < lv) return -1;
    }
    return 0;
  }

  /** 从云端 JSON 提取版本号（容错空白） */
  function extractVersion(json) {
    if (json && json.version) return String(json.version).trim();
    return '';
  }

  /** 读取 localStorage 中已确认的版本号（无记录返回 null） */
  function getInstalledVersion() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  /** 写入 localStorage 已确认版本号 */
  function setInstalledVersion(ver) {
    try {
      localStorage.setItem(STORAGE_KEY, ver);
    } catch (e) {}
  }

  /** 本次会话是否已点「暂不更新」（sessionStorage 标记存在即跳过弹窗） */
  function sessionSkipped() {
    try {
      return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SKIP_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  /**
   * 检测更新（页面加载第一时间调用；manual=true 时无论结果都给出 Toast）
   * @param {boolean} manual 手动检查（「检查更新」按钮触发）
   */
  async function check(manual) {
    let updated = false;
    let notice = '检查更新失败';
    let detail = '请确认网络连接或版本清单地址是否正确';

    try {
      if (typeof fetch !== 'function') throw new Error('no-fetch');
      const ts = Date.now(); // 时间戳：绕过浏览器 / ServiceWorker 缓存，每次读取最新版本与公告
      const [verRes, noticeRes] = await Promise.all([
        fetch(SDV_CONFIG.app.cloudVersionUrl + '?t=' + ts, { cache: 'no-store' }),
        fetch('notice.json?t=' + ts, { cache: 'no-store' }),
      ]);
      if (!verRes.ok) throw new Error('http-' + verRes.status);
      const json = await verRes.json();
      const cloudVersion = extractVersion(json);
      if (!cloudVersion) throw new Error('empty-version');

      // 本地基准 = localStorage 中用户已确认的版本号（用 compareVersion 分段数字比较，禁止字符串比较）
      let installed = getInstalledVersion();
      if (!installed) {
        // 首次使用：记录当前云端版本为已确认版本，不弹窗（避免首次访问即打扰）
        setInstalledVersion(cloudVersion);
        installed = cloudVersion;
        notice = '当前已是最新版本 v' + cloudVersion;
        detail = '';
      } else if (compareVersion(cloudVersion, installed) > 0) {
        // 云端版本更高：弹窗由用户手动选择是否更新，绝不后台自动更新
        updated = true;
        notice = '发现新版本 v' + cloudVersion;
        // 更新说明：优先取 notice.json 的 items（人工维护公告）；失败时回退 version.json 的 notes
        let notes = json.notes && json.notes.length ? json.notes.join('；') : '';
        if (noticeRes.ok) {
          try {
            const n = await noticeRes.json();
            if (n && Array.isArray(n.items) && n.items.length) {
              notes = n.items.join('；');
            }
          } catch (e) { /* 公告解析失败：沿用 version.json 的 notes */ }
        }
        detail = notes;
        if (!sessionSkipped()) showUpdateModal(cloudVersion, installed, detail);
      } else if (compareVersion(cloudVersion, installed) === 0) {
        notice = '当前已是最新版本 v' + installed;
        detail = '';
      } else {
        notice = '本地版本高于云端';
        detail = '本地 v' + installed + ' / 云端 v' + cloudVersion;
      }
    } catch (e) {
      // 异常：控制台打印错误，页面不崩溃、不弹报错弹窗
      console.error('[Updater] 版本检查失败：', e && e.message ? e.message : e);
      if (e && e.message === 'no-fetch') {
        notice = '当前环境不支持检查更新';
        detail = '';
      } else if (e && e.message === 'empty-version') {
        notice = '云端版本清单格式错误';
        detail = '';
      }
    }

    if (manual) {
      Toast.show(detail ? notice + '，' + detail : notice);
    }
    return { updated, notice };
  }

  /** 新版本弹窗（像素风格保留；底部同一行：左「暂不更新」纯文字 / 右「立即更新」红色像素按钮） */
  function showUpdateModal(cloudVersion, installed, notes) {
    const body =
      '<p>检测到云端新版本 v' + esc(cloudVersion) + '（当前 v' + esc(installed) + '）。</p>' +
      (notes ? '<p>更新说明：' + esc(notes) + '</p>' : '');
    Modal.show({
      title: '发现新版本',
      body,
      actions: [
        {
          label: '暂不更新',
          cls: 'btn-text',
          onClick: () => {
            // 仅当前网页会话不再弹窗：不改动 localStorage 版本；关闭网页重新打开后依旧会检测并弹出
            try { sessionStorage.setItem(SKIP_KEY, '1'); } catch (e) {}
          },
        },
        {
          label: '立即更新',
          cls: 'btn-primary',
          onClick: () => {
            // 云端版本写入 localStorage，再由用户动作触发刷新加载最新资源（非后台自动下载）
            setInstalledVersion(cloudVersion);
            location.reload();
          },
        },
      ],
    });
  }

  return { check, compareVersion, extractVersion };
})();
