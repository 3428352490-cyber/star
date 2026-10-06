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
    messages: '<path d="M4 6 H20 V16 H12 L8 20 V16 H4 Z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="11" r="1"/><circle cx="16" cy="11" r="1"/>',
    mine: '<circle cx="12" cy="8" r="4"/><path d="M5.5 20 C5.5 15.5 8 13.5 12 13.5 C16 13.5 18.5 15.5 18.5 20"/>',
  };
  /** 底部导航图标图片（透明底 PNG；首页沿用 nav-home.png，其余 4 项替换为 assets 图标） */
  const NAV_IMG = {
    codex: 'assets/icon_book.png',
    search: 'assets/icon_search.png',
    messages: 'assets/icon_message.png',
    mine: 'assets/icon_user.png',
  };

  /** 按 tabs 数组渲染底部导航（5 Tab 均分，搜索居中；消息图标带未读角标） */
  function renderTabs() {
    const nav = $('#bottom-nav');
    if (!nav) return;
    nav.innerHTML = SDV_CONFIG.tabs.map((t) =>
      '<button class="nav-item' + (t.key === 'search' ? ' search' : '') + '" data-tab="' + t.key + '" data-route="#/' + t.key + '">' +
        '<span class="nav-icon">' + (t.key === 'home'
          ? '<img src="assets/nav-home.png" alt="" style="width:100%;height:100%;object-fit:contain">'
          : '<img src="' + (NAV_IMG[t.key] || '') + '" alt="" style="width:100%;height:100%;object-fit:contain">') +
          (t.key === 'messages' ? '<span class="nav-badge" data-nav-badge hidden></span>' : '') +
        '</span>' +
        '<span class="nav-label">' + esc(t.label) + '</span>' +
      '</button>'
    ).join('');
    updateNavBadge();
  }

  /**
   * 消息 Tab 未读角标：统计 notices 中未读条数（CommunityAPI.unreadCount）。
   * 进入消息页 / 全部已读 / 刷新后实时更新；0 条时隐藏。
   */
  function updateNavBadge() {
    const badge = document.querySelector('[data-nav-badge]');
    if (!badge) return;
    const n = (typeof CommunityAPI !== 'undefined' && CommunityAPI.unreadCount) ? CommunityAPI.unreadCount() : 0;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = n <= 0;
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

  /** 渲染当前路由页面 + 挂载图标 + 搜索页挂载搜索面板 + 刷新消息角标 */
  function render() {
    if (typeof Router !== 'undefined') Router.handle();
    mountIcons($('#page-container'));
    if (typeof SearchUI !== 'undefined' && location.hash.indexOf('#/search') === 0) SearchUI.mount();
    updateNavBadge();
  }

  /* ---------- 全局事件（事件委托） ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || typeof t.closest !== 'function') return;

    // ① 动作优先于路由：帖子卡片内的点赞/收藏/回复等按钮先响应，避免同时触发卡片跳转
    const actionEl = t.closest('[data-action]');
    if (actionEl) {
      handleAction(actionEl.dataset.action, t);
      return;
    }
    // ② 路由跳转
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

  /* ---------- 软键盘适配（移动端）：输入框聚焦时隐藏底部导航，避免键盘遮挡输入区 ---------- */
  document.addEventListener('focusin', (e) => {
    if (e.target && typeof e.target.matches === 'function' && e.target.matches('input, textarea')) {
      document.body.classList.add('kbd-open');
    }
  });
  document.addEventListener('focusout', (e) => {
    if (e.target && typeof e.target.matches === 'function' && e.target.matches('input, textarea')) {
      document.body.classList.remove('kbd-open');
    }
  });

  /* ---------- 动作分发 ---------- */
  /** 从事件目标向上查找最近匹配选择器的元素（替代 $(target)，target 是元素不是选择器） */
  function closestOf(el, sel) {
    return el && typeof el.closest === 'function' ? el.closest(sel) : null;
  }

  function handleAction(action, target) {
    const container = $('#page-container');
    switch (action) {
      case 'open-profile-modal':
        openProfileModal();
        break;
      case 'open-admin':
        Modal.show({
          title: '管理后台（预留）',
          body: '<p>管理员后台用于查看全部帖子（含私密帖）与内容审核。</p><p class="setting-desc">当前为 Mock 阶段预留入口，后续对接后端后开放。</p>',
          actions: [{ label: '知道了', cls: 'btn-primary' }],
        });
        break;
      case 'refresh-posts':
        if (typeof Community !== 'undefined') Community.refreshBlock(container ? container.querySelector('.masonry-feed') : null);
        break;
      case 'open-post-modal':
        if (typeof Community !== 'undefined') Community.openPostModal(null);
        break;
      case 'edit-post': {
        const post = CommunityAPI.fetchPostDetail(closestOf(target, '[data-post]').dataset.post);
        if (post) Community.openPostModal(post);
        else Toast.show('帖子不存在或无权编辑');
        break;
      }
      case 'delete-post': {
        const id = closestOf(target, '[data-post]').dataset.post;
        Modal.show({
          title: '删除帖子',
          body: '<p>确定删除这篇帖子吗？删除后不可恢复。</p>',
          actions: [
            { label: '取消', cls: 'btn-text', onClick: () => {} },
            { label: '删除', cls: 'btn-primary', onClick: () => {
              CommunityAPI.deletePost(id);
              Toast.show('已删除');
              Modal.close();
              render();
            } },
          ],
        });
        break;
      }
      case 'post-like': {
        const btn = closestOf(target, '[data-action="post-like"]');
        const id = btn ? btn.dataset.post : null;
        if (!id) break;
        const r = CommunityAPI.toggleLike(id);
        if (r && r.ok) applyLikeState(btn, r.liked, r.count);
        else Toast.show('帖子不存在或无权查看');
        break;
      }
      case 'post-fav': {
        const btn = closestOf(target, '[data-action="post-fav"]');
        const id = btn ? btn.dataset.post : null;
        if (!id) break;
        const r = CommunityAPI.toggleFavorite(id);
        if (r && r.ok) applyFavState(btn, r.faved, r.count);
        else Toast.show('帖子不存在或无权查看');
        break;
      }
      case 'post-comment': {
        const btn = closestOf(target, '[data-action="post-comment"]');
        const id = btn ? btn.dataset.post : null;
        const input = $('#comment-input');
        const text = input ? input.value : '';
        // 楼中楼：若当前处于「回复 @xxx」状态且目标属于本帖，则作为楼中楼回复提交
        const rt = (typeof Community !== 'undefined' && Community.getReplyTarget) ? Community.getReplyTarget() : null;
        const parentId = (rt && rt.postId === id) ? rt.commentId : null;
        const c = CommunityAPI.addComment(id, text, parentId);
        if (c) {
          Toast.show(parentId ? '回复已发布' : '评论已发布');
          if (typeof Community !== 'undefined' && Community.clearReplyTarget) Community.clearReplyTarget();
          render();
        } else Toast.show('请输入评论内容');
        break;
      }
      case 'post-comment-scroll': {
        const input = $('#comment-input');
        if (input) input.focus();
        break;
      }
      case 'comment-reply': {
        // 点击「回复」：记录楼中楼回复目标并聚焦评论输入框（不整页重渲染）
        const btn = closestOf(target, '[data-action="comment-reply"]');
        if (!btn || typeof Community === 'undefined' || !Community.setReplyTarget) break;
        Community.setReplyTarget({ postId: btn.dataset.post, commentId: btn.dataset.comment, nick: btn.dataset.nick });
        const input = $('#comment-input');
        if (input) {
          input.placeholder = '回复 @' + btn.dataset.nick + '：';
          input.focus();
        }
        break;
      }
      case 'chat-send': {
        // 消息页机器人聊天：发送 → 追加气泡并滚到底部，机器人延迟应答
        const input = $('#chat-input');
        const text = input ? input.value : '';
        const m = CommunityAPI.sendChat(text);
        if (m) {
          render();
          const win = $('#chat-window');
          if (win) win.scrollTop = win.scrollHeight;
        } else Toast.show('请输入聊天内容');
        break;
      }
      case 'mark-all-read':
        CommunityAPI.markAllRead();
        Toast.show('已全部标记为已读');
        render();
        break;
      case 'news-toggle-more':
        if (typeof Pages !== 'undefined' && Pages.newsToggleMore) { Pages.newsToggleMore(); render(); }
        break;
      case 'check-update':
        // 【检查更新】备用手动入口：点击执行完整云端版本比对（自动检测同样调用 checkUpdate）
        if (typeof Updater !== 'undefined' && Updater.checkUpdate) Updater.checkUpdate(true);
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

  /**
   * 点赞按钮局部刷新：切换填充/空心样式（❤ 实心红 / ♡ 空心）+ 计数，
   * 不整页重载，保留阅读位置（首页瀑布流与详情页按钮共用）。
   */
  function applyLikeState(btn, liked, count) {
    if (!btn) return;
    btn.classList.toggle('on', liked);
    btn.innerHTML = (liked ? '❤' : '♡') + ' <span data-like-count>' + (count || 0) + '</span>';
  }

  /** 收藏按钮局部刷新：切换填充/空心样式（⭐ 实心黄 / ☆ 空心）+ 计数 */
  function applyFavState(btn, faved, count) {
    if (!btn) return;
    btn.classList.toggle('on', faved);
    btn.innerHTML = (faved ? '⭐' : '☆') + ' <span data-fav-count>' + (count || 0) + '</span>';
  }

  /** 我的页：游客资料弹窗（昵称 / 像素头像） */
  function openProfileModal() {
    const me = CommunityAPI.getProfile();
    const emojis = ['🧑‍🌾', '👩‍🌾', '🧔', '👩‍🎨', '🧑‍🎤'];
    const body =
      '<div class="post-form">' +
        '<label class="form-label">昵称</label>' +
        '<input id="profile-nick" type="text" maxlength="12" value="' + esc(me.nick) + '">' +
        '<label class="form-label">像素头像</label>' +
        '<div class="avatar-picker">' + emojis.map((e) =>
          '<button class="px-avatar" data-size="md" data-avatar="' + e + '" style="background:' + esc(me.color) + '">' + e + '</button>'
        ).join('') + '</div>' +
      '</div>';
    Modal.show({
      title: '个人资料',
      body,
      actions: [
        { label: '取消', cls: 'btn-text', onClick: () => {} },
        { label: '保存', cls: 'btn-primary', onClick: () => {
          const nick = ($('#profile-nick') || {}).value || '';
          const picked = document.querySelector('.avatar-picker .px-avatar[data-selected]');
          CommunityAPI.setProfile({ nick: String(nick).trim() || me.nick, avatar: picked ? picked.dataset.avatar : me.avatar });
          Toast.show('资料已保存');
          Modal.close();
          render();
        } },
      ],
    });
    // 头像选择态
    $$('.avatar-picker .px-avatar').forEach((el) => {
      if (el.dataset.avatar === me.avatar) el.setAttribute('data-selected', '');
      el.addEventListener('click', () => {
        $$('.avatar-picker .px-avatar').forEach((x) => x.removeAttribute('data-selected'));
        el.setAttribute('data-selected', '');
      });
    });
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

  /* ---------- 搜索（站内全量检索：首页功能 + 图鉴条目 + 帖子主题，按来源分组展示） ---------- */
  function handleSearch(q) {
    const box = $('#search-result');
    if (!box) return;
    if (typeof Pages === 'undefined') return;
    const query = (q || '').trim().toLowerCase();
    if (!query) {
      // 空查询：显示搜索空态（图标 + 提示文案）
      box.innerHTML = (typeof Pages.searchEmptyHint === 'function')
        ? Pages.searchEmptyHint()
        : Pages.emptyState('输入关键词，检索全部词条', '一期为基础检索框架，全量词条二期接入');
      mountIcons(box);
      return;
    }

    // ① 首页功能卡片（homeCards：地图 / 指南 / 计算器 / 模组）
    const homeHits = (SDV_CONFIG.homeCards || []).filter((c) =>
      (c.title || '').toLowerCase().includes(query) ||
      (c.desc || '').toLowerCase().includes(query) ||
      (c.key || '').toLowerCase().includes(query)
    );

    // ② 图鉴条目（modules，复用既有 filterModules 模糊匹配）
    const codexHits = Pages.filterModules(query);

    // ③ 帖子主题（社区帖，按标题匹配）
    let postHits = [];
    try {
      if (typeof CommunityAPI !== 'undefined' && typeof CommunityAPI.fetchPosts === 'function') {
        postHits = CommunityAPI.fetchPosts().filter((p) => (p.title || '').toLowerCase().includes(query));
      }
    } catch (e) { postHits = []; }

    const total = homeHits.length + codexHits.length + postHits.length;
    if (!total) {
      box.innerHTML = Pages.emptyState('未找到相关词条', '试试其他关键词，或去图鉴与社区逛逛');
      mountIcons(box);
      return;
    }

    // 按来源分组渲染（区分：首页功能 / 图鉴条目 / 帖子主题）
    let html = '<div class="search-hit-list">';
    if (homeHits.length) {
      html += '<div class="search-hit-group"><div class="search-hit-group-title">首页功能</div>' +
        homeHits.map((c) =>
          '<button class="search-hit" data-route="#/home">' +
            '<span class="tile-icon sm" data-icon="' + esc(c.key) + '"><span class="tile-fallback">' + esc(c.title[0]) + '</span></span>' +
            esc(c.title) + '<span class="tag">首页功能</span>' +
          '</button>'
        ).join('') + '</div>';
    }
    if (codexHits.length) {
      html += '<div class="search-hit-group"><div class="search-hit-group-title">图鉴条目</div>' +
        codexHits.map((m) =>
          '<button class="search-hit" data-route="#/module/' + esc(m.key) + '">' +
            '<span class="tile-icon sm" data-icon="' + esc(m.key) + '"><span class="tile-fallback">' + esc(m.label[0]) + '</span></span>' +
            esc(m.label) + '<span class="tag">图鉴条目</span>' +
          '</button>'
        ).join('') + '</div>';
    }
    if (postHits.length) {
      html += '<div class="search-hit-group"><div class="search-hit-group-title">帖子主题</div>' +
        postHits.map((p) =>
          '<button class="search-hit" data-route="#/post/' + esc(p.id) + '">' +
            '<span class="tile-icon sm"><span class="tile-fallback">帖</span></span>' +
            esc(p.title) + '<span class="tag">帖子主题</span>' +
          '</button>'
        ).join('') + '</div>';
    }
    html += '</div>';
    box.innerHTML = html;
    mountIcons(box);
  }

  /* ---------- 入口 ---------- */
  function init() {
    Store.load();
    Theme.apply();
    renderTabs();
    render();
    // 前端复盘日志：页面初始化事件
    if (typeof ReviewLog !== 'undefined' && ReviewLog.log) {
      ReviewLog.log('page-init', { status: 'success', message: '页面初始化完成', extra: { version: SDV_CONFIG.app.version } });
    }
    // 页面加载完成执行简易 bug 自检（异常仅输出控制台，不打扰用户）
    if (typeof SelfCheck !== 'undefined' && SelfCheck.run) SelfCheck.run();
    // 页面载入完成自动执行版本检测：云端更高弹更新弹窗；版本一致/网络失败静默处理
    if (typeof Updater !== 'undefined' && Updater.checkUpdate) Updater.checkUpdate(false);
    // 定时轮询：前台运行、页面后台暂停（回到前台立即补检一次）
    if (typeof Updater !== 'undefined' && Updater.startPolling) Updater.startPolling();
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
