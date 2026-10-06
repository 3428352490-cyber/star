'use strict';

/**
 * ============================================================
 * hash 路由：页面跳转与占位页路由
 * 路由表：#/home #/codex #/search #/news #/mine
 *         #/quick-edit  #/module/{key}  #/card/{key}
 * ============================================================
 */
const Router = (() => {
  const TAB_PATHS = ['home', 'codex', 'search', 'messages', 'mine'];
  /** 路由 path → Pages 方法名映射（连字符路径对应驼峰方法） */
  const PAGE_ALIASES = {
    'quick-edit': 'quickEdit',
    'news-history': 'newsHistory',
    'post-detail': 'postDetail',
    'mine-posts': 'minePosts',
    'mine-likes': 'mineLikes',
    'mine-favorites': 'mineFavorites',
    'settings': 'settingsPage', // v2.4.2 设置页（主题设置迁移 + 账号退出板块）
  };

  /** v2.4.3 页面访问层级栈：记录来源 hash，返回时回到上一级，禁止越级跳首页 */
  let __stack = [];
  let __backing = false;
  /** 空栈时的兜底来源页（按路径映射，避免直接跳 #/home） */
  const FALLBACK = {
    settings: '#/mine',
    user: '#/messages', chat: '#/messages', notices: '#/messages',
    post: '#/home', community: '#/home', module: '#/home', card: '#/home',
    'quick-edit': '#/home', 'news-history': '#/news',
    'mine-posts': '#/mine', 'mine-likes': '#/mine', 'mine-favorites': '#/mine',
  };

  function parseHashStr(hash) {
    const raw = (hash || '#/home').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    return { path: parts[0] || 'home', param: parts.slice(1).join('/') };
  }

  function parseHash() { return parseHashStr(location.hash); }

  function currentHash() { return location.hash || '#/home'; }

  /** 记录访问层级（Tab 为根会重置；回到历史页时截断更深层级；返回操作不记录） */
  function track(hash) {
    if (__backing) { __backing = false; return; }
    if (!hash) hash = currentHash();
    const { path } = parseHashStr(hash);
    if (TAB_PATHS.indexOf(path) >= 0) { __stack = [hash]; return; } // Tab 页为访问根
    if (__stack[__stack.length - 1] === hash) return;
    const idx = __stack.indexOf(hash);
    if (idx >= 0) __stack = __stack.slice(0, idx + 1);
    else __stack.push(hash);
    if (__stack.length > 30) __stack.shift();
  }

  /** 返回上一级来源页面；空栈时按路径兜底，禁止直接跳首页 */
  function navBack() {
    const { path } = parseHash();
    __stack.pop(); // 移除当前页
    const prev = __stack[__stack.length - 1];
    const fallback = FALLBACK[path] || FALLBACK[path.split('-')[0]] || '#/mine';
    __backing = true;
    location.hash = prev || fallback;
    return prev || fallback;
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
    track(); // v2.4.3 记录访问层级
    let html;
    if (path === 'module') html = Pages.modulePage(param);
    else if (path === 'card') html = Pages.cardPage(param);
    else if (path === 'post') html = Pages.postDetail(param);
    else if (path === 'user') html = Pages.userPage(param);          // v2.4.0 他人/我的主页
    else if (path === 'chat') html = Pages.chatPage(param);          // v2.4.0 私聊窗口
    else if (path === 'notices') html = Pages.noticesPage(param);    // v2.4.0 通知分类列表
    else if (typeof Pages[path] === 'function') html = Pages[path]();
    else if (PAGE_ALIASES[path] && typeof Pages[PAGE_ALIASES[path]] === 'function') html = Pages[PAGE_ALIASES[path]]();
    else html = Pages.notFound();
    container.innerHTML = html;
    setActiveTab(TAB_PATHS.indexOf(path) >= 0 ? path : '');
    if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0);
  }

  /** 清空访问层级栈（页面刷新后重建） */
  function resetStack() { __stack = []; __backing = false; }

  return { handle, parseHash, parseHashStr, setActiveTab, navBack, track, resetStack, getStack: () => __stack.slice() };
})();
