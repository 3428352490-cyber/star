'use strict';

/**
 * ============================================================
 * 云端版本更新检测
 * - 启动时静默检查；发现新版本弹窗提示
 * - 「检查更新」按钮手动检查：无论结果均 Toast 提示
 * - fetch version.json / notice.json 均带 Date.now() 时间戳，绕过浏览器缓存，保证每次读取最新公告内容
 * - 版本对比使用 compareVersion：分段数字比较，禁止字符串直接比较
 * - 弹窗结构：左侧「暂不更新」纯文字（本次会话跳过）/ 右侧「立即更新」像素红按钮（保存本地版本并刷新）
 * ============================================================
 */
const Updater = (() => {
  const LOCAL_VERSION = SDV_CONFIG.app.version;

  /* 与版本提醒逻辑共享的存储键：
     installed-version：本地已安装版本（localStorage），立即更新时写入；
     update-skip：本次会话跳过标记（sessionStorage），暂不更新时写入 */
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

  /** 本次会话是否已点「暂不更新」（sessionStorage 标记存在即跳过弹窗） */
  function sessionSkipped() {
    try {
      return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SKIP_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  /**
   * 检测更新
   * @param {boolean} manual 手动检查（true 时无论结果都给出 Toast）
   */
  async function check(manual) {
    let updated = false;
    let notice = '检查更新失败';
    let detail = '请确认网络连接或版本清单地址是否正确';

    try {
      if (typeof fetch !== 'function') throw new Error('no-fetch');
      const ts = Date.now(); // 时间戳：绕过浏览器缓存，保证每次读取最新版本与公告
      const [verRes, noticeRes] = await Promise.all([
        fetch(SDV_CONFIG.app.cloudVersionUrl + '?t=' + ts, { cache: 'no-store' }),
        fetch('notice.json?t=' + ts, { cache: 'no-store' }),
      ]);
      if (!verRes.ok) throw new Error('http-' + verRes.status);
      const json = await verRes.json();
      const cloudVersion = extractVersion(json);
      if (!cloudVersion) throw new Error('empty-version');

      const cmp = compareVersion(cloudVersion, LOCAL_VERSION);
      if (cmp > 0) {
        updated = true;
        notice = '发现新版本 v' + cloudVersion;
        // 更新说明：优先取 notice.json 的 items（人工维护的公告）；失败时回退 version.json 的 notes
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
        if (!sessionSkipped()) showUpdateModal(cloudVersion, detail);
      } else if (cmp === 0) {
        notice = '当前已是最新版本 v' + LOCAL_VERSION;
        detail = '';
      } else {
        notice = '本地版本高于云端';
        detail = '本地 v' + LOCAL_VERSION + ' / 云端 v' + cloudVersion;
      }
    } catch (e) {
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

  /** 新版本弹窗（结构不变：左侧「暂不更新」纯文字 + 右侧「立即更新」像素红按钮） */
  function showUpdateModal(cloudVersion, notes) {
    const body =
      '<p>检测到云端新版本 v' + esc(cloudVersion) + '（当前 v' + esc(LOCAL_VERSION) + '）。</p>' +
      (notes ? '<p>更新说明：' + esc(notes) + '</p>' : '');
    Modal.show({
      title: '发现新版本',
      body,
      actions: [
        {
          label: '暂不更新',
          cls: 'btn-text',
          onClick: () => {
            // 仅本次会话不再弹窗：不写本地版本号，下次打开网页会再次检测并弹出
            try { sessionStorage.setItem(SKIP_KEY, '1'); } catch (e) {}
          },
        },
        {
          label: '立即更新',
          cls: 'btn-primary',
          onClick: () => {
            // 保存线上版本到 localStorage 并刷新页面，刷新后本地与线上一致，不再弹窗
            try { localStorage.setItem(STORAGE_KEY, cloudVersion); } catch (e) {}
            location.reload();
          },
        },
      ],
    });
  }

  return { check, compareVersion, extractVersion };
})();
