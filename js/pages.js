'use strict';

/**
 * ============================================================
 * 页面渲染（全部为框架占位，详情二期填充）
 * 纯字符串渲染、不直接操作 DOM，便于单元测试。
 * ============================================================
 */
const Pages = (() => {

  function emptyState(text, sub) {
    return '<div class="empty-state"><div class="empty-box">' + esc(text) + '</div>' +
      (sub ? '<p class="empty-sub">' + esc(sub) + '</p>' : '') + '</div>';
  }

  function pageHeader(title, back, backRoute) {
    return '<header class="page-header">' +
      (back ? '<button class="btn-back" data-route="' + (backRoute || '#/home') + '" aria-label="返回">←</button>' : '') +
      '<h1>' + esc(title) + '</h1></header>';
  }

  /** 单条公告卡片（主页与历史页共用，保持同一风格） */
  function noticeItem(a) {
    return '<article class="notice-item">' +
      '<div class="notice-head">' +
        '<span class="tag">v' + esc(a.version) + '</span>' +
        '<h3>' + esc(a.title) + '</h3>' +
        '<span class="notice-date">' + esc(a.date || '') + '</span>' +
      '</div>' +
      '<ul class="notice-notes">' + (a.notes || []).map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>' +
    '</article>';
  }

  function tile(m, extraClass) {
    return '<button class="tile' + (extraClass ? ' ' + extraClass : '') + '" data-route="#/module/' + m.key + '">' +
      '<span class="tile-icon" data-icon="' + m.key + '"><span class="tile-fallback">' + esc(m.label[0]) + '</span></span>' +
      '<span class="tile-label">' + esc(m.label) + '</span></button>';
  }

  /** 首页：左上角公告入口 + 快捷导航 8 格 + 功能专区（缩小卡片）+ 老乡有话说社区板块 */
  function home() {
    const selected = Store.getSelectedNav();
    const totalCells = SDV_CONFIG.quickNav.rows * SDV_CONFIG.quickNav.cols - 1; // 7
    const cells = [];
    for (let i = 0; i < totalCells; i++) {
      const m = i < selected.length ? SDV_CONFIG.modules.find((x) => x.key === selected[i]) : null;
      if (m) cells.push(tile(m));
      else cells.push('<div class="tile tile-empty" aria-hidden="true"><span class="tile-label">—</span></div>');
    }
    cells.push('<button class="tile tile-more" data-route="#/quick-edit">' +
      '<span class="tile-icon"><span class="tile-fallback">⋯</span></span>' +
      '<span class="tile-label">更多</span></button>');

    const cards = SDV_CONFIG.homeCards.map((c) =>
      '<button class="card home-card home-card-sm" data-route="#/card/' + c.key + '">' +
        '<h3>' + esc(c.title) + '</h3><p>' + esc(c.desc) + '</p></button>'
    ).join('');

    return pageHeader(SDV_CONFIG.app.name, false) +
      '<button class="billboard-btn" data-route="#/news" title="公告">📢</button>' +
      '<section class="home-grid">' +
        '<div>' +
          '<section class="card"><div class="card-head"><h2>快捷功能</h2><span class="card-sub">' + selected.length + '/' + SDV_CONFIG.quickNav.maxSelected + '</span></div>' +
          '<div class="quick-nav-grid">' + cells.join('') + '</div></section>' +
        '</div>' +
        '<div>' +
          '<section class="card"><div class="card-head"><h2>功能专区</h2></div>' +
          '<div class="home-cards home-cards-sm">' + cards + '</div></section>' +
        '</div>' +
      '</section>' +
      (typeof Community !== 'undefined' ? Community.renderHomeBlock() : '');
  }

  /** 图鉴：38 分类网格（复用模块数组，单一数据源） */
  function codex() {
    const grid = SDV_CONFIG.modules.map((m) => tile(m, 'tile-codex')).join('');
    return pageHeader('图鉴', false) +
      '<section class="card"><div class="card-head"><h2>物品分类</h2><span class="card-sub">' + SDV_CONFIG.modules.length + ' 类</span></div>' +
      '<div class="codex-grid">' + grid + '</div>' +
      '<p class="card-foot">分类条目与详情二期填充；当前为分类框架。</p></section>';
  }

  /** 搜索：搜索框 + 搜索按钮 + 结果区 */
  function search() {
    return pageHeader('搜索', false) +
      '<section class="card search-area"><div class="search-bar">' +
      '<input id="search-input" type="search" placeholder="" aria-label="全局搜索">' +
      '<button type="button" id="search-btn" class="search-btn">搜索</button>' +
      '<div id="search-carousel" class="search-carousel" aria-hidden="true"></div>' +
      '</div>' +
      '<div id="search-panel" class="search-panel"></div>' +
      '<div id="search-result" class="search-result">' + emptyState('输入关键词，检索全部词条', '一期为基础检索框架，全量词条二期接入') + '</div></section>';
  }

  /** 公告主页：默认只展示最近 3 条；右上角「更多」展开全部 / 再次点击收起 */
  function news() {
    const list = SDV_CONFIG.announcements || [];
    const expanded = newsExpanded();
    const shown = expanded ? list : list.slice(0, 3);
    return pageHeader('公告', true, '#/home') +
      '<section class="card"><div class="card-head"><h2>版本更新</h2>' +
      (list.length > 3 ? '<button class="notice-more" data-action="news-toggle-more">' + (expanded ? '收起 ›' : '更多 ›') + '</button>' : '') +
      '</div>' +
      (shown.length ? '<div class="notice-list">' + shown.map(noticeItem).join('') + '</div>'
              : emptyState('暂无公告', '运营通知与版本更新公告将在此展示')) +
      '</section>';
  }

  /** 公告页「更多/收起」展开状态（内存态，刷新回到默认 3 条） */
  let _newsExpanded = false;
  function newsExpanded() { return _newsExpanded; }
  function newsToggleMore() { _newsExpanded = !_newsExpanded; return _newsExpanded; }
  function newsResetExpand() { _newsExpanded = false; }

  /** 历史公告页：展示全部往期公告；左上角返回公告主页 */
  function newsHistory() {
    const list = SDV_CONFIG.announcements || [];
    const items = list.map(noticeItem).join('');
    return pageHeader('历史公告', true, '#/news') +
      '<section class="card"><div class="card-head"><h2>往期公告</h2><span class="card-sub">共 ' + list.length + ' 条</span></div>' +
      (list.length ? '<div class="notice-list">' + items + '</div>'
                  : emptyState('暂无公告', '运营通知与版本更新公告将在此展示')) +
      '</section>';
  }

  /** 我的：游客资料卡 + 主题设置 + 我的社区数据 + 管理员预留 + 关于 */
  function mine() {
    const t = Store.getTheme();
    const me = (typeof CommunityAPI !== 'undefined') ? CommunityAPI.getProfile() : null;
    return pageHeader('我的', false) +
      '<button class="card account-card" data-action="open-profile-modal">' +
        '<span class="avatar px-avatar" data-size="md" style="background:' + esc(me ? me.color : '#6a8a5a') + '">' + esc(me ? me.avatar : '🧑‍🌾') + '</span>' +
        '<span class="account-text">' + esc(me ? me.nick : '星露谷村民') + '</span>' +
        '<span class="account-arrow">›</span>' +
      '</button>' +

      '<section class="card"><div class="card-head"><h2>我的社区</h2></div>' +
        '<button class="row-btn" data-route="#/mine-posts"><span>我的帖子</span><span>›</span></button>' +
        '<button class="row-btn" data-route="#/mine-likes"><span>我的点赞</span><span>›</span></button>' +
        '<button class="row-btn" data-route="#/mine-favorites"><span>我的收藏</span><span>›</span></button>' +
      '</section>' +

      '<section class="card"><div class="card-head"><h2>主题设置</h2></div>' +
        '<div class="setting-row">' +
          '<div><div class="setting-title">跟随系统主题</div><div class="setting-desc">开启后自动同步系统深浅色模式</div></div>' +
          '<label class="switch"><input type="checkbox" data-theme-follow' + (t.followSystem ? ' checked' : '') + '><span class="slider"></span></label>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div><div class="setting-title">手动主题</div><div class="setting-desc">手动切换时自动关闭「跟随系统」</div></div>' +
          '<div class="theme-switch-btns">' +
            '<button class="chip' + (!t.followSystem && t.manual === 'light' ? ' active' : '') + '" data-theme-manual="light">浅色</button>' +
            '<button class="chip' + (!t.followSystem && t.manual === 'dark' ? ' active' : '') + '" data-theme-manual="dark">深色</button>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="card"><div class="card-head"><h2>关于</h2></div>' +
        '<div class="setting-row"><div class="setting-title">版本</div><div>v' + esc(SDV_CONFIG.app.version) + '</div></div>' +
        '<button class="row-btn" data-action="check-update"><span>检查更新</span><span>›</span></button>' +
        '<button class="row-btn" data-action="open-admin"><span>管理后台（预留）</span><span>›</span></button>' +
      '</section>';
  }

  /** 快捷键编辑页：38 项勾选（上限 7） */
  function quickEdit() {
    const selected = Store.getSelectedNav();
    const items = SDV_CONFIG.modules.map((m) => {
      const on = selected.includes(m.key);
      return '<label class="check-item' + (on ? ' on' : '') + '">' +
        '<input type="checkbox" data-nav-check="' + m.key + '"' + (on ? ' checked' : '') + '>' +
        '<span class="check-box"></span><span class="check-label">' + esc(m.label) + '</span></label>';
    }).join('');
    return pageHeader('快捷键编辑', true) +
      '<section class="card"><div class="card-head"><h2>首页快捷功能</h2><span class="card-sub" id="nav-count">已选 ' + selected.length + '/' + SDV_CONFIG.quickNav.maxSelected + '</span></div>' +
      '<p class="setting-desc">最多勾选 ' + SDV_CONFIG.quickNav.maxSelected + ' 个，第 8 格固定「更多」。默认：村民、日历、计算器、筛选器。</p>' +
      '<div class="check-grid">' + items + '</div>' +
      '<div class="btn-group">' +
        '<button class="btn btn-primary" data-action="nav-save">保存</button>' +
        '<button class="btn" data-action="nav-reset">恢复默认</button>' +
      '</div></section>';
  }

  /** 模块占位页 ×38 */
  function modulePage(key) {
    const m = SDV_CONFIG.modules.find((x) => x.key === key);
    if (!m) return notFound();
    return pageHeader(m.label, true) +
      '<section class="card"><div class="module-placeholder">' +
        '<span class="tile-icon big" data-icon="' + m.key + '"><span class="tile-fallback">' + esc(m.label[0]) + '</span></span>' +
        '<h2>' + esc(m.label) + '</h2>' +
        '<p>模块内容建设中，二期填充详情</p>' +
        '<span class="tag">一期占位</span>' +
      '</div></section>';
  }

  /** 卡片占位页 ×4 */
  function cardPage(key) {
    const c = SDV_CONFIG.homeCards.find((x) => x.key === key);
    if (!c) return notFound();
    return pageHeader(c.title, true) +
      '<section class="card"><div class="module-placeholder">' +
        '<h2>' + esc(c.title) + '</h2>' +
        '<p>' + esc(c.desc) + '</p>' +
        '<span class="tag">一期占位</span>' +
      '</div></section>';
  }

  function notFound() {
    return pageHeader('页面不存在', true) +
      '<section class="card">' + emptyState('未找到该页面', '请从底部导航返回') + '</section>';
  }

  /* ---------- v2.0.0 社区页面（渲染全部委托 Community 模块，数据走 CommunityAPI） ---------- */
  function community() {
    return (typeof Community !== 'undefined') ? Community.renderCommunityList() : notFound();
  }
  function postDetail(param) {
    return (typeof Community !== 'undefined') ? Community.renderPostDetail(param) : notFound();
  }
  function messages() {
    return (typeof Community !== 'undefined') ? Community.renderMessages() : notFound();
  }
  function minePosts() {
    return (typeof Community !== 'undefined') ? Community.renderMinePosts() : notFound();
  }
  function mineLikes() {
    return (typeof Community !== 'undefined') ? Community.renderMineLikes() : notFound();
  }
  function mineFavorites() {
    return (typeof Community !== 'undefined') ? Community.renderMineFavorites() : notFound();
  }

  /** 搜索过滤（基础框架）：按 label/key 模糊匹配 */
  function filterModules(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    return SDV_CONFIG.modules.filter((m) =>
      m.label.toLowerCase().includes(q) || m.key.toLowerCase().includes(q)
    );
  }

  return {
    home, codex, search, news, newsHistory, mine, quickEdit, modulePage, cardPage,
    community, postDetail, messages, minePosts, mineLikes, mineFavorites,
    notFound, emptyState, filterModules, newsToggleMore, newsResetExpand,
  };
})();
