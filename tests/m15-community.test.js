'use strict';
/* M15 阶段测试：v2.0.0 社区系统（数据层 Mock / 权限 / 页面骨架 / 导航改造） */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();

const CONFIG = ref('SDV_CONFIG');
const API = ref('CommunityAPI');
const Community = ref('Community');
const Pages = ref('Pages');

before(() => {
  if (ref('Store')) ref('Store').load();
  if (typeof API !== 'undefined' && API.resetForTest) API.resetForTest();
});

test('M15-1 版本双轨同步：代码版本（config.js/sw.js）一致；发布版本（version.json/notice.json）一致', () => {
  const cfgVer = CONFIG.app.version;
  assert.ok(/^\d+\.\d+\.\d+$/.test(cfgVer), 'config.js 代码版本应为合法语义化版本');
  assert.ok(readAppFile('sw.js').includes("CACHE_NAME = 'sdv-guide-v" + cfgVer + "'"), 'sw.js 缓存名应与 config.js 代码版本一致');
  const ver = JSON.parse(readAppFile('version.json'));
  const notice = JSON.parse(readAppFile('notice.json'));
  assert.equal(ver.latestVersion, notice.version, '发布版本（version.json / notice.json）应保持一致');
  assert.ok(/^\d+\.\d+\.\d+$/.test(ver.latestVersion), '发布版本应为合法语义化版本');
});

test('M15-2 底部导航改造：公告 Tab 移除、消息 Tab 新增', () => {
  const tabs = CONFIG.tabs.map((t) => t.key);
  assert.ok(tabs.includes('messages'), '底部导航应包含消息');
  assert.ok(!tabs.includes('news'), '底部导航不应再包含公告');
  const app = readAppFile('js/app.js');
  assert.ok(app.includes('messages: '), '导航图标应含消息图标');
  assert.ok(!app.includes("NAV_SVG['news']") && !app.includes('news:'), '应移除公告导航图标');
});

test('M15-3 首页：公告广告牌入口 + 老乡有话说板块 + 功能专区缩小卡片', () => {
  const html = Pages.home();
  assert.ok(html.includes('billboard-btn'), '首页缺少公告广告牌入口');
  assert.ok(html.includes('data-route="#/news"'), '广告牌应指向公告页');
  assert.ok(html.includes('老乡有话说'), '首页缺少老乡有话说板块');
  assert.ok(html.includes('refresh-posts'), '缺少刷新按钮动作');
  assert.ok(html.includes('open-post-modal'), '缺少发布按钮动作');
  assert.ok(html.includes('see-more-btn'), '缺少查看更多帖子按钮');
  assert.ok(html.includes('home-card-sm'), '功能专区卡片未缩小');
});

test('M15-4 数据层：帖子增删改查 + 可见权限（public 公共流 / partial 指定 / private 本人）', () => {
  // 公共流只含 public 帖子
  const posts = API.fetchPosts();
  assert.ok(posts.every((p) => p.visibility === 'public'), '公共流不应包含非 public 帖子');
  assert.ok(posts.length >= 1, '公共流应有预置帖子');
  // partial：作者与指定用户可看，他人不可看
  const partial = API.fetchPostDetail('seed-8');
  const me = API.getProfile();
  const asVillager = { id: 'v-pierre' }; // seed-8 作者
  assert.equal(partial, null, '游客（非指定用户）不应看到 partial 帖');
  // private：仅作者可看
  assert.equal(API.fetchPostDetail('seed-9'), null, '游客不应看到 private 帖');
  // 创建（作者=游客）→ 公共流可见
  const created = API.createPost({ title: '测试帖', body: '测试正文', visibility: 'public', allowedUsers: [], images: [] });
  assert.ok(created.id, '创建帖子失败');
  assert.ok(API.fetchPosts().some((p) => p.id === created.id), '新帖应进入公共流');
  // 部分可见：游客作为作者可看，勾选村民后他人可看
  const p2 = API.createPost({ title: '部分帖', body: 'x', visibility: 'partial', allowedUsers: ['v-robin'], images: [] });
  assert.ok(API.fetchPostDetail(p2.id), '作者应能看到自己的 partial 帖');
  // 编辑 / 删除
  const updated = API.updatePost(created.id, { title: '测试帖-改' });
  assert.equal(updated.title, '测试帖-改', '编辑失败');
  assert.equal(API.deletePost(created.id), true, '删除失败');
  assert.equal(API.fetchPostDetail(created.id), null, '删除后不应存在');
});

test('M15-5 数据层：点赞/收藏计数 + 我的数据 + 评论 + 消息已读', () => {
  const r = API.toggleLike('seed-1');
  assert.equal(r.ok, true, '点赞失败');
  assert.equal(r.liked, true, '第一次点赞应为已赞');
  const r2 = API.toggleLike('seed-1');
  assert.equal(r2.liked, false, '再次点赞应取消');
  const fav = API.toggleFavorite('seed-2');
  assert.equal(fav.ok, true, '收藏失败');
  assert.ok(API.fetchMyLikes().length >= 0, '我的点赞应可查询');
  assert.ok(API.fetchMyFavorites().length >= 0, '我的收藏应可查询');
  const c = API.addComment('seed-1', '测试评论');
  assert.ok(c && c.text === '测试评论', '新增评论失败');
  assert.ok(API.fetchComments('seed-1').some((x) => x.text === '测试评论'), '评论应可读取');
  // 消息：markAllRead 全部置读
  API.markAllRead();
  assert.ok(API.fetchMessages().every((m) => m.read), '全部已读后不应有未读');
});

test('M15-6 数据层：发帖后随机村民互动生成通知（模拟调度）', async () => {
  API.resetForTest();
  // v2.3.0 点赞通知规则：仅当游客发布过评论后，其帖子/评论被点赞才生成点赞通知。
  // 先发一条评论满足先决条件，保证 like / comment / favorite 三类通知均可生成。
  API.addComment('seed-1', '规则前置评论');
  const before = API.fetchMessages().length;
  const created = API.createPost({ title: '互动测试帖', body: 'x', visibility: 'public', allowedUsers: [], images: [] });
  // 等待随机互动调度（延迟 3~9 秒 + 村民间隔，最晚约 12 秒，预留余量）
  await new Promise((res) => setTimeout(res, 14000));
  const after = API.fetchMessages();
  assert.ok(after.length > before, '发帖后应生成村民互动通知');
  const related = after.filter((n) => n.postId === created.id);
  assert.ok(related.length >= 2, '应有 2~4 条村民互动通知，实际 ' + related.length);
});

test('M15-7 页面骨架：社区列表 / 帖子详情 / 消息页 / 我的子页可渲染', () => {
  const listHtml = Community.renderCommunityList();
  assert.ok(listHtml.includes('全部帖子'), '社区列表页骨架缺失');
  const detail = Community.renderPostDetail('seed-1');
  assert.ok(detail.includes('帖子详情'), '详情页骨架缺失');
  assert.ok(detail.includes('post-like') && detail.includes('post-fav') && detail.includes('post-comment'), '详情页缺少互动按钮');
  const msgs = Community.renderMessages();
  assert.ok(msgs.includes('通知'), '消息页骨架缺失');
  const minePosts = Community.renderMinePosts();
  assert.ok(minePosts.includes('我的帖子'), '我的帖子页骨架缺失');
  API.guestLogin(); // v2.4.1：个人主页需游客登录后可见
  assert.ok(Pages.mine().includes('open-admin'), '我的页缺少管理后台预留入口');
  assert.ok(Pages.mine().includes('data-action="profile-tab" data-tab="posts"'), '我的页缺少作品标签（v2.4.0 标签栏）');
});

test('M15-8 公告页：默认仅最近 3 条，更多/收起切换', () => {
  const list = CONFIG.announcements;
  assert.ok(list.length > 3, '公告应有 4 条以上以验证更多/收起');
  const html = Pages.news();
  const count = (html.match(/notice-item/g) || []).length;
  assert.equal(count, 3, '公告页默认应只展示 3 条，实际 ' + count);
  assert.ok(html.includes('news-toggle-more'), '缺少更多/收起按钮');
  Pages.newsResetExpand();
  assert.ok(Pages.newsToggleMore(), '展开应返回 true');
  const expanded = Pages.news();
  const count2 = (expanded.match(/notice-item/g) || []).length;
  assert.equal(count2, list.length, '展开后应展示全部公告');
  Pages.newsResetExpand();
});

test('M15-9 代码规范：数据层独立封装（页面不直接写数据逻辑）、接口预留', () => {
  const api = readAppFile('js/api.js');
  assert.ok(api.includes('CommunityAPI'), '缺少 CommunityAPI 封装');
  for (const fn of ['fetchPosts', 'fetchPostDetail', 'createPost', 'updatePost', 'deletePost', 'toggleLike', 'toggleFavorite', 'fetchComments', 'addComment', 'fetchMessages', 'markAllRead', 'fetchMyPosts', 'fetchMyLikes', 'fetchMyFavorites']) {
    assert.ok(api.includes(fn), '数据函数缺失: ' + fn);
  }
  assert.ok(api.includes('localStorage'), 'Mock 数据应持久化到 localStorage');
  assert.ok(api.includes('MemFire') || api.includes('CloudBase'), '缺少后端接入说明注释');
  const community = readAppFile('js/community.js');
  assert.ok(!community.includes('localStorage'), '页面渲染层不应直接操作数据存储');
  // index.html 引入顺序：api.js 在 community.js 之前
  const html = readAppFile('index.html');
  const iApi = html.indexOf('js/api.js');
  const iCom = html.indexOf('js/community.js');
  assert.ok(iApi >= 0 && iCom > iApi, 'index.html 应先引入 api.js 再引入 community.js');
});
