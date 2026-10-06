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
  function avatarOf(v, size) {
    return '<span class="px-avatar" style="background:' + esc(v.color) + '" data-size="' + (size || 'md') + '">' + esc(v.avatar) + '</span>';
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
    return '<article class="masonry-card" data-route="#/post/' + esc(post.id) + '">' +
      '<div class="masonry-cover">' + cover + '</div>' +
      '<div class="masonry-body">' +
        '<h3 class="masonry-title">' + esc(post.title) + '</h3>' +
        '<div class="masonry-meta">' +
          avatarOf(author, 'sm') +
          '<span class="post-nick">' + esc(author.nick) + '</span>' +
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
    return '<header class="page-header"><button class="btn-back" data-route="#/home" aria-label="返回">←</button>' +
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
      return '<header class="page-header"><button class="btn-back" data-route="#/home">←</button><h1>帖子详情</h1></header>' +
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

    return '<header class="page-header"><button class="btn-back" data-route="#/home">←</button><h1>帖子详情</h1></header>' +
      '<section class="card post-detail">' +
        '<div class="post-detail-author">' + avatarOf(author, 'lg') +
          '<div><div class="post-nick">' + esc(author.nick) + '</div>' +
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
        avatarOf(cv, 'sm') +
        '<div class="comment-main"><div class="comment-head"><span class="post-nick">' + esc(cv.nick) + '</span>' +
          '<span class="post-time">' + timeText(c.createdAt) + '</span></div>' +
        '<p>' + esc(c.text) + '</p>' +
        '<button class="reply-btn" data-action="comment-reply" data-post="' + esc(postId) + '" data-comment="' + esc(c.id) + '" data-nick="' + esc(cv.nick) + '">回复</button>' +
        (replies.length ? '<div class="comment-replies">' + replies.map((r) => {
          const rv = commentAuthor(r, me);
          return '<div class="comment-item reply-item" data-comment="' + esc(r.id) + '">' +
            avatarOf(rv, 'sm') +
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
   * 消息页（v2.3.0 骨架：通知列表在上 + 机器人聊天会话在下）
   * ============================================================ */
  function renderMessages() {
    const msgs = CommunityAPI.fetchMessages();
    const unread = msgs.filter((m) => !m.read).length;
    return '<section class="card"><div class="card-head"><h2>通知</h2>' +
        (unread ? '<button class="notice-more" data-action="mark-all-read">全部已读</button>' : '<span class="card-sub">已全部读完</span>') +
      '</div>' +
      (msgs.length ? '<div class="message-list">' + msgs.map((m) => {
        const v = CommunityAPI.villagerById(m.villagerId) || { id: m.villagerId, nick: '村民', avatar: '🧑‍🌾', color: '#6a8a5a' };
        const route = m.postId ? ' data-route="#/post/' + esc(m.postId) + '"' : '';
        return '<div class="message-item' + (m.read ? ' read' : ' unread') + '"' + route + '>' +
          avatarOf(v, 'sm') +
          '<div class="message-main"><div class="message-text">' + esc(m.text) + '</div>' +
          '<span class="post-time">' + timeText(m.createdAt) + '</span></div>' +
          (m.read ? '' : '<span class="msg-dot"></span>') +
        '</div>';
      }).join('') : '<p class="empty-sub">暂无消息</p>') +
      '</section>' +
      renderChat();
  }

  /* ---------- 机器人聊天会话（内置村民机器人，延迟应答） ---------- */
  function renderChat() {
    const chat = CommunityAPI.fetchChat();
    const bubbles = chat.map((m) => {
      if (m.from === 'me') {
        return '<div class="chat-bubble me"><div class="chat-text">' + esc(m.text) + '</div></div>';
      }
      const v = CommunityAPI.villagerById(m.villagerId) || { id: m.villagerId, nick: '村民', avatar: '🧑‍🌾', color: '#6a8a5a' };
      return '<div class="chat-bubble bot">' + avatarOf(v, 'sm') +
        '<div><div class="chat-nick">' + esc(v.nick) + '</div>' +
        '<div class="chat-text">' + esc(m.text) + '</div></div></div>';
    }).join('');
    return '<section class="card chat-card">' +
      '<div class="card-head"><h2>机器人聊天</h2><span class="card-sub">和村民唠唠嗑</span></div>' +
      '<div class="chat-window" id="chat-window">' + (bubbles || '<p class="empty-sub">暂无消息</p>') + '</div>' +
      '<div class="chat-input-row">' +
        '<input id="chat-input" type="text" placeholder="说点什么…" maxlength="120">' +
        '<button class="btn btn-primary" data-action="chat-send">发送</button>' +
      '</div>' +
    '</section>';
  }

  /* ============================================================
   * 我的子页：我的帖子 / 我的点赞 / 我的收藏
   * ============================================================ */
  function renderMinePosts() {
    const list = CommunityAPI.fetchMyPosts();
    return '<header class="page-header"><button class="btn-back" data-route="#/mine">←</button><h1>我的帖子</h1></header>' +
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
    return '<header class="page-header"><button class="btn-back" data-route="#/mine">←</button><h1>我的点赞</h1></header>' +
      '<section class="card"><div class="card-head"><h2>我赞过的帖子</h2><span class="card-sub">' + list.length + ' 条</span></div>' +
      (list.length ? '<div class="masonry-feed">' + list.map(postCard).join('') + '</div>' : '<p class="empty-sub">还没有点过赞</p>') +
      '</section>';
  }

  function renderMineFavorites() {
    const list = CommunityAPI.fetchMyFavorites();
    return '<header class="page-header"><button class="btn-back" data-route="#/mine">←</button><h1>我的收藏</h1></header>' +
      '<section class="card"><div class="card-head"><h2>我收藏的帖子</h2><span class="card-sub">' + list.length + ' 条</span></div>' +
      (list.length ? '<div class="masonry-feed">' + list.map(postCard).join('') + '</div>' : '<p class="empty-sub">还没有收藏过帖子</p>') +
      '</section>';
  }

  return {
    renderHomeBlock, refreshBlock, renderCommunityList, renderPostDetail,
    renderMessages, renderMinePosts, renderMineLikes, renderMineFavorites,
    openPostModal, submitPostForm,
    setReplyTarget, getReplyTarget, clearReplyTarget,
  };
})();
