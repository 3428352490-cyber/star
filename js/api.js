'use strict';

/**
 * ============================================================
 * 社区数据层（Mock 版）—— v2.0.0 老乡有话说
 *
 * 【接口预留原则】
 * 所有数据请求、增删改查操作统一封装为独立函数，页面渲染只调用
 * 这些函数、不直接写数据逻辑；Mock 数据集中存放于本文件。
 * 后续接入 MemFire Cloud / CloudBase 后端时，只需替换本文件内部
 * 实现（保持函数签名与返回结构不变），页面 UI / 渲染逻辑零改动。
 *
 * 数据持久化：localStorage（命名空间 sdv-guide:community:*），
 * 刷新 / 重开页面数据保留；清空站点缓存/数据即全部删除（无云端残留）。
 *
 * 用户身份（Mock）：本地游客身份——默认昵称「星露谷村民」+ 本地
 * 随机 UID，可在【我的】页修改头像与昵称；发帖人 = 当前游客；
 * 「部分可见」从内置 Mock 村民列表勾选指定用户。
 *
 * 【v2.3.0 骨架扩展】
 * - 评论支持楼中楼：评论对象新增 parentId（null = 一级评论，否则为一级评论 id）
 * - 游客发评论后，村民机器人延迟生成楼中楼回复，并随机点赞该评论
 * - 点赞通知规则：仅当游客发布过评论后，其帖子/评论被点赞才生成点赞通知
 * - 消息页内置机器人聊天会话（chat 键）
 * - unreadCount() 供消息 Tab 角标统计未读消息数
 * ============================================================
 */
const CommunityAPI = (() => {
  const NS = 'sdv-guide:community:';

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, val) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(val));
    } catch (e) { /* 存储满/不可用时静默 */ }
  }

  /* ============================================================
   * 种子数据：Mock 村民 / 预置帖子 / 预置评论 / 预置通知
   * ============================================================ */
  const VILLAGERS = [
    { id: 'v-pierre', nick: '皮埃尔', avatar: '🧑‍🌾', color: '#7a5c3a' },
    { id: 'v-robin', nick: '罗宾', avatar: '👩‍🌾', color: '#8a6a42' },
    { id: 'v-clint', nick: '克林特', avatar: '🧔', color: '#5c5a58' },
    { id: 'v-leah', nick: '莉亚', avatar: '👩‍🎨', color: '#9a7a52' },
    { id: 'v-sam', nick: '山姆', avatar: '🧑‍🎤', color: '#6a7a9a' },
  ];

  /* 帖子图片：像素风内联占位（emoji + 底色块），无图帖子使用默认像素占位图 */
  function pix(emoji, color) {
    return { emoji, color };
  }

  const SEED_POSTS = [
    {
      id: 'seed-1', authorId: 'v-leah', visibility: 'public', allowedUsers: [],
      title: '春天第一波蓝莓田收获啦',
      body: '今天去农场收蓝莓，阳光正好，装了满满一筐！大家记得春天 13 号前种下蓝莓。',
      images: [pix('🫐', '#5a6a9a'), pix('🌱', '#5a7a4a')],
      likes: 23, favorites: 8, comments: 3, createdAt: Date.now() - 3600e3 * 2,
    },
    {
      id: 'seed-2', authorId: 'v-robin', visibility: 'public', allowedUsers: [],
      title: '新扩建的温室完工，欢迎来参观',
      body: '花了两周时间把温室扩建好了，里面种了果树和远古水果，秋天之前都能丰收。',
      images: [pix('🏡', '#7a5c3a')],
      likes: 31, favorites: 12, comments: 5, createdAt: Date.now() - 3600e3 * 5,
    },
    {
      id: 'seed-3', authorId: 'v-sam', visibility: 'public', allowedUsers: [],
      title: '星露谷钓鱼大赛备战分享',
      body: '春季钓鱼大赛就要开始了！建议提前备好诱饵和鱼竿，晴天去矿洞湖碰碰运气。',
      images: [pix('🎣', '#4a7a9a')],
      likes: 17, favorites: 6, comments: 2, createdAt: Date.now() - 3600e3 * 9,
    },
    {
      id: 'seed-4', authorId: 'v-pierre', visibility: 'public', allowedUsers: [],
      title: '小店新到了稀有种子',
      body: '本周杂货店限量上架稀有种子，先到先得，村民朋友们别错过。',
      images: [pix('🌽', '#9a8a3a')],
      likes: 12, favorites: 3, comments: 1, createdAt: Date.now() - 3600e3 * 13,
    },
    {
      id: 'seed-5', authorId: 'v-clint', visibility: 'public', allowedUsers: [],
      title: '铁匠铺的升级指南',
      body: '工具升级顺序建议：水壶 → 镐子 → 斧头，配合季节节奏升级效率最高。',
      images: [],
      likes: 9, favorites: 5, comments: 2, createdAt: Date.now() - 3600e3 * 20,
    },
    {
      id: 'seed-6', authorId: 'v-robin', visibility: 'public', allowedUsers: [],
      title: '周末一起布置村庄花坛吧',
      body: '计划周末在广场布置一片向日葵花坛，想参与的村民来木匠铺找我集合！',
      images: [pix('🌻', '#9a7a3a'), pix('🌷', '#9a5a6a')],
      likes: 26, favorites: 10, comments: 4, createdAt: Date.now() - 3600e3 * 26,
    },
    {
      id: 'seed-7', authorId: 'v-leah', visibility: 'public', allowedUsers: [],
      title: '分享我收藏的野花位置',
      body: '春天山谷东侧有片野花田，拍照特别好看，适合做画布素材。',
      images: [pix('🌸', '#9a6a7a')],
      likes: 14, favorites: 7, comments: 1, createdAt: Date.now() - 3600e3 * 33,
    },
    {
      id: 'seed-8', authorId: 'v-pierre', visibility: 'partial', allowedUsers: ['v-robin', 'v-leah'],
      title: '（仅部分可见）进货渠道内部消息',
      body: '下个月稀有种子进货渠道确定，先分享给几位老顾客，别外传哦。',
      images: [],
      likes: 2, favorites: 0, comments: 0, createdAt: Date.now() - 3600e3 * 40,
    },
    {
      id: 'seed-9', authorId: 'v-sam', visibility: 'private', allowedUsers: [],
      title: '（仅自己可见）乐队排练记录',
      body: '今天的排练完成度 80%，下周前把新曲目练熟，表演当天见！',
      images: [pix('🎸', '#6a5a4a')],
      likes: 0, favorites: 0, comments: 0, createdAt: Date.now() - 3600e3 * 48,
    },
  ];

  const SEED_COMMENTS = {
    'seed-1': [
      { id: 'c-1-1', authorId: 'v-robin', text: '蓝莓长势真好，求分享种植经验！', createdAt: Date.now() - 3600e3 * 1 },
      { id: 'c-1-2', authorId: 'v-pierre', text: '春天种蓝莓确实划算，支持！', createdAt: Date.now() - 3600e3 * 0.5 },
    ],
    'seed-2': [
      { id: 'c-2-1', authorId: 'v-leah', text: '温室的采光设计太棒了', createdAt: Date.now() - 3600e3 * 4 },
    ],
  };

  function seedIfEmpty() {
    if (!read('posts', null)) write('posts', SEED_POSTS.slice());
    if (!read('comments', null)) write('comments', JSON.parse(JSON.stringify(SEED_COMMENTS)));
    if (!read('notices', null)) {
      // 预置 1 条：村民对我（游客）旧帖的点赞互动通知种子
      write('notices', [{
        id: 'n-seed-1', type: 'like', villagerId: 'v-leah', postId: null,
        text: '莉亚 赞了你的帖子', read: false, createdAt: Date.now() - 3600e3 * 3,
      }]);
    }
    if (!read('profile', null)) {
      write('profile', {
        id: 'guest-' + Math.random().toString(36).slice(2, 8),
        nick: '星露谷村民',
        avatar: '🧑‍🌾',
        color: '#6a8a5a',
      });
    }
    if (!read('myLikes', null)) write('myLikes', []);
    if (!read('myFavorites', null)) write('myFavorites', []);
    if (!read('chat', null)) {
      // 预置 1 条：村民机器人打招呼，引导游客开启聊天
      write('chat', [{
        id: 'chat-seed-1', from: 'villager', villagerId: 'v-robin',
        text: '你好呀，我是罗宾！有什么想聊的尽管说～',
        createdAt: Date.now() - 3600e3 * 5,
      }]);
    }
  }

  /* ============================================================
   * 本地游客身份
   * ============================================================ */
  function getProfile() {
    seedIfEmpty();
    return read('profile', null);
  }
  function setProfile(patch) {
    const p = getProfile() || {};
    const next = Object.assign({}, p, patch || {});
    write('profile', next);
    return next;
  }

  /* ============================================================
   * 工具：时间 / 随机
   * ============================================================ */
  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function pick(arr, n) {
    const a = arr.slice();
    const out = [];
    while (out.length < n && a.length) {
      out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]);
    }
    return out;
  }
  function villagerById(id) {
    return VILLAGERS.find((v) => v.id === id) || null;
  }

  /* ============================================================
   * 权限工具（前端 Mock 校验；管理员预留）
   * ============================================================ */
  function canView(post, viewerId) {
    if (!post) return false;
    if (post.visibility === 'public') return true;
    if (post.visibility === 'private') return post.authorId === viewerId;
    // partial：作者本人或指定用户可见（管理员后续对接后端后可查看全部）
    return post.authorId === viewerId || (post.allowedUsers || []).includes(viewerId);
  }
  function canEdit(post, viewerId) {
    return !!post && post.authorId === viewerId;
  }

  /* ============================================================
   * 帖子：增删改查（页面渲染只调用这些函数）
   * ============================================================ */
  function fetchPosts() {
    seedIfEmpty();
    const all = read('posts', []);
    // 公共流：仅 public 帖子，按时间倒序（最新在前）
    return all
      .filter((p) => p.visibility === 'public')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function fetchPostDetail(id) {
    seedIfEmpty();
    const p = read('posts', []).find((x) => x.id === id) || null;
    const viewer = getProfile().id;
    if (!p || !canView(p, viewer)) return null;
    return p;
  }

  function createPost({ title, body, images, visibility, allowedUsers }) {
    seedIfEmpty();
    const me = getProfile();
    const post = {
      id: uid('post'),
      authorId: me.id,
      visibility: visibility || 'public',
      allowedUsers: Array.isArray(allowedUsers) ? allowedUsers : [],
      title: String(title || '').trim(),
      body: String(body || '').trim(),
      images: Array.isArray(images) ? images.slice(0, 6) : [],
      likes: 0, favorites: 0, comments: 0,
      createdAt: Date.now(),
    };
    const all = read('posts', []);
    all.unshift(post);
    write('posts', all);
    // 发帖成功后：随机 2~4 个 Mock 村民延迟互动（模拟真实社区）
    scheduleVillagerInteractions(post.id);
    return post;
  }

  function updatePost(id, patch) {
    seedIfEmpty();
    const all = read('posts', []);
    const idx = all.findIndex((x) => x.id === id);
    const me = getProfile();
    if (idx < 0 || !canEdit(all[idx], me.id)) return null;
    const next = Object.assign({}, all[idx], patch || {});
    if (patch && patch.images !== undefined) next.images = (patch.images || []).slice(0, 6);
    all[idx] = next;
    write('posts', all);
    return next;
  }

  function deletePost(id) {
    seedIfEmpty();
    const all = read('posts', []);
    const me = getProfile();
    const idx = all.findIndex((x) => x.id === id);
    if (idx < 0 || !canEdit(all[idx], me.id)) return false;
    all.splice(idx, 1);
    write('posts', all);
    // 级联清理该帖评论与相关通知
    const comments = read('comments', {});
    if (comments[id]) { delete comments[id]; write('comments', comments); }
    const notices = read('notices', []);
    write('notices', notices.filter((n) => n.postId !== id));
    return true;
  }

  /* 互动计数（仅修改本地 Mock 计数） */
  function toggleLike(id) {
    seedIfEmpty();
    const me = getProfile().id;
    const likes = read('myLikes', []);
    const post = fetchPostDetail(id);
    if (!post) return { ok: false };
    let liked = likes.includes(id);
    if (liked) {
      post.likes = Math.max(0, (post.likes || 0) - 1);
      write('myLikes', likes.filter((x) => x !== id));
    } else {
      post.likes = (post.likes || 0) + 1;
      likes.push(id);
      write('myLikes', likes);
    }
    persistPost(post);
    return { ok: true, liked: !liked, count: post.likes };
  }

  function toggleFavorite(id) {
    seedIfEmpty();
    const favs = read('myFavorites', []);
    const post = fetchPostDetail(id);
    if (!post) return { ok: false };
    let faved = favs.includes(id);
    if (faved) {
      post.favorites = Math.max(0, (post.favorites || 0) - 1);
      write('myFavorites', favs.filter((x) => x !== id));
    } else {
      post.favorites = (post.favorites || 0) + 1;
      favs.push(id);
      write('myFavorites', favs);
    }
    persistPost(post);
    return { ok: true, faved: !faved, count: post.favorites };
  }

  function persistPost(post) {
    const all = read('posts', []);
    const idx = all.findIndex((x) => x.id === post.id);
    if (idx >= 0) { all[idx] = post; write('posts', all); }
  }

  /* 我的数据 */
  function fetchMyPosts() {
    seedIfEmpty();
    const me = getProfile().id;
    return read('posts', [])
      .filter((p) => p.authorId === me)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  function fetchMyLikes() {
    seedIfEmpty();
    const likes = read('myLikes', []);
    return read('posts', []).filter((p) => likes.includes(p.id));
  }
  function fetchMyFavorites() {
    seedIfEmpty();
    const favs = read('myFavorites', []);
    return read('posts', []).filter((p) => favs.includes(p.id));
  }

  /* ============================================================
   * 评论（v2.3.0 骨架：支持楼中楼回复，评论对象含 parentId/likes）
   * 评论总数 = 一级评论 + 楼中楼回复，post.comments 实时同步
   * ============================================================ */
  function fetchComments(postId) {
    seedIfEmpty();
    const comments = read('comments', {});
    const list = comments[postId] || [];
    return list.slice().sort((a, b) => a.createdAt - b.createdAt);
  }

  /** 评论总数（一级评论 + 楼中楼回复），实时统计 */
  function countComments(postId) {
    seedIfEmpty();
    const list = read('comments', {})[postId] || [];
    return list.length;
  }

  /** 游客是否发布过评论（点赞通知生成的先决条件） */
  function hasGuestCommented() {
    const me = getProfile();
    const comments = read('comments', {});
    return Object.keys(comments).some((pid) =>
      comments[pid].some((c) => c.authorId === me.id)
    );
  }

  /** 写入一条评论并同步帖子评论计数（一级与楼中楼均计入） */
  function persistComment(postId, c) {
    const comments = read('comments', {});
    if (!comments[postId]) comments[postId] = [];
    comments[postId].push(c);
    write('comments', comments);
    const post = read('posts', []).find((x) => x.id === postId);
    if (post) { post.comments = (post.comments || 0) + 1; persistPost(post); }
  }

  /**
   * 新增评论（游客）；parentId 提供时即为楼中楼回复（仅允许回复一级评论）。
   * 游客发评论后自动触发村民机器人延迟楼中楼回复。
   */
  function addComment(postId, text, parentId) {
    seedIfEmpty();
    const content = String(text || '').trim();
    if (!content) return null;
    const post = fetchPostDetail(postId);
    if (!post) return null;
    let pid = null;
    if (parentId) {
      const existing = (read('comments', {})[postId] || []).find((x) => x.id === parentId && !x.parentId);
      if (!existing) return null;
      pid = existing.id;
    }
    const me = getProfile();
    const c = { id: uid('c'), authorId: me.id, text: content, createdAt: Date.now(), parentId: pid, likes: 0 };
    persistComment(postId, c);
    scheduleBotReply(postId, c.id);   // 游客发评论 → 村民机器人延迟楼中楼回复
    return c;
  }

  /** 村民机器人发评论（楼中楼回复），作者为村民，不触发机器人调度 */
  function addBotComment(postId, text, parentId, villagerId) {
    const c = {
      id: uid('c'), authorId: villagerId, text: String(text || '').trim(),
      createdAt: Date.now(), parentId: parentId || null, likes: 0,
    };
    persistComment(postId, c);
    return c;
  }

  /** 村民点赞评论（+1 计数；点赞通知的底层动作） */
  function likeComment(postId, commentId, villagerId) {
    seedIfEmpty();
    const comments = read('comments', {});
    const list = comments[postId] || [];
    const c = list.find((x) => x.id === commentId);
    if (!c) return false;
    c.likes = (c.likes || 0) + 1;
    write('comments', comments);
    return true;
  }

  /**
   * 游客发评论后：随机 1 位村民延迟 3~8 秒生成楼中楼回复；
   * 回复统一挂到该评论所属的「一级评论」下（渲染层楼中楼为单层），
   * 回复后随机（50%）点赞该评论并生成点赞通知
   * （满足「点赞通知仅游客评论被点赞才生成」）。
   */
  function scheduleBotReply(postId, commentId) {
    const v = VILLAGERS[Math.floor(Math.random() * VILLAGERS.length)];
    const delay = 3000 + Math.random() * 5000;
    setTimeout(() => {
      const post = fetchPostDetail(postId);
      if (!post) return; // 帖子可能已被删除
      // 若目标评论本身是楼中楼回复，则归一挂到其一级评论下（保持单层楼中楼）
      const list = read('comments', {})[postId] || [];
      const target = list.find((c) => c.id === commentId);
      const topId = (target && target.parentId) ? target.parentId : commentId;
      const replies = [
        '真不错！', '学到了，谢谢分享！', '这个思路太棒了', '下次我也试试',
        '同意楼上！', '我也是这么想的～', '说得对，记得提前备好材料。',
      ];
      const text = replies[Math.floor(Math.random() * replies.length)];
      addBotComment(postId, text, topId, v.id);
      pushNotice({ type: 'comment', villagerId: v.id, postId, text: v.nick + ' 回复了你的评论' });
      if (Math.random() < 0.5) {
        likeComment(postId, commentId, v.id);
        pushNotice({ type: 'like', villagerId: v.id, postId, text: v.nick + ' 赞了你的评论' });
      }
    }, delay);
  }

  /* ============================================================
   * 消息通知（动态生成：Mock 村民互动 → 通知）
   * ============================================================ */
  function fetchMessages() {
    seedIfEmpty();
    return read('notices', []).slice().sort((a, b) => b.createdAt - a.createdAt);
  }
  function markAllRead() {
    seedIfEmpty();
    const notices = read('notices', []);
    notices.forEach((n) => { n.read = true; });
    write('notices', notices);
    return notices.length;
  }

  /** 未读消息数（消息 Tab 角标统计） */
  function unreadCount() {
    seedIfEmpty();
    return read('notices', []).filter((n) => !n.read).length;
  }

  function pushNotice({ type, villagerId, postId, text }) {
    const notices = read('notices', []);
    notices.push({
      id: uid('n'), type, villagerId, postId,
      text: String(text || ''),
      read: false, createdAt: Date.now(),
    });
    write('notices', notices);
  }

  /* ============================================================
   * 机器人聊天会话（消息页下方，v2.3.0 骨架新增）
   * chat 数组：{ id, from: 'me'|'villager', villagerId, text, createdAt }
   * ============================================================ */
  function fetchChat() {
    seedIfEmpty();
    return read('chat', []).slice().sort((a, b) => a.createdAt - b.createdAt);
  }

  /** 游客发送聊天消息 → 触发机器人延迟应答 */
  function sendChat(text) {
    seedIfEmpty();
    const content = String(text || '').trim();
    if (!content) return null;
    const me = getProfile();
    const msg = {
      id: uid('chat'), from: 'me', authorId: me.id, villagerId: null,
      text: content, createdAt: Date.now(),
    };
    const chat = read('chat', []);
    chat.push(msg);
    write('chat', chat);
    scheduleBotChatReply();
    return msg;
  }

  /** 机器人延迟应答（2~5 秒，随机村民） */
  function scheduleBotChatReply() {
    const v = VILLAGERS[Math.floor(Math.random() * VILLAGERS.length)];
    const delay = 2000 + Math.random() * 3000;
    setTimeout(() => {
      const replies = [
        '哈哈，这个话题有意思！', '原来是这样，学到了。', '明天星露谷集市见！',
        '我今天在农场忙了一天～', '你说得对，我也有同感！', '改天一起去钓鱼吧！',
      ];
      const msg = {
        id: uid('chat'), from: 'villager', authorId: v.id, villagerId: v.id,
        text: replies[Math.floor(Math.random() * replies.length)], createdAt: Date.now(),
      };
      const chat = read('chat', []);
      chat.push(msg);
      write('chat', chat);
    }, delay);
  }

  /** 发帖成功后：随机 2~4 个 Mock 村民延迟产生点赞/评论/收藏互动并生成通知（本地模拟） */
  function scheduleVillagerInteractions(postId) {
    const villagers = pick(VILLAGERS, 2 + Math.floor(Math.random() * 3)); // 2~4 个
    villagers.forEach((v, i) => {
      const delay = 3000 + Math.random() * 6000 + i * 2500; // 3~9 秒错开
      setTimeout(() => {
        const post = fetchPostDetail(postId);
        if (!post) return; // 帖子可能已被删除
        const type = ['like', 'comment', 'favorite'][Math.floor(Math.random() * 3)];
        if (type === 'like') {
          post.likes = (post.likes || 0) + 1;
          persistPost(post);
          // 点赞通知规则（v2.3.0）：仅当游客发布过评论后，帖子被点赞才生成点赞通知
          if (hasGuestCommented()) {
            pushNotice({ type: 'like', villagerId: v.id, postId, text: v.nick + ' 赞了你的帖子' });
          }
        } else if (type === 'comment') {
          addBotComment(postId, ['真不错！', '学到了，谢谢分享！', '这个思路太棒了', '下次我也试试'][Math.floor(Math.random() * 4)], null, v.id);
          pushNotice({ type: 'comment', villagerId: v.id, postId, text: v.nick + ' 评论了你的帖子' });
        } else {
          post.favorites = (post.favorites || 0) + 1;
          persistPost(post);
          pushNotice({ type: 'favorite', villagerId: v.id, postId, text: v.nick + ' 收藏了你的帖子' });
        }
      }, delay);
    });
  }

  /* 暴露给页面渲染层 / 测试 */
  function resetForTest() {
    try {
      Object.keys(localStorage).forEach((k) => { if (k.indexOf(NS) === 0) localStorage.removeItem(k); });
    } catch (e) {}
  }
  function __villagers() { return VILLAGERS; }

  /* 首次访问播种 */
  seedIfEmpty();

  return {
    getProfile, setProfile, fetchPosts, fetchPostDetail, createPost, updatePost, deletePost,
    toggleLike, toggleFavorite, fetchComments, addComment, countComments, hasGuestCommented,
    fetchMessages, markAllRead, unreadCount, fetchChat, sendChat,
    fetchMyPosts, fetchMyLikes, fetchMyFavorites, canView, canEdit,
    villagerById, __villagers, resetForTest,
  };
})();
