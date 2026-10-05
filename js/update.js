'use strict';

/**
 * ============================================================
 * 检查更新模块（静态 version.json 方案，无需后端服务器）
 *
 * 逻辑规则：
 * 1. 触发：页面打开时自动执行版本检测（拉取云端 version.json 与本地版本比对）；
 *    「我的」页【检查更新】按钮为备用手动入口，点击再次执行完整比对。
 * 2. 版本检测：本地版本 = config.js 中固定的网站当前版本（绝不自动修改）；
 *    线上版本 = 网站根目录 version.json（开发阶段可用 Mock 数据模拟）。
 * 3. 结果：
 *    · 线上 > 本地：一律弹出更新弹窗（自动/手动共用同一弹窗组件：新版本号 + 更新简介 + 双按钮）
 *    · 线上 = 本地：自动检测静默不提示；手动入口 Toast「当前已是最新版本」
 *    · 网络失败：自动检测静默处理；手动入口 Toast「版本检查失败，请稍后重试」
 * 4. 弹窗交互：
 *    · 【立即更新】：关闭弹窗 → 加载云端新版静态资源并刷新页面（location.reload()）
 *    · 【暂不更新】：仅关闭弹窗，不下载任何新版资源、不修改本地版本号、
 *      不增加永久忽略版本的本地标记——下次打开页面依然会自动检测并弹窗
 * 5. 硬性禁止：静默后台下载新版资源 / 未经用户确认自动修改本地版本号 /
 *    永久屏蔽某个版本。
 * 6. 上线切换：USE_MOCK 置 false 即启用 fetch 读取根目录 version.json，
 *    弹窗与交互逻辑完全不用改动。
 * 7. 代码结构：版本检测（check）、弹窗渲染（showUpdateModal）、
 *    更新跳转（立即更新回调）单独封装，与页面渲染代码分离。
 * ============================================================
 */
const Updater = (() => {
  /* ----------------------------------------------------------
   * 开发阶段 Mock 开关：
   *   true  → 使用下方 MOCK_VERSION 内置数据模拟 version.json（方便调试弹窗）
   *   false → 启用 fetch 读取网站根目录 version.json（上线时改为 false）
   * 弹窗与交互逻辑两种模式完全一致，无需其它改动。
   * ---------------------------------------------------------- */
  const USE_MOCK = true;

  /* Mock 运行时开关（默认跟随 USE_MOCK）：
     setMockEnabled(false) 可临时切到 fetch 分支（等价上线状态），
     用于测试/调试真实 version.json 读取；页面正常使用无需调用。 */
  let useMock = USE_MOCK;
  function setMockEnabled(v) {
    useMock = !!v;
  }

  /* Mock 数据：模拟 version.json 内容（version + notes）。版本高于本地即可触发弹窗调试 */
  const MOCK_VERSION = {
    version: '9.9.9',
    notes: ['Mock 数据：模拟线上新版本，用于调试更新弹窗'],
  };

  /* 已确认版本记录键（localStorage）：
     仅用户点击【立即更新】时写入，用于版本记录展示；
     版本对比基准为 config.js 中固定的本地版本号，不依赖此记录。 */
  const STORAGE_KEY = 'sdv-guide:installed-version';

  /**
   * 语义化版本对比（标准实现）：remote > local 返回 1；remote < local 返回 -1；相等返回 0
   * 分段数字比较，禁止字符串直接比较
   * @param {string} remote 远端/线上版本号
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

  /**
   * 读取线上版本信息：
   * - Mock 模式：直接返回 MOCK_VERSION（不发起任何网络请求）
   * - 线上模式：fetch 根目录 version.json + notice.json（均拼接 Date.now() 时间戳，
   *   绕过浏览器 / ServiceWorker 缓存，每次读取最新版本与公告）
   * 更新简介优先取 notice.json items（人工维护公告），失败时回退 version.json notes
   * @returns {Promise<{version: string, notes: string[]}>}
   */
  async function loadRemoteVersion() {
    if (useMock) return MOCK_VERSION;

    if (typeof fetch !== 'function') throw new Error('no-fetch');
    const ts = Date.now(); // 时间戳：绕过浏览器 / ServiceWorker 缓存
    const [verRes, noticeRes] = await Promise.all([
      fetch(SDV_CONFIG.app.cloudVersionUrl + '?t=' + ts, { cache: 'no-store' }),
      fetch('notice.json?t=' + ts, { cache: 'no-store' }),
    ]);
    if (!verRes.ok) throw new Error('http-' + verRes.status);
    const json = await verRes.json();
    if (!json || !json.version) throw new Error('empty-version');

    let notes = Array.isArray(json.notes) && json.notes.length ? json.notes.slice() : [];
    if (noticeRes.ok) {
      try {
        const n = await noticeRes.json();
        if (n && Array.isArray(n.items) && n.items.length) notes = n.items.slice();
      } catch (e) { /* 公告解析失败：沿用 version.json notes */ }
    }
    return { version: String(json.version).trim(), notes };
  }

  /** 从云端 JSON 提取版本号（容错空白；null/缺字段返回空串） */
  function extractVersion(json) {
    if (json && json.version) return String(json.version).trim();
    return '';
  }

  /** 本地固定版本号：读取 config.js 中网站当前版本（绝不自动修改） */
  function getLocalVersion() {
    try {
      return SDV_CONFIG.app.version;
    } catch (e) {
      return '0.0.0';
    }
  }

  /** 写入已确认版本记录（仅用户点击【立即更新】时调用） */
  function setInstalledVersion(ver) {
    try {
      localStorage.setItem(STORAGE_KEY, ver);
    } catch (e) {}
  }

  /**
   * 检查更新（自动检测 + 手动入口共用同一套检测与弹窗逻辑）
   * @param {boolean} manual true=【检查更新】按钮手动触发；false=页面打开自动检测
   * 结果：
   * - 线上 > 本地：一律弹出更新弹窗（自动/手动完全相同）
   * - 线上 = 本地：自动检测静默不提示；手动入口 Toast「当前已是最新版本」
   * - 网络失败：自动检测静默不提示；手动入口 Toast「版本检查失败，请稍后重试」
   * @returns {Promise<{updated: boolean, notice: string}>}
   */
  async function check(manual) {
    try {
      const local = getLocalVersion();
      const remote = await loadRemoteVersion();
      const cmp = compareVersion(remote.version, local);

      if (cmp > 0) {
        // 线上版本更高：弹出更新弹窗（自动检测与手动点击共用同一弹窗组件），
        // 由用户手动选择是否立即更新（绝不后台自动下载）
        showUpdateModal(remote, local);
        return { updated: true, notice: '发现新版本 v' + remote.version };
      }
      if (cmp === 0) {
        // 版本一致：自动检测静默；手动入口提示「当前已是最新版本」
        if (manual) Toast.show('当前已是最新版本 v' + local);
        return { updated: false, notice: '当前已是最新版本 v' + local };
      }
      // 本地版本高于云端（正常不出现，仅防御）
      if (manual) Toast.show('本地版本高于云端（本地 v' + local + ' / 云端 v' + remote.version + '）');
      return { updated: false, notice: '本地版本高于云端' };
    } catch (e) {
      // 异常：控制台打印错误；页面不崩溃
      console.error('[Updater] 版本检查失败：', e && e.message ? e.message : e);
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
   * 更新弹窗（像素风格卡片）：
   * 内容包含新版本号、更新简介；底部一行两个控件——
   * 左侧【暂不更新】纯文字（灰色、无按钮样式）、右侧【立即更新】红色像素方块按钮
   * @param {{version: string, notes: string[]}} remote 线上版本信息
   * @param {string} local 本地版本号
   */
  function showUpdateModal(remote, local) {
    const brief = (remote.notes && remote.notes.length)
      ? remote.notes.map((n) => '<li>' + esc(n) + '</li>').join('')
      : '<li>更新内容详见发布说明</li>';
    const body =
      '<p>检测到新版本 v' + esc(remote.version) + '（当前 v' + esc(local) + '）。</p>' +
      '<ul>' + brief + '</ul>';
    Modal.show({
      title: '发现新版本',
      body,
      actions: [
        {
          label: '暂不更新',
          cls: 'btn-text',
          onClick: () => {
            // 仅关闭本次弹窗：不下载任何新版资源、不修改本地版本号、
            // 不增加永久忽略版本的本地标记——下次打开页面依然会自动检测并弹窗
          },
        },
        {
          label: '立即更新',
          cls: 'btn-primary',
          onClick: () => {
            // 记录已确认版本 → 刷新页面加载线上新版静态资源（由用户动作触发，非后台静默下载）
            setInstalledVersion(remote.version);
            location.reload();
          },
        },
      ],
    });
  }

  return { check, compareVersion, extractVersion, setMockEnabled };
})();
