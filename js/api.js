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
 *
 * 【v2.4.0 社交模块扩展】
 * - 关注关系：follows { following(我关注), followers(关注我) } 本地存储；
 *   村民预置 baseFans/baseFollowing 基数，粉丝数 = 基数 + 游客是否已关注；
 *   关注后村民延迟回关 → 生成「新关注我的」通知（type:'follow'）
 * - 私聊多会话：chat 重构为按对方 id 分桶 { [peerId]: { messages, unread } }，
 *   旧 v2.3.0 数组结构自动迁移；fetchConversations/openChat/chatUnreadTotal
 * - 通知分组：「新关注我的」(type=follow) / 「互动消息」(like/comment/favorite)
 * - 互动通知：游客对村民帖子的点赞/收藏/评论 → 生成记录型互动通知（direction:'me'）
 * - 获赞统计：countAuthorLikes = 该作者全部帖子 likes 实时求和
 * - 消息 Tab 角标 unreadCount() = 通知未读 + 会话未读合计
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
   * v2.4.0：村民资料扩展 bio 简介 / ip 属地 / baseFans 基础粉丝 / baseFollowing 基础关注数
   * ============================================================ */
  const VILLAGERS = [
    { id: 'v-pierre', nick: '皮埃尔', avatar: '🧑‍🌾', color: '#7a5c3a', bio: '杂货店老板，稀有种子先到先得', ip: '鹈鹕镇·南街', baseFans: 128, baseFollowing: 35 },
    { id: 'v-robin', nick: '罗宾', avatar: '👩‍🌾', color: '#8a6a42', bio: '木匠铺老板娘，爱做木工和温室', ip: '鹈鹕镇·木匠铺', baseFans: 96, baseFollowing: 42 },
    { id: 'v-clint', nick: '克林特', avatar: '🧔', color: '#5c5a58', bio: '铁匠铺师傅，专注打铁升级', ip: '鹈鹕镇·矿洞旁', baseFans: 45, baseFollowing: 12 },
    { id: 'v-leah', nick: '莉亚', avatar: '👩‍🎨', color: '#9a7a52', bio: '住在村外的艺术家，最爱野花', ip: '鹈鹕镇·村外小屋', baseFans: 210, baseFollowing: 88 },
    { id: 'v-sam', nick: '山姆', avatar: '🧑‍🎤', color: '#6a7a9a', bio: '音乐少年，乐队主唱兼吉他手', ip: '鹈鹕镇·家中', baseFans: 87, baseFollowing: 25 },
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
      // 预置 2 条：村民对我的互动/关注通知种子
      write('notices', [
        { id: 'n-seed-1', type: 'like', villagerId: 'v-leah', postId: null,
          text: '莉亚 赞了你的帖子', read: false, createdAt: Date.now() - 3600e3 * 3 },
        { id: 'n-seed-2', type: 'follow', villagerId: 'v-robin', postId: null,
          text: '罗宾 关注了你', read: false, createdAt: Date.now() - 3600e3 * 2 },
      ]);
    }
    if (!read('profile', null)) {
      write('profile', {
        id: 'guest-' + Math.random().toString(36).slice(2, 8),
        nick: '星露谷村民',
        avatar: '🧑‍🌾',
        color: '#6a8a5a',
        bio: '',
      });
    }
    if (!read('myLikes', null)) write('myLikes', []);
    if (!read('myFavorites', null)) write('myFavorites', []);
    if (!read('follows', null)) {
      // v2.4.0 关注关系：罗宾预置关注游客（互相关注可体验）
      write('follows', { following: [], followers: ['v-robin'] });
    }
    // v2.4.0 私聊会话：chat 按对方 id 分桶 { [peerId]: { messages, unread } }；
    // 兼容 v2.3.0 旧数组结构自动迁移
    const rawChat = read('chat', null);
    if (rawChat === null) {
      write('chat', {
        'v-robin': {
          messages: [{
            id: 'chat-seed-1', from: 'villager', villagerId: 'v-robin',
            text: '你好呀，我是罗宾！有什么想聊的尽管说～',
            createdAt: Date.now() - 3600e3 * 5,
          }],
          unread: 1, // 预置 1 条未读，展示会话角标
        },
        'v-sam': {
          messages: [{
            id: 'chat-seed-2', from: 'villager', villagerId: 'v-sam',
            text: '嘿！新专辑排练完了，来听听吗？',
            createdAt: Date.now() - 3600e3 * 8,
          }],
          unread: 0,
        },
      });
    } else if (Array.isArray(rawChat)) {
      // 旧结构迁移：v2.3.0 的 chat 数组（单机器人会话）→ 归入 v-robin 会话
      const old = { 'v-robin': { messages: rawChat, unread: 0 } };
      write('chat', old);
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
   * v2.4.1 登录状态：游客登录 / 退出（账号密码登录恒失败由 UI 层处理）
   * 登录记录独立存储于 localStorage，刷新自动读取；
   * 退出仅清除登录状态，不影响游客档案与社区数据
   * ============================================================ */
  function getLoginState() {
    seedIfEmpty();
    return read('login', null);
  }
  function guestLogin() {
    seedIfEmpty();
    write('login', { mode: 'guest', loggedAt: Date.now() });
    return read('login', null);
  }
  function logout() {
    try { localStorage.removeItem(NS + 'login'); } catch (e) {}
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

  /* 互动计数（仅修改本地 Mock 计数）；
   * v2.4.0：游客点赞/收藏/评论村民的帖子时，生成记录型互动通知（direction:'me'） */
  function toggleLike(id) {
    seedIfEmpty();
    const me = getProfile();
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
      if (post.authorId !== me.id) {
        const v = villagerById(post.authorId) || { nick: '村民' };
        pushNotice({ type: 'like', villagerId: post.authorId, postId: id, text: '你赞了' + v.nick + '的帖子', direction: 'me' });
      }
    }
    persistPost(post);
    return { ok: true, liked: !liked, count: post.likes };
  }

  function toggleFavorite(id) {
    seedIfEmpty();
    const me = getProfile();
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
      if (post.authorId !== me.id) {
        const v = villagerById(post.authorId) || { nick: '村民' };
        pushNotice({ type: 'favorite', villagerId: post.authorId, postId: id, text: '你收藏了' + v.nick + '的帖子', direction: 'me' });
      }
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
    // v2.4.0 互动记录：游客评论村民帖子 → 生成记录型通知
    if (post.authorId !== me.id) {
      const v = villagerById(post.authorId) || { nick: '村民' };
      pushNotice({ type: 'comment', villagerId: post.authorId, postId, text: '你评论了' + v.nick + '的帖子', direction: 'me' });
    }
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

  /** 通知分类：type='follow' → 新关注我的；like/comment/favorite → 互动消息 */
  function noticeCategory(n) {
    return n.type === 'follow' ? 'follow' : 'interact';
  }

  /** 分类通知列表（follow / interact） */
  function fetchNotices(category) {
    seedIfEmpty();
    const cat = category === 'follow' ? 'follow' : 'interact';
    return read('notices', [])
      .filter((n) => noticeCategory(n) === cat)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** 分类未读数 */
  function unreadByCategory(category) {
    seedIfEmpty();
    const cat = category === 'follow' ? 'follow' : 'interact';
    return read('notices', []).filter((n) => !n.read && noticeCategory(n) === cat).length;
  }

  /** 进入分类通知列表：标记该分类全部已读 */
  function markCategoryRead(category) {
    seedIfEmpty();
    const cat = category === 'follow' ? 'follow' : 'interact';
    const notices = read('notices', []);
    notices.forEach((n) => { if (noticeCategory(n) === cat) n.read = true; });
    write('notices', notices);
    return notices.length;
  }

  /** 未读消息总数（消息 Tab 角标）= 通知未读 + 会话未读合计 */
  function unreadCount() {
    seedIfEmpty();
    const noticeUnread = read('notices', []).filter((n) => !n.read).length;
    return noticeUnread + chatUnreadTotal();
  }

  /** 写入一条通知；direction='me' 表示游客发起互动的记录型通知，缺省为村民对游客的互动 */
  function pushNotice({ type, villagerId, postId, text, direction }) {
    const notices = read('notices', []);
    notices.push({
      id: uid('n'), type, villagerId, postId,
      text: String(text || ''),
      read: false, createdAt: Date.now(),
      direction: direction || 'villager',
    });
    write('notices', notices);
  }

  /* ============================================================
   * 私聊会话（v2.4.0：多会话，按对方 id 分桶）
   * chat 结构：{ [peerId]: { messages: [{id, from:'me'|'villager', villagerId, text, createdAt}], unread } }
   * 机器人（村民）按会话固定身份 mock 应答；聊天记录全部本地存储。
   * ============================================================ */
  function fetchChat(peerId) {
    seedIfEmpty();
    const all = read('chat', {});
    const box = all[peerId || 'v-robin'] || { messages: [], unread: 0 };
    return box.messages.slice().sort((a, b) => a.createdAt - b.createdAt);
  }

  /** 确保会话存在（私信 / 创建会话时调用）；不存在则初始化空会话 */
  function startConversation(peerId) {
    seedIfEmpty();
    if (!peerId) return null;
    const all = read('chat', {});
    if (!all[peerId]) {
      all[peerId] = { messages: [], unread: 0 };
      write('chat', all);
    }
    return peerId;
  }

  /** 进入私聊窗口：标记该会话全部消息已读 */
  function openChat(peerId) {
    seedIfEmpty();
    const all = read('chat', {});
    if (all[peerId] && all[peerId].unread) {
      all[peerId].unread = 0;
      write('chat', all);
    }
    return peerId;
  }

  /** 单会话未读数 */
  function chatUnreadOf(peerId) {
    seedIfEmpty();
    const all = read('chat', {});
    return (all[peerId] || {}).unread || 0;
  }

  /** 全部会话未读合计（消息 Tab 角标的一部分） */
  function chatUnreadTotal() {
    seedIfEmpty();
    const all = read('chat', {});
    return Object.keys(all).reduce((sum, k) => sum + ((all[k].unread) || 0), 0);
  }

  /**
   * 会话列表（按最后消息时间倒序）：
   * [{ peerId, peer: 村民资料对象, preview: 最后一条消息预览, time: 最后消息时间, unread }]
   */
  function fetchConversations() {
    seedIfEmpty();
    const all = read('chat', {});
    return Object.keys(all).map((peerId) => {
      const box = all[peerId];
      const last = box.messages[box.messages.length - 1] || null;
      return {
        peerId,
        peer: villagerById(peerId) || { id: peerId, nick: '村民', avatar: '🧑‍🌾', color: '#6a8a5a' },
        preview: last ? (last.from === 'me' ? '我：' + last.text : last.text) : '打个招呼吧',
        time: last ? last.createdAt : Date.now(),
        unread: box.unread || 0,
      };
    }).sort((a, b) => b.time - a.time);
  }

  /** 游客发送聊天消息（到指定会话）→ 对方村民延迟应答 */
  function sendChat(peerId, text) {
    seedIfEmpty();
    const content = String(text || '').trim();
    if (!content) return null;
    startConversation(peerId);
    const me = getProfile();
    const msg = {
      id: uid('chat'), from: 'me', authorId: me.id, villagerId: null,
      text: content, createdAt: Date.now(),
    };
    const all = read('chat', {});
    all[peerId].messages.push(msg);
    all[peerId].unread = 0; // 自己发送后清空该会话未读
    write('chat', all);
    scheduleBotChatReply(peerId);
    return msg;
  }

  /** 机器人延迟应答（2~5 秒，由该会话对方村民应答） */
  function scheduleBotChatReply(peerId) {
    const v = villagerById(peerId) || VILLAGERS[Math.floor(Math.random() * VILLAGERS.length)];
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
      const all = read('chat', {});
      if (!all[peerId]) all[peerId] = { messages: [], unread: 0 };
      all[peerId].messages.push(msg);
      all[peerId].unread = (all[peerId].unread || 0) + 1; // 机器人新消息 → 会话未读 +1
      write('chat', all);
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

  /* ============================================================
   * 关注关系（v2.4.0）
   * follows 结构：{ following: [村民id...], followers: [村民id...] } 全部本地存储
   * - 游客关注村民 → 该村民粉丝 +1；取消关注 → -1
   * - 关注后村民延迟回关 → 生成「新关注我的」通知（type:'follow'）
   * - 互相关注 = following 与 followers 交集（如预置罗宾已关注游客）
   * ============================================================ */
  function fetchFollows() {
    seedIfEmpty();
    const f = read('follows', { following: [], followers: [] });
    return {
      following: (f.following || []).map((id) => villagerById(id)).filter(Boolean),
      followers: (f.followers || []).map((id) => villagerById(id)).filter(Boolean),
    };
  }

  /** 与某村民的关注关系快照 */
  function followStateOf(targetId) {
    seedIfEmpty();
    const f = read('follows', { following: [], followers: [] });
    const following = (f.following || []).includes(targetId);
    const follower = (f.followers || []).includes(targetId);
    return { following, follower, mutual: following && follower };
  }

  /** 关注/取消关注村民：对方粉丝数随动 + 触发回关（生成「新关注我的」通知） */
  function toggleFollow(targetId) {
    seedIfEmpty();
    const me = getProfile();
    if (!targetId || targetId === me.id) return { ok: false };
    const v = villagerById(targetId);
    if (!v) return { ok: false };
    const f = read('follows', { following: [], followers: [] });
    const following = (f.following || []).includes(targetId);
    if (following) {
      f.following = (f.following || []).filter((x) => x !== targetId);
      write('follows', f);
      scheduleFollowBackCancel();
      return { ok: true, following: false, fans: v.baseFans, mutual: false };
    }
    f.following = (f.following || []).concat(targetId);
    write('follows', f);
    scheduleFollowBack(targetId);
    const st = followStateOf(targetId);
    return { ok: true, following: true, fans: v.baseFans + 1, mutual: st.mutual };
  }

  /** 游客关注村民后：该村民延迟回关（3~8 秒），生成「新关注我的」通知 */
  function scheduleFollowBack(targetId) {
    const v = villagerById(targetId);
    if (!v) return;
    const delay = 3000 + Math.random() * 5000;
    setTimeout(() => {
      const f = read('follows', { following: [], followers: [] });
      if (!(f.followers || []).includes(targetId)) {
        f.followers = (f.followers || []).concat(targetId);
        write('follows', f);
        pushNotice({ type: 'follow', villagerId: targetId, postId: null, text: v.nick + ' 关注了你' });
      }
    }, delay);
  }

  /** 取消关注时的占位（当前无额外副作用，保留语义注释） */
  function scheduleFollowBackCancel() { /* 取消关注不回滚对方关注状态 */ }

  /** 关注 / 粉丝 / 互关计数 */
  function followCounts() {
    const f = fetchFollows();
    const fw = f.following;
    const fr = f.followers;
    const mutual = fw.filter((x) => fr.some((y) => y.id === x.id));
    return { following: fw.length, followers: fr.length, mutual: mutual.length };
  }

  /** 获赞统计：该作者全部帖子 likes 实时求和（取消点赞自动同步） */
  function countAuthorLikes(authorId) {
    seedIfEmpty();
    return read('posts', []).filter((p) => p.authorId === authorId).reduce((s, p) => s + (p.likes || 0), 0);
  }

  /** 互动消息「获赞」弹窗数据：赞过我帖子的村民（按 villagerId 去重） */
  function fetchLikers() {
    seedIfEmpty();
    const seen = {};
    return read('notices', [])
      .filter((n) => n.type === 'like' && n.direction !== 'me')
      .map((n) => n.villagerId)
      .filter((id) => { if (!id || seen[id]) return false; seen[id] = true; return true; })
      .map((id) => villagerById(id)).filter(Boolean);
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
    getProfile, setProfile, getLoginState, guestLogin, logout,
    fetchPosts, fetchPostDetail, createPost, updatePost, deletePost,
    toggleLike, toggleFavorite, fetchComments, addComment, countComments, hasGuestCommented,
    fetchMessages, fetchNotices, unreadByCategory, markCategoryRead, markAllRead, unreadCount,
    fetchChat, sendChat, fetchConversations, startConversation, openChat, chatUnreadOf, chatUnreadTotal,
    followStateOf, toggleFollow, fetchFollows, followCounts, countAuthorLikes, fetchLikers,
    fetchMyPosts, fetchMyLikes, fetchMyFavorites, canView, canEdit,
    villagerById, __villagers, resetForTest,
  };
})();
