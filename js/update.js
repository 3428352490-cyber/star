'use strict';

/**
 * ============================================================
 * 云端版本更新检测
 * - 启动时静默检查；发现新版本弹窗提示
 * - 「检查更新」按钮手动检查：无论结果均 Toast 提示
 * - 版本号语义化 major.minor.patch
 * ============================================================
 */
const Updater = (() => {
  const LOCAL_VERSION = SDV_CONFIG.app.version;

  /** 语义化版本比较：a>b 返回 1；a<b 返回 -1；相等返回 0 */
  function compareVersions(a, b) {
    const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const x = pa[i] || 0;
      const y = pb[i] || 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }

  /** 从云端 JSON 提取版本号（容错空白） */
  function extractVersion(json) {
    if (json && json.version) return String(json.version).trim();
    return '';
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
      const res = await fetch(SDV_CONFIG.app.cloudVersionUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error('http-' + res.status);
      const json = await res.json();
      const cloudVersion = extractVersion(json);
      if (!cloudVersion) throw new Error('empty-version');

      const cmp = compareVersions(cloudVersion, LOCAL_VERSION);
      if (cmp > 0) {
        updated = true;
        notice = '发现新版本 v' + cloudVersion;
        detail = json.notes && json.notes.length ? json.notes.join('；') : '';
        showUpdateModal(cloudVersion, detail);
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

  /** 新版本弹窗（含更新说明） */
  function showUpdateModal(cloudVersion, notes) {
    const body =
      '<p>检测到云端新版本 v' + esc(cloudVersion) + '（当前 v' + esc(LOCAL_VERSION) + '）。</p>' +
      (notes ? '<p>更新说明：' + esc(notes) + '</p>' : '') +
      '<p>请稍后重新打开应用获取最新内容；源码更新后双端同步生效。</p>';
    Modal.show({
      title: '发现新版本',
      body,
      actions: [{ label: '知道了', cls: 'btn-primary' }],
    });
  }

  return { check, compareVersions, extractVersion };
})();
