'use strict';
/* M16 阶段测试：v2.4.0 社交模块（关注关系 / 多会话私聊 / 通知分类 / 获赞统计 / 个人主页渲染） */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref } = require('./helpers/harness.js');

loadApp();

const API = ref('CommunityAPI');
const Community = ref('Community');
const Pages = ref('Pages');

before(() => {
  if (ref('Store')) ref('Store').load();
  if (typeof API !== 'undefined' && API.resetForTest) API.resetForTest();
});

test('M16-1 关注关系种子：预置罗宾已关注游客（互相关注可体验）', () => {
  const f = API.fetchFollows();
  assert.deepEqual(f.following.map((x) => x.id), [], '初始未关注任何人');
  assert.ok(f.followers.some((x) => x.id === 'v-robin'), '预置罗宾关注游客');
  const st = API.followStateOf('v-robin');
  assert.equal(st.follower, true, '罗宾在粉丝列表');
  assert.equal(st.mutual, false, '尚未互相关注');
});

test('M16-2 关注/取消：对方粉丝数 +1/-1，状态切换', () => {
  const base = API.villagerById('v-pierre').baseFans;
  const r1 = API.toggleFollow('v-pierre');
  assert.equal(r1.ok, true);
  assert.equal(r1.following, true);
  assert.equal(r1.fans, base + 1, '关注后对方粉丝 +1');
  assert.equal(API.followStateOf('v-pierre').following, true);
  const r2 = API.toggleFollow('v-pierre');
  assert.equal(r2.following, false);
  assert.equal(r2.fans, base, '取消后对方粉丝 -1');
  assert.equal(API.followStateOf('v-pierre').following, false);
});

test('M16-3 互相关注：关注已预置关注我的罗宾 → mutual=true', () => {
  API.toggleFollow('v-robin');
  const st = API.followStateOf('v-robin');
  assert.equal(st.following, true);
  assert.equal(st.follower, true);
  assert.equal(st.mutual, true, '关注罗宾后成为互相关注');
  assert.equal(API.followCounts().mutual, 1);
  API.toggleFollow('v-robin'); // 还原状态
  assert.equal(API.followCounts().mutual, 0);
});

test('M16-4 获赞统计：作者全部帖子 likes 实时求和', () => {
  assert.equal(API.countAuthorLikes('v-leah'), 37, '莉亚 = seed-1(23) + seed-7(14)');
  const me = API.getProfile();
  assert.equal(API.countAuthorLikes(me.id), 0, '游客暂无获赞');
});

test('M16-5 会话种子：罗宾 1 条未读 + 山姆会话 + 消息可读', () => {
  const convs = API.fetchConversations();
  assert.ok(convs.length >= 2, '预置 ≥2 个会话');
  const robin = convs.find((c) => c.peerId === 'v-robin');
  assert.ok(robin, '存在罗宾会话');
  assert.equal(robin.unread, 1, '罗宾会话预置 1 条未读');
  assert.equal(API.chatUnreadTotal(), 1);
  const chat = API.fetchChat('v-robin');
  assert.ok(chat.length >= 1 && chat[0].text.includes('罗宾'), '罗宾会话含预置问候');
  const sam = API.fetchChat('v-sam');
  assert.ok(sam.length >= 1, '山姆会话含预置消息');
});

test('M16-6 私聊发送 + 已读：sendChat 追加、openChat 清零', () => {
  API.startConversation('v-robin');
  const before = API.fetchChat('v-robin').length;
  const m = API.sendChat('v-robin', '你好，罗宾！');
  assert.ok(m && m.from === 'me');
  assert.equal(API.fetchChat('v-robin').length, before + 1, '发送后消息 +1');
  assert.equal(API.chatUnreadOf('v-robin'), 0, '自己发送后该会话未读清零');
  // 模拟对方新消息（直接写入数据层，等价机器人应答后的未读 +1）
  const all = JSON.parse(localStorage.getItem('sdv-guide:community:chat'));
  all['v-robin'].unread = 2;
  localStorage.setItem('sdv-guide:community:chat', JSON.stringify(all));
  assert.equal(API.chatUnreadTotal(), 2);
  API.openChat('v-robin');
  assert.equal(API.chatUnreadOf('v-robin'), 0, '进入会话后未读清零');
});

test('M16-7 消息 Tab 角标 = 通知未读 + 会话未读合计', () => {
  API.resetForTest();
  // 种子：通知未读 2（莉亚赞帖 + 罗宾关注）+ 会话未读 1（罗宾）= 3
  assert.equal(API.unreadCount(), 3);
});

test('M16-8 通知分类：follow / interact 分组 + 分类已读', () => {
  API.resetForTest();
  const followList = API.fetchNotices('follow');
  assert.ok(followList.length >= 1 && followList[0].text.includes('关注了你'), '新关注我的含关注通知');
  const interactList = API.fetchNotices('interact');
  assert.ok(interactList.some((n) => n.text.includes('赞了你的帖子')), '互动消息含点赞通知');
  assert.equal(API.unreadByCategory('follow'), 1);
  assert.equal(API.unreadByCategory('interact'), 1);
  API.markCategoryRead('follow');
  assert.equal(API.unreadByCategory('follow'), 0, '分类已读生效');
  assert.equal(API.unreadByCategory('interact'), 1, '另一分类不受影响');
});

test('M16-9 互动记录：游客赞村民帖子生成记录型通知；自己帖子不生成', () => {
  API.resetForTest();
  API.toggleLike('seed-1'); // 莉亚的帖子
  const rec = API.fetchNotices('interact').find((n) => n.direction === 'me');
  assert.ok(rec && rec.text.includes('你赞了莉亚的帖子'), '点赞村民帖子生成记录型通知');
  // 自己发帖后点赞自己不生成记录
  const post = API.createPost({ title: '测试帖', body: '内容', images: [], visibility: 'public', allowedUsers: [] });
  const n0 = API.fetchNotices('interact').length;
  API.toggleLike(post.id);
  assert.equal(API.fetchNotices('interact').length, n0, '点赞自己帖子不生成记录');
});

test('M16-10 消息页渲染：顶部栏/通知双入口/会话列表（无横向头像栏）', () => {
  API.resetForTest();
  const html = Pages.messages();
  assert.ok(html.includes('msg-topbar'), '顶部栏');
  assert.ok(html.includes('data-action="new-conversation"'), '创建会话按钮');
  assert.ok(!html.includes('avatar-strip'), 'v2.4.2 已移除横向头像栏');
  assert.ok(html.includes('data-route="#/notices/follow"'), '新关注我的入口');
  assert.ok(html.includes('data-route="#/notices/interact"'), '互动消息入口');
  assert.ok(html.includes('conv-item'), '会话列表条目');
  assert.ok(html.includes('data-route="#/chat/v-robin"'), '会话跳转私聊窗口');
});

test('M16-11 通知列表渲染：分类标题 + 全部已读 + 返回', () => {
  const html = Pages.noticesPage('follow');
  assert.ok(html.includes('新关注我的'), '分类标题');
  assert.ok(html.includes('mark-cat-read'), '分类全部已读按钮');
  assert.ok(html.includes('data-action="nav-back"'), '返回按钮');
});

test('M16-12 私聊窗口渲染：气泡 + 发送按钮（data-peer）', () => {
  const html = Pages.chatPage('v-robin');
  assert.ok(html.includes('chat-bubble'), '气泡布局');
  assert.ok(html.includes('罗宾'), '对方昵称');
  assert.ok(html.includes('data-action="chat-send" data-peer="v-robin"'), '发送按钮带会话对方');
  assert.ok(html.includes('chat-input'), '输入框');
});

test('M16-13 我的主页渲染：统计行/标签栏/编辑主页 + 底部设置入口/关于（主题设置已迁移）', () => {
  API.guestLogin(); // v2.4.1：个人主页需游客登录后可见
  const html = Pages.mine();
  assert.ok(html.includes('profile-banner'), '顶部背景区');
  assert.ok(html.includes('stat-row'), '数据统计行');
  assert.ok(html.includes('data-action="stats-list"'), '统计弹窗');
  assert.ok(html.includes('data-kind="followers"'), '粉丝统计');
  assert.ok(html.includes('profile-bio'), '简介区');
  assert.ok(html.includes('data-action="edit-profile"'), '编辑主页按钮');
  assert.ok(html.includes('data-action="profile-tab"'), '标签栏切换');
  assert.ok(html.includes('data-route="#/settings"'), '底部设置入口');
  assert.ok(!html.includes('主题设置'), '主题设置板块已迁移至设置页');
  assert.ok(html.includes('class="card card-link" data-route="#/settings"'), '设置板块整卡可点击');
  assert.ok(!html.includes('进入设置'), '设置板块已移除内部跳转文字');
  assert.ok(html.includes('管理后台'), '底部管理后台独立板块');
  assert.ok(html.includes('class="card card-link" data-action="open-admin"'), '管理后台板块整卡可点击');
  assert.ok(!html.includes('管理后台（预留）'), '管理后台板块已移除内部跳转文字');
  assert.ok(!html.includes('更多'), '无更多板块');
  assert.ok(html.includes('关于'), '底部保留关于板块');
  assert.ok(html.includes('data-action="check-update"'), '版本检测保留');
});

test('M16-14 他人主页渲染：三态关注/私信/IP属地/作品推荐标签', () => {
  const html = Pages.userPage('v-robin');
  assert.ok(html.includes('罗宾'), '昵称');
  assert.ok(html.includes('profile-banner'), '顶部背景');
  assert.ok(html.includes('data-action="nav-back"'), '返回箭头');
  assert.ok(html.includes('ip-tag'), 'IP属地标签');
  assert.ok(html.includes('鹈鹕镇·木匠铺'), '罗宾属地');
  assert.ok(html.includes('data-action="follow" data-user="v-robin"'), '关注按钮');
  assert.ok(html.includes('data-route="#/chat/v-robin"'), '私信按钮跳私聊');
  assert.ok(html.includes('data-action="user-tab"'), '作品/推荐标签');
});

test('M16-15 自己主页路由：user/{me} 渲染我的主页（含编辑主页）', () => {
  API.guestLogin();
  const me = API.getProfile();
  const html = Pages.userPage(me.id);
  assert.ok(html.includes('profile-banner'), '自己主页含背景区');
  assert.ok(html.includes('data-action="edit-profile"'), '仅自己显示编辑主页');
});

test('M16-16 帖子卡片：作者头像跳主页（data-avatar-user）+ 加号关注按钮（村民帖有、自己帖无）', () => {
  API.resetForTest();
  const me = API.getProfile();
  const card = Community.renderHomeBlock();
  assert.ok(card.includes('data-avatar-user="v-leah"'), '村民作者头像点击跳他人主页');
  assert.ok(card.includes('avatar-follow'), '村民作者头像带加号关注按钮');
  API.createPost({ title: '我的卡片', body: 'x', images: [], visibility: 'public', allowedUsers: [] });
  const meCard = Community.renderHomeBlock();
  assert.ok(!meCard.includes('data-user="' + me.id + '"'), '自己帖子卡片无关注按钮');
});
