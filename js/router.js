'use strict';

/**
 * ============================================================
 * hash 路由：页面跳转与占位页路由
 * 路由表：#/home #/codex #/search #/news #/mine
 *         #/quick-edit  #/module/{key}  #/card/{key}
 * ============================================================
 */
const Router = (() => {
  const TAB_PATHS = ['home', 'codex', 'search', 'news', 'mine'];
  /** 路由 path → Pages 方法名映射（连字符路径对应驼峰方法） */
  const PAGE_ALIASES = { 'quick-edit': 'quickEdit', 'news-history': 'newsHistory' };

  function parseHash() {
    const raw = (location.hash || '#/home').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    return { path: parts[0] || 'home', param: parts.slice(1).join('/') };
  }

  function setActiveTab(path) {
    const items = document.querySelectorAll('.nav-item');
    if (!items || typeof items.forEach !== 'function') return;
    items.forEach((el) => el.classList.toggle('active', el.dataset.tab === path));
  }

  /** 渲染当前路由页面（容器由 index.html 提供） */
  function handle() {
    if (typeof Pages === 'undefined') return;
    const { path, param } = parseHash();
    const container = document.getElementById('page-container');
    if (!container) return;
    let html;
    if (path === 'module') html = Pages.modulePage(param);
    else if (path === 'card') html = Pages.cardPage(param);
    else if (typeof Pages[path] === 'function') html = Pages[path]();
    else if (PAGE_ALIASES[path] && typeof Pages[PAGE_ALIASES[path]] === 'function') html = Pages[PAGE_ALIASES[path]]();
    else html = Pages.notFound();
    container.innerHTML = html;
    setActiveTab(TAB_PATHS.indexOf(path) >= 0 ? path : '');
    if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0);
  }

  return { handle, parseHash, setActiveTab };
})();
