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
      (back ? '<button class="btn-back" data-action="nav-back" aria-label="返回">←</button>' : '') +
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
          '<div class="home-cards home-cards-sm">' + cards + '</div>' +
        '</div>' +
      '</section>' +
      (typeof Community !== 'undefined' ? Community.renderHomeBlock() : '');
  }

  /** 图鉴：物品分类分组排版（无顶部标题板块；分组标题 + 4 列正方形圆角卡片） */
  function codex() {
    const codexGroups = [
      { name: '生产', keys: ['crops', 'seeds', 'artisan', 'cooking', 'animalProducts', 'animals', 'farm', 'trees'] },
      { name: '工艺', keys: ['crafting', 'tools', 'materials', 'buildings'] },
      { name: '收集', keys: ['fish', 'foraging', 'minerals', 'artifacts', 'bundles', 'secretNotes', 'walnuts', 'achievements'] },
      { name: '战斗', keys: ['equipment', 'monsters', 'accessories'] },
      { name: '其他', keys: ['villagers', 'calendar', 'filter', 'calculator', 'weather', 'special', 'quests', 'furniture', 'wallpaper', 'flooring', 'hats', 'shirts', 'pants', 'areas', 'wallet'] },
    ];
    return codexGroups.map((g) =>
      '<div class="codex-group">' +
        '<h3 class="codex-group-title">' + esc(g.name) + '</h3>' +
        '<div class="codex-grid">' +
          g.keys.map((k) => {
            const m = SDV_CONFIG.modules.find((x) => x.key === k);
            return m ? tile(m, 'tile-codex') : '';
          }).join('') +
        '</div>' +
      '</div>'
    ).join('');
  }

  /** 搜索：搜索框 + 搜索按钮 + 结果区 */
  function search() {
    return '<section class="card search-area"><div class="search-bar">' +
      '<input id="search-input" type="search" placeholder="" aria-label="全局搜索">' +
      '<button type="button" id="search-btn" class="search-btn">搜索</button>' +
      '<div id="search-carousel" class="search-carousel" aria-hidden="true"></div>' +
      '</div>' +
      '<div id="search-panel" class="search-panel"></div>' +
      '<div id="search-result" class="search-result">' + searchEmptyHint() + '</div></section>';
  }

  /** 搜索空态：居中像素图标 + 小字文案（图标走 data-icon 通道，放同名图片自动替换） */
  function searchEmptyHint() {
    return '<div class="search-empty-hint">' +
      '<span class="search-empty-icon" data-icon="search-empty"><span class="search-empty-fallback">搜</span></span>' +
      '<p class="search-empty-text">来搜索感兴趣的内容吧～</p>' +
    '</div>';
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

  /** 我的：v2.4.0 个人主页（背景区/统计行/昵称简介/标签栏/编辑主页 + 底部保留主题设置/关于） */
  function mine() {
    return (typeof Community !== 'undefined') ? Community.renderMyProfile() : notFound();
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
  /* ---------- v2.4.0 社交页面（渲染委托 Community 模块） ---------- */
  function userPage(param) {
    return (typeof Community !== 'undefined') ? Community.renderUserHome(param) : notFound();
  }
  function chatPage(param) {
    return (typeof Community !== 'undefined') ? Community.renderChatWindow(param) : notFound();
  }
  function noticesPage(param) {
    return (typeof Community !== 'undefined') ? Community.renderNotices(param) : notFound();
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

  /* ---------- v2.4.2 设置页（主题设置迁移 + 账号退出板块） ---------- */
  function settingsPage() {
    return (typeof Community !== 'undefined') ? Community.renderSettings() : notFound();
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
    community, postDetail, messages, userPage, chatPage, noticesPage, settingsPage,
    minePosts, mineLikes, mineFavorites,
    notFound, emptyState, searchEmptyHint, filterModules, newsToggleMore, newsResetExpand,
  };
})();
