'use strict';

/**
 * ============================================================
 * 社区 UI 模块（v2.0.0 老乡有话说）
 * 纯字符串渲染 + 事件委托（与 Pages/App 同一模式）。
 * 所有数据操作均调用 CommunityAPI，页面不直接写数据逻辑；
 * 后续替换数据层时本模块无需改动。
 * ============================================================ */
const Community = (() => {
  /* ---------- 头像 / 封面渲染 ---------- */
  /** attrs：附加到头像元素的 data 属性字符串（如 'data-avatar-user="v-robin"'，用于全局头像跳转） */
  function avatarOf(v, size, attrs) {
    return '<span class="px-avatar" style="background:' + esc(v.color) + '" data-size="' + (size || 'md') + '"' + (attrs ? ' ' + attrs : '') + '>' + esc(v.avatar) + '</span>';
  }
  function coverOf(post) {
    const img = (post.images && post.images.length) ? post.images[0] : null;
    if (img) {
      return '<div class="post-cover" style="background:' + esc(img.color) + '"><span>' + esc(img.emoji) + '</span></div>';
    }
    return '<div class="post-cover post-cover-empty"><span>🖼️</span></div>'; // 默认像素占位图
  }
  function imagesHtml(post) {
    const imgs = post.images || [];
    if (!imgs.length) return '';
    return '<div class="post-images">' + imgs.map((img) =>
      '<div class="post-img" style="background:' + esc(img.color) + '"><span>' + esc(img.emoji) + '</span></div>'
    ).join('') + '</div>';
  }

  function villagerOf(post) {
    // 作者可能是游客或 Mock 村民
    const me = CommunityAPI.getProfile();
    if (post.authorId === me.id) return { id: me.id, nick: me.nick, avatar: me.avatar, color: me.color };
    return CommunityAPI.villagerById(post.authorId) || { id: post.authorId, nick: '村民', avatar: '🧑‍🌾', color: '#6a8a5a' };
  }

  /* ---------- v2.4.0 社交：头像加号关注按钮（帖子卡片 / 横向头像栏共用） ---------- */
  function followBtnHtml(targetId, cls) {
    const st = CommunityAPI.followStateOf(targetId);
    const on = st.following ? ' on' : '';
    return '<button class="avatar-follow' + (cls ? ' ' + cls : '') + on + '" data-action="follow" data-user="' + esc(targetId) + '" title="' + (st.following ? '已关注' : '关注') + '">' +
      (st.following ? '✓' : '+') + '</button>';
  }

  /** 作者是否为 Mock 村民（游客自己不显示关注按钮） */
  function isVillagerUser(id) {
    return !!CommunityAPI.villagerById(id);
  }

  function timeText(ts) {
    const diff = Date.now() - ts;
    if (diff < 3600e3) return Math.max(1, Math.round(diff / 60e3)) + ' 分钟前';
    if (diff < 86400e3) return Math.round(diff / 3600e3) + ' 小时前';
    return Math.round(diff / 86400e3) + ' 天前';
  }

  const VISIBILITY_LABEL = { public: '全部可见', partial: '部分可见', private: '自己可见' };

  /**
   * 瀑布流帖子卡片（首页双列瀑布流，v2.3.0 骨架）
   * 卡片从上至下：帖子图片预览 → 帖子标题 → 作者昵称 → 空心爱心点赞按钮 + 点赞数字；
   * 卡片不等高自适应（标题 1~2 行高度自然差异，双列瀑布流排布）。
   * 点击卡片进入详情；点赞按钮独立响应（事件委托中 action 优先于路由）。
   */
  function postCard(post) {
    const author = villagerOf(post);
    const cover = coverOf(post);
    const liked = CommunityAPI.fetchMyLikes().some((p) => p.id === post.id);
    const isV = isVillagerUser(author.id);
    return '<article class="masonry-card" data-route="#/post/' + esc(post.id) + '">' +
      '<div class="masonry-cover">' + cover + '</div>' +
      '<div class="masonry-body">' +
        '<h3 class="masonry-title">' + esc(post.title) + '</h3>' +
        '<div class="masonry-meta">' +
          '<div class="author-cell">' +
            '<span class="author-avatar" data-avatar-user="' + esc(author.id) + '" title="查看主页">' + avatarOf(author, 'sm') + '</span>' +
            (isV ? followBtnHtml(author.id, 'mini') : '') +
          '</div>' +
          '<span class="post-nick" data-route="#/user/' + esc(author.id) + '">' + esc(author.nick) + '</span>' +
          '<button class="masonry-like' + (liked ? ' on' : '') + '" data-action="post-like" data-post="' + esc(post.id) + '" title="点赞">' +
            (liked ? '❤' : '♡') + '<span data-like-count>' + (post.likes || 0) + '</span>' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  /* ============================================================
   * 首页【老乡有话说】板块（双列瀑布流 + 刷新 / 发布 / 查看更多）
   * ============================================================ */
  function renderHomeBlock() {
    const posts = CommunityAPI.fetchPosts().slice(0, 8);
    const list = posts.length
      ? '<div class="masonry-feed">' + posts.map(postCard).join('') + '</div>'
      : '<p class="empty-sub">还没有帖子，来发第一条吧</p>';
    return '<section class="card community-block">' +
      '<div class="card-head community-head">' +
        '<button class="pixel-btn refresh-btn" data-action="refresh-posts" title="刷新帖子列表">↻</button>' +
        '<h2>老乡有话说</h2>' +
        '<button class="pixel-btn publish-btn" data-action="open-post-modal" title="发布新帖">✏️</button>' +
      '</div>' +
      list +
      '<button class="btn btn-primary see-more-btn" data-route="#/community">查看更多帖子 ›</button>' +
    '</section>';
  }

  /** 刷新瀑布流帖子列表（重新拉取并按时间倒序渲染） */
  function refreshBlock(el) {
    if (!el) return;
    const fresh = CommunityAPI.fetchPosts().slice(0, 8);
    el.innerHTML = fresh.length
      ? '<div class="masonry-feed">' + fresh.map(postCard).join('') + '</div>'
      : '<p class="empty-sub">还没有帖子，来发第一条吧</p>';
    Toast.show('帖子已刷新');
  }

  /* ============================================================
   * 社区列表页（查看更多帖子）
   * ============================================================ */
  function renderCommunityList() {
    const posts = CommunityAPI.fetchPosts();
    return '<header class="page-header"><button class="btn-back" data-action="nav-back" aria-label="返回">←</button>' +
      '<h1>老乡有话说</h1></header>' +
      '<section class="card"><div class="card-head"><h2>全部帖子</h2><span class="card-sub">共 ' + posts.length + ' 条</span></div>' +
      (posts.length ? '<div class="masonry-feed">' + posts.map(postCard).join('') + '</div>'
        : '<p class="empty-sub">还没有帖子</p>') +
      '</section>';
  }

  /* ============================================================
   * 帖子详情页（v2.3.0 骨架新布局）
   * 卡片从上至下：作者头像+昵称+发布时间 → 右上角黄色「全部可见」标签 →
   * 标题 → 大图 → 正文 → 多图 → 横向点赞/收藏/评论按钮组（点赞填红、收藏填黄）
   * ============================================================ */
  function renderPostDetail(id) {
    const post = CommunityAPI.fetchPostDetail(id);
    if (!post) {
      return '<header class="page-header"><button class="btn-back" data-action="nav-back">←</button><h1>帖子详情</h1></header>' +
        '<section class="card"><p class="empty-sub">帖子不存在或无权查看</p></section>';
    }
    const author = villagerOf(post);
    const me = CommunityAPI.getProfile();
    const liked = CommunityAPI.fetchMyLikes().some((p) => p.id === post.id);
    const faved = CommunityAPI.fetchMyFavorites().some((p) => p.id === post.id);
    const comments = CommunityAPI.fetchComments(id);       // 扁平列表（一级 + 楼中楼）
    const total = CommunityAPI.countComments(id);          // 评论总数 = 一级 + 楼中楼
    const canEdit = CommunityAPI.canEdit(post, me.id);
    // 楼中楼回复目标：由 App 点击「回复」设置；目标属于本帖时输入框显示回复态
    const rt = getReplyTarget();
    const replyPlaceholder = (rt && rt.postId === id) ? '回复 @' + rt.nick + '：' : '说点什么…';

    return '<header class="page-header"><button class="btn-back" data-action="nav-back">←</button><h1>帖子详情</h1></header>' +
      '<section class="card post-detail">' +
        '<div class="post-detail-author">' +
          '<span class="author-avatar lg" data-avatar-user="' + esc(author.id) + '" title="查看主页">' + avatarOf(author, 'lg') + '</span>' +
          '<div data-route="#/user/' + esc(author.id) + '" style="cursor:pointer"><div class="post-nick">' + esc(author.nick) + '</div>' +
          '<span class="post-time">' + timeText(post.createdAt) + '</span></div>' +
          '<span class="tag">' + VISIBILITY_LABEL[post.visibility] + '</span>' +  // 右上角黄色「全部可见」
        '</div>' +
        '<h2 class="post-detail-title">' + esc(post.title) + '</h2>' +
        '<div class="post-cover post-detail-cover">' + coverOf(post) + '</div>' +
        '<p class="post-detail-body">' + esc(post.body) + '</p>' +
        imagesHtml(post) +
        '<div class="post-detail-actions">' +
          '<button class="pixel-btn act-btn like-btn' + (liked ? ' on' : '') + '" data-action="post-like" data-post="' + esc(post.id) + '">' +
            (liked ? '❤' : '♡') + ' <span data-like-count>' + (post.likes || 0) + '</span></button>' +
          '<button class="pixel-btn act-btn fav-btn' + (faved ? ' on' : '') + '" data-action="post-fav" data-post="' + esc(post.id) + '">' +
            (faved ? '⭐' : '☆') + ' <span data-fav-count>' + (post.favorites || 0) + '</span></button>' +
          '<button class="pixel-btn act-btn" data-action="post-comment-scroll">💬 <span data-comment-count>' + (post.comments || 0) + '</span></button>' +
          (canEdit ? '<button class="pixel-btn act-btn" data-action="edit-post" data-post="' + esc(post.id) + '">✏️ 编辑</button>' : '') +
          (canEdit ? '<button class="pixel-btn act-btn danger" data-action="delete-post" data-post="' + esc(post.id) + '">🗑️ 删除</button>' : '') +
        '</div>' +
      '</section>' +
      commentSection(id, comments, total, replyPlaceholder);
  }

  /* ---------- 评论区（标题「评论」+ 右侧总条数；一级评论 + 楼中楼回复；底部输入框 + 红色发表按钮） ---------- */
  function commentSection(postId, comments, total, replyPlaceholder) {
    const me = CommunityAPI.getProfile();
    const topLevel = comments.filter((c) => !c.parentId);            // 一级评论
    const repliesOf = (cid) => comments.filter((c) => c.parentId === cid); // 楼中楼回复
    const rows = topLevel.length ? topLevel.map((c) => {
      const cv = commentAuthor(c, me);
      const replies = repliesOf(c.id);
      return '<div class="comment-item" data-comment="' + esc(c.id) + '">' +
        avatarOf(cv, 'sm', 'data-avatar-user="' + esc(cv.id) + '"') +
        '<div class="comment-main"><div class="comment-head"><span class="post-nick">' + esc(cv.nick) + '</span>' +
          '<span class="post-time">' + timeText(c.createdAt) + '</span></div>' +
        '<p>' + esc(c.text) + '</p>' +
        '<button class="reply-btn" data-action="comment-reply" data-post="' + esc(postId) + '" data-comment="' + esc(c.id) + '" data-nick="' + esc(cv.nick) + '">回复</button>' +
        (replies.length ? '<div class="comment-replies">' + replies.map((r) => {
          const rv = commentAuthor(r, me);
          return '<div class="comment-item reply-item" data-comment="' + esc(r.id) + '">' +
            avatarOf(rv, 'sm', 'data-avatar-user="' + esc(rv.id) + '"') +
            '<div class="comment-main"><div class="comment-head"><span class="post-nick">' + esc(rv.nick) + '</span>' +
              '<span class="post-time">' + timeText(r.createdAt) + '</span></div>' +
            '<p>' + esc(r.text) + '</p></div></div>';
        }).join('') + '</div>' : '') +
      '</div></div>';
    }).join('') : '<p class="empty-sub">还没有评论</p>';

    return '<section class="card comment-section">' +
      '<div class="card-head"><h2>评论</h2><span class="card-sub">' + total + ' 条</span></div>' +
      '<div class="comment-list">' + rows + '</div>' +
      '<div class="comment-input-row">' +
        '<input id="comment-input" type="text" placeholder="' + esc(replyPlaceholder) + '" maxlength="120">' +
        '<button class="btn btn-primary" data-action="post-comment" data-post="' + esc(postId) + '">发表</button>' +
      '</div>' +
    '</section>';
  }

  /** 评论作者：游客本人或 Mock 村民 */
  function commentAuthor(c, me) {
    if (c.authorId === me.id) return { id: me.id, nick: me.nick, avatar: me.avatar, color: me.color };
    return CommunityAPI.villagerById(c.authorId) || { id: c.authorId, nick: '村民', avatar: '🧑‍🌾', color: '#6a8a5a' };
  }

  /* ---------- 楼中楼回复目标（跨渲染记忆，由 App 点击「回复」设置/清除） ---------- */
  let _replyTarget = null;   // { postId, commentId, nick }
  function setReplyTarget(t) { _replyTarget = t; return _replyTarget; }
  function getReplyTarget() { return _replyTarget; }
  function clearReplyTarget() { _replyTarget = null; }

  /* ============================================================
   * 发帖 / 编辑弹窗（复用同一弹窗，编辑时预填）
   * ============================================================ */
  function openPostModal(post) {
    const isEdit = !!post;
    const villagers = CommunityAPI.__villagers();
    const selected = isEdit ? (post.allowedUsers || []) : [];
    const body =
      '<div class="post-form">' +
        '<label class="form-label">标题</label>' +
        '<input id="post-title" type="text" maxlength="40" placeholder="起个标题吧" value="' + esc(isEdit ? post.title : '') + '">' +
        '<label class="form-label">正文</label>' +
        '<textarea id="post-body" rows="4" maxlength="500" placeholder="写点什么…">' + esc(isEdit ? post.body : '') + '</textarea>' +
        '<label class="form-label">图片（最多 6 张，第一张作封面）</label>' +
        '<div class="post-img-picker">' +
          '<label class="pixel-btn upload-btn">📷 上传<input id="post-images" type="file" accept="image/*" multiple hidden></label>' +
          '<div id="post-img-preview" class="post-img-preview"></div>' +
        '</div>' +
        '<label class="form-label">可见范围</label>' +
        '<div class="vis-radio">' +
          ['public', 'partial', 'private'].map((k) =>
            '<label class="vis-option' + ((!isEdit && k === 'public') || (isEdit && post.visibility === k) ? ' on' : '') + '">' +
              '<input type="radio" name="post-vis" value="' + k + '"' + (((!isEdit && k === 'public') || (isEdit && post.visibility === k)) ? ' checked' : '') + ' data-vis="' + k + '">' +
              '<span class="vis-label">' + VISIBILITY_LABEL[k] + '</span>' +
            '</label>'
          ).join('') +
        '</div>' +
        '<div id="partial-picker" class="partial-picker" style="' + ((isEdit && post.visibility === 'partial') ? '' : 'display:none') + '">' +
          '<p class="setting-desc">选择可见的村民（至少 1 位）</p>' +
          '<div class="villager-tags">' + villagers.map((v) =>
            '<label class="vg-tag' + (selected.includes(v.id) ? ' on' : '') + '">' +
              '<input type="checkbox" data-vg="' + v.id + '"' + (selected.includes(v.id) ? ' checked' : '') + '>' +
              avatarOf(v, 'sm') + esc(v.nick) + '</label>'
          ).join('') + '</div>' +
        '</div>' +
      '</div>';
    Modal.show({
      title: isEdit ? '编辑帖子' : '发布新帖',
      body,
      actions: [
        { label: '取消', cls: 'btn-text', onClick: () => {} },
        { label: isEdit ? '保存' : '发布', cls: 'btn-primary', onClick: () => submitPostForm(isEdit, post) },
      ],
    });
    // 图片本地预览（FileReader，不上传云端）
    const fileInput = document.getElementById('post-images');
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files || []).slice(0, 6);
        const preview = document.getElementById('post-img-preview');
        if (!preview) return;
        preview.innerHTML = '';
        files.forEach((f) => {
          if (!/^image\//.test(f.type)) return;
          const reader = new FileReader();
          reader.onload = (e) => {
            const box = document.createElement('div');
            box.className = 'post-img-preview-item';
            box.style.background = '#6a7a5a';
            box.innerHTML = '<img src="' + e.target.result + '" alt="">';
            preview.appendChild(box);
          };
          reader.readAsDataURL(f);
        });
      });
    }
    // 可见范围联动：选「部分可见」时显示指定用户勾选区
    const radios = document.querySelectorAll('input[name="post-vis"]');
    radios.forEach((r) => {
      r.addEventListener('change', () => {
        const box = document.getElementById('partial-picker');
        if (box) box.style.display = (r.value === 'partial' && r.checked) ? '' : 'none';
      });
    });
  }

  function submitPostForm(isEdit, post) {
    const title = (document.getElementById('post-title') || {}).value || '';
    const body = (document.getElementById('post-body') || {}).value || '';
    if (!String(title).trim()) { Toast.show('请填写标题'); return; }
    if (!String(body).trim()) { Toast.show('请填写正文'); return; }
    let vis = 'public';
    const checkedVis = document.querySelector('input[name="post-vis"]:checked');
    if (checkedVis) vis = checkedVis.value;
    let allowedUsers = [];
    if (vis === 'partial') {
      allowedUsers = Array.from(document.querySelectorAll('input[data-vg]:checked')).map((i) => i.dataset.vg);
      if (!allowedUsers.length) { Toast.show('部分可见需至少选择 1 位村民'); return; }
    }
    // 图片：优先使用已预览的 dataURL（第一张作封面）
    const imgs = Array.from(document.querySelectorAll('#post-img-preview img')).map((img) => img.src);
    const pixImages = imgs.map((src) => ({ emoji: '🖼️', color: '#6a7a5a', src }));
    const payload = { title, body, images: pixImages, visibility: vis, allowedUsers };

    if (isEdit) {
      const updated = CommunityAPI.updatePost(post.id, payload);
      if (updated) Toast.show('已保存修改');
    } else {
      const created = CommunityAPI.createPost(payload);
      if (created) Toast.show('发布成功！村民正在赶来互动…');
    }
    Modal.close();
    if (typeof App !== 'undefined' && App.render) App.render();
  }

  /* ============================================================
   * 消息页（v2.4.0：顶部栏 + 横向头像栏 + 通知双入口 + 私聊会话列表）
   * ============================================================ */
  function renderMessages() {
    const followUnread = CommunityAPI.unreadByCategory('follow');
    const interactUnread = CommunityAPI.unreadByCategory('interact');
    const convs = CommunityAPI.fetchConversations();

    // ① 顶部栏：搜索 / 标题 / 创建会话（搜索框默认隐藏，点🔍展开）
    const topbar =
      '<div class="msg-topbar">' +
        '<button class="pixel-btn" data-action="msg-search" title="搜索会话">🔍</button>' +
        '<h1>消息</h1>' +
        '<button class="pixel-btn" data-action="new-conversation" title="发起会话">＋</button>' +
      '</div>' +
      '<div class="msg-search-box" id="msg-search-box" hidden>' +
        '<input id="msg-search-input" type="text" placeholder="搜索会话或联系人…" maxlength="30">' +
      '</div>';

    // ② 通知双入口：新关注我的 / 互动消息（各带未读数字角标）
    const entries =
      '<button class="notice-entry" data-route="#/notices/follow">' +
        '<span class="notice-entry-icon">➕</span>' +
        '<span class="notice-entry-text">新关注我的</span>' +
        (followUnread ? '<span class="badge-num">' + followUnread + '</span>' : '') +
      '</button>' +
      '<button class="notice-entry" data-route="#/notices/interact">' +
        '<span class="notice-entry-icon">💬</span>' +
        '<span class="notice-entry-text">互动消息</span>' +
        (interactUnread ? '<span class="badge-num">' + interactUnread + '</span>' : '') +
      '</button>';

    // ③ 私聊会话列表：头像 / 昵称 / 消息预览 / 时间 / 未读红点数字角标
    const convRows = convs.length ? convs.map((c) =>
      '<button class="conv-item" data-route="#/chat/' + esc(c.peerId) + '">' +
        avatarOf(c.peer, 'md', 'data-avatar-user="' + esc(c.peerId) + '"') +
        '<div class="conv-main">' +
          '<div class="conv-head"><span class="conv-nick">' + esc(c.peer.nick) + '</span>' +
          '<span class="post-time">' + timeText(c.time) + '</span></div>' +
          '<div class="conv-preview">' + esc(c.preview) + '</div>' +
        '</div>' +
        (c.unread ? '<span class="badge-num badge-red">' + (c.unread > 99 ? '99+' : c.unread) + '</span>' : '') +
      '</button>'
    ).join('') : '<p class="empty-sub">还没有会话，点右上角 ＋ 发起私聊</p>';

    return topbar +
      '<section class="card"><div class="card-head"><h2>通知</h2></div><div class="notice-entries">' + entries + '</div></section>' +
      '<section class="card"><div class="card-head"><h2>私聊</h2><span class="card-sub">' + convs.length + ' 个会话</span></div>' +
        '<div class="conv-list">' + convRows + '</div>' +
      '</section>';
  }

  /* ---------- 通知分类列表（新关注我的 / 互动消息） ---------- */
  function renderNotices(category) {
    const cat = category === 'follow' ? 'follow' : 'interact';
    const title = cat === 'follow' ? '新关注我的' : '互动消息';
    const list = CommunityAPI.fetchNotices(cat);
    const unread = CommunityAPI.unreadByCategory(cat);
    return '<header class="page-header"><button class="btn-back" data-action="nav-back" aria-label="返回">←</button>' +
      '<h1>' + title + '</h1></header>' +
      '<section class="card"><div class="card-head"><h2>' + title + '</h2>' +
        (unread ? '<button class="notice-more" data-action="mark-cat-read" data-cat="' + cat + '">全部已读</button>' : '<span class="card-sub">已全部读完</span>') +
      '</div>' +
      (list.length ? '<div class="message-list">' + list.map((m) => {
        const v = CommunityAPI.villagerById(m.villagerId) || { id: m.villagerId, nick: '村民', avatar: '🧑‍🌾', color: '#6a8a5a' };
        const route = m.postId ? ' data-route="#/post/' + esc(m.postId) + '"' : '';
        return '<div class="message-item' + (m.read ? ' read' : ' unread') + '"' + route + '>' +
          avatarOf(v, 'sm', 'data-avatar-user="' + esc(v.id) + '"') +
          '<div class="message-main"><div class="message-text">' + esc(m.text) + '</div>' +
          '<span class="post-time">' + timeText(m.createdAt) + '</span></div>' +
          (m.read ? '' : '<span class="msg-dot"></span>') +
        '</div>';
      }).join('') : '<p class="empty-sub">暂无消息</p>') +
      '</section>';
  }

  /* ---------- 私聊窗口（气泡布局：我方右侧 / 对方村民左侧，本地持久化 + 机器人应答） ---------- */
  function renderChatWindow(peerId) {
    const peer = CommunityAPI.villagerById(peerId) || { id: peerId, nick: '村民', avatar: '🧑‍🌾', color: '#6a8a5a' };
    const chat = CommunityAPI.fetchChat(peerId);
    const bubbles = chat.map((m) => {
      if (m.from === 'me') {
        return '<div class="chat-bubble me"><div class="chat-text">' + esc(m.text) + '</div></div>';
      }
      const v = CommunityAPI.villagerById(m.villagerId) || peer;
      return '<div class="chat-bubble bot">' + avatarOf(v, 'sm', 'data-avatar-user="' + esc(v.id) + '"') +
        '<div><div class="chat-nick">' + esc(v.nick) + '</div>' +
        '<div class="chat-text">' + esc(m.text) + '</div></div></div>';
    }).join('');
    return '<header class="page-header"><button class="btn-back" data-action="nav-back" aria-label="返回">←</button>' +
      '<h1><span class="chat-header-avatar" data-avatar-user="' + esc(peer.id) + '" title="查看主页">' + avatarOf(peer, 'sm') + '</span> ' + esc(peer.nick) + '</h1></header>' +
      '<section class="card chat-card">' +
        '<div class="chat-window" id="chat-window">' + (bubbles || '<p class="empty-sub">打个招呼吧</p>') + '</div>' +
        '<div class="chat-input-row">' +
          '<input id="chat-input" type="text" placeholder="说点什么…" maxlength="120">' +
          '<button class="btn btn-primary" data-action="chat-send" data-peer="' + esc(peerId) + '">发送</button>' +
        '</div>' +
      '</section>';
  }

  /* ============================================================
   * 我的个人主页（v2.4.0：背景区 + 圆形头像 + 统计行 + 昵称简介 + 标签栏 + 编辑主页）
   * 仅保留指定项目；底部保留原有「主题设置」「关于」板块（用户已确认）
   * ============================================================ */
  let _mineTab = 'posts'; // 我的主页标签：posts 作品 / favorites 收藏 / likes 喜欢
  function setMineTab(t) { _mineTab = t; return _mineTab; }
  function getMineTab() { return _mineTab; }

  function statCell(num, label, kind) {
    return '<button class="stat-cell" data-action="stats-list" data-kind="' + kind + '">' +
      '<span class="stat-num">' + num + '</span><span class="stat-label">' + label + '</span></button>';
  }

  /**
   * 底部板块（v2.4.5）：设置入口 + 关于板块（「我的」页静态渲染仅这两栏）
   * 原第三栏「开发者管理面板」卡片已移除；开发者登录态的管理入口改由
   * DevAdmin.applyDevVisibility() 注入的 #dev-admin-panel 提供（仅开发者可见）。
   */
  function renderMineLegacy() {
    return '<section class="card card-link" data-route="#/settings">' +
        '<div class="card-head"><h2>设置</h2><span class="row-arrow">›</span></div>' +
      '</section>' +
      '<section class="card"><div class="card-head"><h2>关于</h2></div>' +
        '<div class="setting-row"><div class="setting-title">版本</div><div>v' + esc(SDV_CONFIG.app.version) + '</div></div>' +
        '<button class="row-btn" data-action="check-update"><span>检查更新</span><span>›</span></button>' +
      '</section>';
  }

  function mineTheme() {
    return (typeof Store !== 'undefined' && Store.getTheme) ? Store.getTheme() : { followSystem: true, manual: 'light' };
  }

  /* ============================================================
   * v2.4.1 未登录视图：顶部像素登录卡片（点击弹出登录弹窗），
   * 下方保留原「主题设置」「关于」板块
   * ============================================================ */
  function renderLoginEntry() {
    const me = CommunityAPI.getProfile();
    const isDevNow = (typeof DevAdmin !== 'undefined') ? DevAdmin.isDev() : false;
    if (isDevNow) {
      const devLogin = DevAdmin.getDevLogin() || {};
      return '<button class="login-entry-card dev-mode-card" data-action="dev-open-admin">' +
          '<span class="login-entry-avatar">' + avatarOf(me, 'md') + '</span>' +
          '<span class="login-entry-text">' + esc(devLogin.user || '已登录') + '</span>' +
          '<span class="login-entry-dev-tag">已登录</span>' +
        '</button>' +
        '<p class="login-entry-hint">点击可进入管理面板</p>' +
        renderMineLegacy();
    }
    return '<button class="login-entry-card" data-action="dev-open-admin">' +
        '<span class="login-entry-avatar">' + avatarOf(me, 'md') + '</span>' +
        '<span class="login-entry-text">登录</span>' +
        '<span class="login-entry-arrow">›</span>' +
      '</button>' +
      '<p class="login-entry-hint">点击登录，进入个人主页</p>' +
      renderMineLegacy();
  }

  function renderMyProfile() {
    // 游客未登录 且 非开发者 → 未登录视图；游客已登录 或 开发者已登录 → 个人主页
    const guestLogged = CommunityAPI.getLoginState();
    const isDevNow = (typeof DevAdmin !== 'undefined') ? DevAdmin.isDev() : false;
    if (!guestLogged && !isDevNow) return renderLoginEntry();

    const me = CommunityAPI.getProfile();
    const likes = CommunityAPI.countAuthorLikes(me.id);
    const cnt = CommunityAPI.followCounts();

    const list = _mineTab === 'posts' ? CommunityAPI.fetchMyPosts()
      : _mineTab === 'favorites' ? CommunityAPI.fetchMyFavorites()
      : CommunityAPI.fetchMyLikes();
    const tabBody = list.length
      ? '<div class="masonry-feed">' + list.map(postCard).join('') + '</div>'
      : '<p class="empty-sub">' + (_mineTab === 'posts' ? '还没有发过帖子' : _mineTab === 'favorites' ? '还没有收藏过帖子' : '还没有点过赞') + '</p>';

    const tabs = [['posts', '作品'], ['favorites', '收藏'], ['likes', '喜欢']];
    const tabBar = '<div class="tab-bar">' + tabs.map(([k, label]) =>
      '<button class="tab-btn' + (_mineTab === k ? ' on' : '') + '" data-action="profile-tab" data-tab="' + k + '">' + label + '</button>'
    ).join('') + '</div>';

    const devBadge = isDevNow
      ? '<span class="dev-badge" title="开发者模式已开启">开发者</span>'
      : '';

    return '<div class="profile-banner"></div>' +
      '<section class="card profile-main">' +
        '<div class="profile-avatar" data-avatar-user="' + esc(me.id) + '" title="我的主页">' + avatarOf(me, 'xl') + '</div>' +
        '<div class="stat-row">' +
          statCell(likes, '获赞', 'likes') +
          statCell(cnt.mutual, '互关', 'mutual') +
          statCell(cnt.following, '关注', 'following') +
          statCell(cnt.followers, '粉丝', 'followers') +
        '</div>' +
        '<div class="profile-name">' + esc(me.nick) + ' ' + devBadge + '</div>' +
        '<p class="profile-bio">' + (me.bio ? esc(me.bio) : '这个人很懒，还没有填写简介') + '</p>' +
        '<button class="btn btn-primary profile-edit-btn" data-action="edit-profile">编辑主页</button>' +
      '</section>' +
      tabBar +
      '<section class="card profile-tab-body">' + tabBody + '</section>' +
      renderMineLegacy();
  }

  /* ============================================================
   * v2.4.2 设置页（#/settings）
   * ① 主题设置板块（由我的页整体迁移，功能与原有完全一致）
   * ② 账号板块：展示当前登录账号名称 + 退出登录按钮（确认弹窗后清状态跳回我的页）
   * ============================================================ */
  function renderSettings() {
    const t = mineTheme();
    const st = CommunityAPI.getLoginState();
    const me = CommunityAPI.getProfile();
    // 账号板块：已登录显示账号名 + 退出按钮；未登录显示「未登录」
    const account = st
      ? '<div class="setting-row"><div><div class="setting-title">当前账号</div>' +
          '<div class="setting-desc">' + esc(me.nick) + '</div></div>' +
          '<button class="btn btn-danger" data-action="logout">退出登录</button></div>'
      : '<div class="setting-row"><div><div class="setting-title">当前账号</div>' +
          '<div class="setting-desc">未登录</div></div></div>';

    return '<header class="page-header"><button class="btn-back" data-action="nav-back" aria-label="返回">←</button>' +
        '<h1>设置</h1></header>' +
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
      '<section class="card"><div class="card-head"><h2>账号</h2></div>' + account + '</section>';
  }

  /* ============================================================
   * 他人用户主页（v2.4.0：背景图 + 返回 + 圆形头像昵称 + 统计行 + 简介/IP属地 +
   * 关注按钮三态 + 私信 + 作品/推荐标签栏；点击任意帖子内头像跳转进入）
   * ============================================================ */
  let _userTab = 'posts'; // 他人主页标签：posts 作品 / recommend 推荐
  function setUserTab(t) { _userTab = t; return _userTab; }
  function getUserTab() { return _userTab; }

  function renderUserHome(id) {
    const me = CommunityAPI.getProfile();
    if (id === me.id) return renderMyProfile(); // 自己的主页 = 我的个人主页
    const u = CommunityAPI.villagerById(id);
    if (!u) {
      return '<header class="page-header"><button class="btn-back" data-action="nav-back">←</button><h1>用户主页</h1></header>' +
        '<section class="card"><p class="empty-sub">用户不存在</p></section>';
    }
    const st = CommunityAPI.followStateOf(id);
    const fans = u.baseFans + (st.following ? 1 : 0);
    const likes = CommunityAPI.countAuthorLikes(id);
    const followLabel = st.mutual ? '互相关注' : (st.following ? '已关注' : '关注');

    // 作品：该用户公开帖子；推荐：其他村民的帖子
    const posts = CommunityAPI.fetchPosts().filter((p) => p.authorId === id);
    const recommend = CommunityAPI.fetchPosts().filter((p) => p.authorId !== id);
    const list = _userTab === 'posts' ? posts : recommend;
    const tabBody = list.length
      ? '<div class="masonry-feed">' + list.map(postCard).join('') + '</div>'
      : '<p class="empty-sub">' + (_userTab === 'posts' ? '还没有公开帖子' : '暂无推荐内容') + '</p>';

    const tabBar = '<div class="tab-bar">' +
      '<button class="tab-btn' + (_userTab === 'posts' ? ' on' : '') + '" data-action="user-tab" data-tab="posts">作品</button>' +
      '<button class="tab-btn' + (_userTab === 'recommend' ? ' on' : '') + '" data-action="user-tab" data-tab="recommend">推荐</button>' +
    '</div>';

    return '<div class="profile-banner"></div>' +
      '<button class="btn-back profile-back" data-action="nav-back" aria-label="返回">←</button>' +
      '<section class="card profile-main">' +
        '<div class="profile-avatar" data-avatar-user="' + esc(u.id) + '" title="查看主页">' + avatarOf(u, 'xl') + '</div>' +
        '<div class="stat-row">' +
          statCell(likes, '获赞', 'likes') +
          statCell(u.baseFollowing, '关注', 'following') +
          statCell(fans, '粉丝', 'followers') +
        '</div>' +
        '<div class="profile-name">' + esc(u.nick) + '</div>' +
        '<p class="profile-bio">' + esc(u.bio || '这位村民还没有填写简介') + '</p>' +
        '<span class="ip-tag">📍 ' + esc(u.ip || '鹈鹕镇') + '</span>' +
        '<div class="profile-actions">' +
          '<button class="btn follow-btn' + (st.following ? ' on' : '') + '" data-action="follow" data-user="' + esc(id) + '" data-fans="' + fans + '">' + followLabel + '</button>' +
          '<button class="btn btn-primary" data-route="#/chat/' + esc(id) + '">私信</button>' +
        '</div>' +
      '</section>' +
      tabBar +
      '<section class="card profile-tab-body">' + tabBody + '</section>';
  }

  /* ============================================================
   * 我的子页：我的帖子 / 我的点赞 / 我的收藏
   * ============================================================ */
  function renderMinePosts() {
    const list = CommunityAPI.fetchMyPosts();
    return '<header class="page-header"><button class="btn-back" data-action="nav-back">←</button><h1>我的帖子</h1></header>' +
      '<section class="card"><div class="card-head"><h2>我发布的帖子</h2><span class="card-sub">' + list.length + ' 条</span></div>' +
      (list.length ? '<div class="my-post-list">' + list.map((p) =>
        '<div class="my-post-item">' +
          '<div class="my-post-info" data-route="#/post/' + esc(p.id) + '">' +
            '<span class="tag">' + VISIBILITY_LABEL[p.visibility] + '</span>' +
            '<h3 class="post-title">' + esc(p.title) + '</h3>' +
            '<div class="post-stats"><span class="stat">❤️ ' + (p.likes || 0) + '</span><span class="stat">💬 ' + (p.comments || 0) + '</span><span class="stat">⭐ ' + (p.favorites || 0) + '</span></div>' +
          '</div>' +
          '<div class="my-post-ops">' +
            '<button class="pixel-btn" data-action="edit-post" data-post="' + esc(p.id) + '">✏️</button>' +
            '<button class="pixel-btn danger" data-action="delete-post" data-post="' + esc(p.id) + '">🗑️</button>' +
          '</div>' +
        '</div>'
      ).join('') : '<p class="empty-sub">还没有发过帖子</p>') +
      '</section>';
  }

  function renderMineLikes() {
    const list = CommunityAPI.fetchMyLikes();
    return '<header class="page-header"><button class="btn-back" data-action="nav-back">←</button><h1>我的点赞</h1></header>' +
      '<section class="card"><div class="card-head"><h2>我赞过的帖子</h2><span class="card-sub">' + list.length + ' 条</span></div>' +
      (list.length ? '<div class="masonry-feed">' + list.map(postCard).join('') + '</div>' : '<p class="empty-sub">还没有点过赞</p>') +
      '</section>';
  }

  function renderMineFavorites() {
    const list = CommunityAPI.fetchMyFavorites();
    return '<header class="page-header"><button class="btn-back" data-action="nav-back">←</button><h1>我的收藏</h1></header>' +
      '<section class="card"><div class="card-head"><h2>我收藏的帖子</h2><span class="card-sub">' + list.length + ' 条</span></div>' +
      (list.length ? '<div class="masonry-feed">' + list.map(postCard).join('') + '</div>' : '<p class="empty-sub">还没有收藏过帖子</p>') +
      '</section>';
  }

  return {
    renderHomeBlock, refreshBlock, renderCommunityList, renderPostDetail,
    renderMessages, renderNotices, renderChatWindow,
    renderMyProfile, renderSettings, renderUserHome, renderMinePosts, renderMineLikes, renderMineFavorites,
    openPostModal, submitPostForm,
    setReplyTarget, getReplyTarget, clearReplyTarget,
    setMineTab, getMineTab, setUserTab, getUserTab,
    followBtnHtml, isVillagerUser,
  };
})();
