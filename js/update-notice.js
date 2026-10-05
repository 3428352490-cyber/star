'use strict';

/**
 * ============================================================
 * 版本更新提醒系统（GitHub Pages 静态 PWA 专用）
 * - 页面加载完成后异步请求根目录 version.json / notice.json（带时间戳绕过浏览器缓存）
 * - 线上版本 > 本地已安装版本（localStorage 记录）且本会话未跳过（sessionStorage 标记）→ 弹出更新弹窗
 * - 【立即更新】：写入线上版本到 localStorage 并刷新页面，刷新后不再弹出
 * - 【暂不更新】：关闭弹窗并标记本会话跳过；当前网页期间不再弹，重新进入页面仍会检测并弹出
 * - 弹窗使用独立 class（upd-*），白色圆角卡片 + 全屏遮罩 + 主次按钮，不影响项目原有 UI 与 PWA
 * ============================================================
 */
(function () {
  var STORAGE_KEY = 'sdv-guide:installed-version';  /* 本地已安装版本号 */
  var SKIP_KEY = 'sdv-guide:update-skip';           /* 本次会话跳过标记 */
  var VERSION_URL = 'version.json';
  var NOTICE_URL = 'notice.json';

  /** 语义化版本比较：a > b 返回 true（major.minor.patch，缺位按 0） */
  function gt(a, b) {
    var pa = String(a || '').trim().split('.').map(function (n) { return parseInt(n, 10) || 0; });
    var pb = String(b || '').trim().split('.').map(function (n) { return parseInt(n, 10) || 0; });
    var len = Math.max(pa.length, pb.length);
    for (var i = 0; i < len; i++) {
      var x = pa[i] || 0;
      var y = pb[i] || 0;
      if (x > y) return true;
      if (x < y) return false;
    }
    return false;
  }

  /** 简单 HTML 转义（公告为人工填写内容） */
  function escText(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /** 注入弹窗样式（只挂载一次；独立 class，不影响项目样式） */
  function injectStyle() {
    if (document.getElementById('upd-notice-style')) return;
    var style = document.createElement('style');
    style.id = 'upd-notice-style';
    style.textContent = [
      '.upd-mask{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px}',
      '.upd-card{background:#fff;border-radius:14px;max-width:360px;width:100%;padding:22px 20px;box-shadow:0 10px 30px rgba(0,0,0,.3);font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}',
      '.upd-badge{display:inline-block;background:#e74c3c;color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;margin-bottom:10px}',
      '.upd-title{font-size:17px;font-weight:700;color:#222;margin:0 0 6px;line-height:1.4}',
      '.upd-sub{font-size:12px;color:#999;margin-bottom:12px}',
      '.upd-list{list-style:disc;padding-left:18px;margin:0;font-size:13px;color:#555;line-height:1.7;max-height:180px;overflow-y:auto}',
      '.upd-primary{display:block;width:100%;background:#2b7de9;color:#fff;border:0;border-radius:8px;padding:12px;font-size:15px;font-weight:600;margin-top:16px;cursor:pointer}',
      '.upd-primary:active{background:#1f66c4}',
      '.upd-secondary{display:block;margin:10px auto 0;background:none;border:0;color:#999;font-size:12px;text-decoration:underline;cursor:pointer;padding:4px 8px}',
    ].join('\n');
    document.head.appendChild(style);
  }

  /** 弹出更新弹窗 */
  function showModal(ver, local, notice) {
    injectStyle();
    var mask = document.createElement('div');
    mask.className = 'upd-mask';

    var itemsHtml = '';
    if (notice && Array.isArray(notice.items) && notice.items.length) {
      itemsHtml = '<ul class="upd-list">' +
        notice.items.map(function (t) { return '<li>' + escText(t) + '</li>'; }).join('') +
        '</ul>';
    } else {
      itemsHtml = '<p class="upd-list">检测到新版本 v' + escText(ver) + '，请更新后获取最新内容。</p>';
    }
    var title = notice && notice.title ? notice.title : '发现新版本 v' + ver;

    mask.innerHTML =
      '<div class="upd-card">' +
        '<span class="upd-badge">有新版本</span>' +
        '<h3 class="upd-title">' + escText(title) + '</h3>' +
        '<p class="upd-sub">当前版本 v' + escText(local) + ' → 最新版本 v' + escText(ver) + '</p>' +
        itemsHtml +
        '<button type="button" class="upd-primary">立即更新</button>' +
        '<button type="button" class="upd-secondary">暂不更新</button>' +
      '</div>';

    mask.querySelector('.upd-primary').addEventListener('click', function () {
      try { localStorage.setItem(STORAGE_KEY, ver); } catch (e) {}
      location.reload();
    });
    mask.querySelector('.upd-secondary').addEventListener('click', function () {
      try { sessionStorage.setItem(SKIP_KEY, '1'); } catch (e) {}
      mask.remove();
    });
    document.body.appendChild(mask);
  }

  /** 页面加载完成后异步检测 */
  async function init() {
    try {
      if (typeof fetch !== 'function') return;
      try { if (sessionStorage.getItem(SKIP_KEY)) return; } catch (e) {}
      var ts = Date.now();
      var vRes = await fetch(VERSION_URL + '?t=' + ts, { cache: 'no-store' });
      var nRes = await fetch(NOTICE_URL + '?t=' + ts, { cache: 'no-store' });
      if (!vRes.ok) return;
      var json = await vRes.json();
      var ver = String(json && json.version || '').trim();
      if (!ver) return;

      var local = null;
      try { local = localStorage.getItem(STORAGE_KEY); } catch (e) {}
      if (!local) {
        /* 首次使用：记录当前线上版本为已安装版本，不弹窗 */
        try { localStorage.setItem(STORAGE_KEY, ver); } catch (e) {}
        return;
      }
      if (!gt(ver, local)) return; /* 线上不高于本地：不弹窗、不刷新 */

      var notice = null;
      if (nRes.ok) {
        try { notice = await nRes.json(); } catch (e) { notice = null; }
      }
      showModal(ver, local, notice);
    } catch (e) { /* 静默失败：不影响页面正常加载 */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
