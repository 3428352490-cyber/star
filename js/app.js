'use strict';

/**
 * ============================================================
 * 应用入口：初始化 / 事件绑定 / 图标挂载
 * 依赖约定：js/config.js → util → store → theme → ui → pages → router → update
 * ============================================================
 */
const App = (() => {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** 底部导航内联 SVG 图标（一期内置，后续可替换为图片通道） */
  const NAV_SVG = {
    home: '<path d="M4 11 L12 3 L20 11 V20 H14 V14 H10 V20 H4 Z"/>',
    codex: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5 L20 20"/>',
    news: '<rect x="4" y="4" width="16" height="16"/><path d="M8 9 H16 M8 13 H16 M8 17 H13"/>',
    mine: '<circle cx="12" cy="8" r="4"/><path d="M5.5 20 C5.5 15.5 8 13.5 12 13.5 C16 13.5 18.5 15.5 18.5 20"/>',
  };

  /** 按 tabs 数组渲染底部导航（5 Tab 均分，搜索居中） */
  function renderTabs() {
    const nav = $('#bottom-nav');
    if (!nav) return;
    nav.innerHTML = SDV_CONFIG.tabs.map((t) =>
      '<button class="nav-item' + (t.key === 'search' ? ' search' : '') + '" data-tab="' + t.key + '" data-route="#/' + t.key + '">' +
        '<span class="nav-icon">' + (t.key === 'home'
          ? '<img src="assets/nav-home.png" alt="" style="width:100%;height:100%;object-fit:contain">'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter">' + (NAV_SVG[t.key] || '') + '</svg>') + '</span>' +
        '<span class="nav-label">' + esc(t.label) + '</span>' +
      '</button>'
    ).join('');
  }

  /**
   * 图标替换通道：assets/icons/{key}.png 存在则自动替换「首字」文字瓦片。
   * 一期仅预留路径；放入同名透明像素 PNG 后自动生效。
   */
  function mountIcons(root) {
    const scope = root || document;
    $$('[data-icon]', scope).forEach((box) => {
      const key = box.dataset.icon;
      const img = new Image();
      img.className = 'tile-img';
      img.alt = '';
      img.src = 'assets/icons/' + key + '.png';
      img.onload = () => {
        if (img.naturalWidth > 0 && !box.querySelector('img')) {
          box.innerHTML = '';
          box.appendChild(img);
        }
      };
      img.onerror = () => {};
    });
  }

  /** 渲染当前路由页面 + 挂载图标 */
  function render() {
    if (typeof Router !== 'undefined') Router.handle();
    mountIcons($('#page-container'));
  }

  /* ---------- 全局事件（事件委托） ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || typeof t.closest !== 'function') return;

    const routeEl = t.closest('[data-route]');
    if (routeEl) {
      if (location.hash !== routeEl.dataset.route) location.hash = routeEl.dataset.route;
      return;
    }
    const themeBtn = t.closest('[data-theme-manual]');
    if (themeBtn) {
      Theme.setManual(themeBtn.dataset.themeManual);
      render();
      return;
    }
    const actionEl = t.closest('[data-action]');
    if (actionEl) handleAction(actionEl.dataset.action);

    /* 快捷键上限：点击已达上限而被禁用的未勾选项 → 弹出提示弹窗（仅提示，不执行新增动作） */
    const navItem = t.closest('.check-item');
    if (navItem) {
      const navCheck = navItem.querySelector('input[data-nav-check]');
      if (navCheck && navCheck.disabled && !navCheck.checked) {
        Modal.show({
          title: '提示',
          body: '<p>快捷键数量已达到上限，无法继续添加更多快捷键。</p>',
          actions: [{ label: '确定', cls: 'btn-primary' }]
        });
      }
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || typeof t.matches !== 'function') return;
    if (t.matches('[data-theme-follow]')) {
      Theme.setFollowSystem(t.checked);
      render();
      return;
    }
    if (t.matches('[data-nav-check]')) {
      updateNavCounter();
      enforceNavLimit();
      const item = t.closest('.check-item');
      if (item) item.classList.toggle('on', t.checked);
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'search-input') handleSearch(e.target.value);
  });

  /* ---------- 动作分发 ---------- */
  function handleAction(action) {
    switch (action) {
      case 'account':
        Modal.show({ title: '敬请期待', body: '<p>云端账号登录功能建设中，敬请期待。</p>' });
        break;
      case 'check-update':
        // 【检查更新】备用手动入口：点击执行完整云端版本比对（自动检测同样调用 Updater.check）
        if (typeof Updater !== 'undefined' && Updater.check) Updater.check(true);
        break;
      case 'nav-save':
        saveQuickNav();
        break;
      case 'nav-reset':
        Store.setSelectedNav(SDV_CONFIG.quickNav.defaultSelected.slice());
        Toast.show('已恢复默认');
        render();
        break;
      default:
        break;
    }
  }

  /* ---------- 快捷键编辑 ---------- */
  function saveQuickNav() {
    const checked = $$('[data-nav-check]:checked').map((i) => i.dataset.navCheck);
    if (checked.length > SDV_CONFIG.quickNav.maxSelected) {
      Toast.show('最多选择 ' + SDV_CONFIG.quickNav.maxSelected + ' 个功能');
      return;
    }
    Store.setSelectedNav(checked);
    Toast.show('已保存');
    location.hash = '#/home';
  }

  function updateNavCounter() {
    const n = $$('[data-nav-check]:checked').length;
    const counter = $('#nav-count');
    if (counter) counter.textContent = '已选 ' + n + '/' + SDV_CONFIG.quickNav.maxSelected;
  }

  function enforceNavLimit() {
    const n = $$('[data-nav-check]:checked').length;
    const atLimit = n >= SDV_CONFIG.quickNav.maxSelected;
    $$('[data-nav-check]').forEach((cb) => {
      if (!cb.checked) cb.disabled = atLimit;
    });
  }

  /* ---------- 搜索（基础框架：38 模块实时过滤） ---------- */
  function handleSearch(q) {
    const box = $('#search-result');
    if (!box) return;
    if (typeof Pages === 'undefined') return;
    const query = (q || '').trim().toLowerCase();
    if (!query) {
      box.innerHTML = Pages.emptyState('输入关键词，检索全部词条', '一期为基础检索框架，全量词条二期接入');
      mountIcons(box);
      return;
    }
    const hits = Pages.filterModules(query);
    if (!hits.length) {
      box.innerHTML = Pages.emptyState('未找到相关词条', '二期将接入游戏全量词条');
      mountIcons(box);
      return;
    }
    box.innerHTML = '<div class="search-hit-list">' + hits.map((m) =>
      '<button class="search-hit" data-route="#/module/' + m.key + '">' +
        '<span class="tile-icon sm" data-icon="' + m.key + '"><span class="tile-fallback">' + esc(m.label[0]) + '</span></span>' +
        esc(m.label) + '<span class="tag">模块</span>' +
      '</button>'
    ).join('') + '</div>';
    mountIcons(box);
  }

  /* ---------- 入口 ---------- */
  function init() {
    Store.load();
    Theme.apply();
    renderTabs();
    render();
    // 页面打开自动执行版本检测：云端更高弹更新弹窗；版本一致/网络失败静默处理
    if (typeof Updater !== 'undefined' && Updater.check) Updater.check(false);
    registerSW();
  }

  function registerSW() {
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[SW] 注册失败', err));
      });
    }
  }

  window.addEventListener('hashchange', () => { render(); });
  document.addEventListener('DOMContentLoaded', init);

  return { init, render, renderTabs, mountIcons };
})();
