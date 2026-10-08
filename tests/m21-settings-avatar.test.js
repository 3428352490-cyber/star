'use strict';
/* M21 阶段测试：v2.4.2 设置页（主题设置迁移 + 账号退出板块）、全局头像跳转、回车电脑/手机端区分、消息页去头像栏 */
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref } = require('./helpers/harness.js');

loadApp();

const API = ref('CommunityAPI');
const Pages = ref('Pages');
const Community = ref('Community');
const els = globalThis.__testEls;

/** 构造带 closest 匹配表的点击目标（与 m5/m20 测试一致） */
function clickTarget(map) {
  return { closest(sel) { return Object.prototype.hasOwnProperty.call(map, sel) ? map[sel] : null; } };
}

before(() => {
  if (ref('Store')) ref('Store').load();
  if (typeof API !== 'undefined' && API.resetForTest) API.resetForTest();
});

beforeEach(() => {
  if (typeof API !== 'undefined' && API.resetForTest) API.resetForTest();
  location.hash = '#/home';
});

test('M21-1 设置页渲染：主题设置板块迁移完整保留 + 账号板块（未登录显示未登录、已登录显示账号名与退出按钮）', () => {
  // 未登录：主题设置功能完整 + 账号板块显示未登录、无退出按钮
  const loggedOut = Community.renderSettings();
  assert.ok(loggedOut.includes('主题设置'), '设置页含主题设置板块');
  assert.ok(loggedOut.includes('data-theme-follow'), '跟随系统开关迁移保留');
  assert.ok(loggedOut.includes('data-theme-manual-switch'), '手动主题开关（v2.5.5 开关UI）缺失');
  assert.ok(!loggedOut.includes('data-theme-manual="light"') && !loggedOut.includes('data-theme-manual="dark"'), '旧手动主题方块按钮未移除');
  assert.ok(loggedOut.includes('未登录'), '未登录时账号板块显示未登录');
  assert.ok(!loggedOut.includes('data-action="logout"'), '未登录时无退出按钮');
  assert.ok(loggedOut.includes('data-action="nav-back"'), '设置页含返回按钮');

  // 已登录：账号板块显示昵称 + 退出登录按钮
  API.guestLogin();
  const me = API.getProfile();
  const loggedIn = Community.renderSettings();
  assert.ok(loggedIn.includes(me.nick), '账号板块展示当前登录账号名称');
  assert.ok(loggedIn.includes('data-action="logout"'), '账号名称右侧放置退出登录按钮');
});

test('M21-2 我的页：设置入口存在、主题设置与退出按钮已迁出', () => {
  // 路由级联：#/settings 应渲染设置页（PAGE_ALIASES 注册）
  const Router = ref('Router');
  if (Router) {
    location.hash = '#/settings';
    Router.handle();
    assert.ok(document.getElementById('page-container').innerHTML.includes('主题设置'), '路由 #/settings 渲染设置页');
  } else {
    assert.ok(typeof Pages.settings === 'function', 'Pages.settings 已注册');
  }
  // 未登录视图
  const loginHtml = Pages.mine();
  assert.ok(loginHtml.includes('data-route="#/settings"'), '未登录视图有设置入口');
  assert.ok(!loginHtml.includes('data-theme-follow'), '未登录视图不含主题设置（已迁移）');
  // 已登录视图
  API.guestLogin();
  const html = Pages.mine();
  assert.ok(html.includes('data-route="#/settings"'), '已登录视图有设置入口');
  assert.ok(!html.includes('data-action="logout"'), '我的页底部退出按钮已移除（迁至设置页）');
  assert.ok(!html.includes('data-theme-follow'), '已登录视图不含主题设置（已迁移）');
});

test('M21-3 全局头像跳转：各界面头像带 data-avatar-user，点击自动判断身份', () => {
  // 帖子卡片（首页瀑布流）
  assert.ok(Community.renderHomeBlock().includes('data-avatar-user="v-leah"'), '帖子卡片头像带跳转');
  // 帖子详情（作者头像 + 评论头像）
  const detail = Community.renderPostDetail('seed-1');
  assert.ok(detail.includes('data-avatar-user="'), '详情页头像带跳转');
  // 通知列表
  assert.ok(Pages.noticesPage('follow').includes('data-avatar-user="'), '通知列表头像带跳转');
  // 消息页会话列表
  assert.ok(Pages.messages().includes('data-avatar-user="'), '会话列表头像带跳转');
  // 私聊窗口（头部 + 气泡）
  assert.ok(Pages.chatPage('v-robin').includes('data-avatar-user="'), '私聊窗口头像带跳转');
  // 我的主页 / 他人主页大头像
  API.guestLogin();
  const me = API.getProfile();
  assert.ok(Pages.mine().includes('data-avatar-user="' + me.id + '"'), '我的主页大头像带跳转');
  assert.ok(Pages.userPage('v-robin').includes('data-avatar-user="v-robin"'), '他人主页大头像带跳转');

  // 统计弹窗（获赞/互关/关注/粉丝列表）头像带跳转：触发 stats-list 后检查弹窗内容
  __fireDoc('click', {
    target: clickTarget({ '[data-action]': { dataset: { action: 'stats-list', kind: 'followers' } } }),
  });
  const modalHtml = els.get('modal-root').innerHTML;
  assert.ok(modalHtml.includes('data-avatar-user="'), '统计弹窗用户列表头像带跳转');

  // 弹窗内点击他人头像 → 跳他人主页且自动关闭弹窗
  location.hash = '#/home';
  __fireDoc('click', {
    target: clickTarget({ '[data-avatar-user]': { dataset: { avatarUser: 'v-robin' } } }),
  });
  assert.equal(location.hash, '#/user/v-robin', '弹窗内点击他人头像跳他人主页');
  assert.ok(!els.get('modal-root').classList.contains('open'), '头像跳转后统计弹窗已关闭');

  // 点击他人头像 → 进入该用户他人主页
  location.hash = '#/home';
  __fireDoc('click', {
    target: clickTarget({ '[data-avatar-user]': { dataset: { avatarUser: 'v-robin' } } }),
  });
  assert.equal(location.hash, '#/user/v-robin', '点击他人头像跳他人主页');
  // 点击自己头像 → 进入自己的个人主页
  location.hash = '#/home';
  __fireDoc('click', {
    target: clickTarget({ '[data-avatar-user]': { dataset: { avatarUser: me.id } } }),
  });
  assert.equal(location.hash, '#/mine', '点击自己头像跳我的主页');
});

test('M21-4 消息页：顶部横向头像栏已移除，其余板块保留', () => {
  const html = Pages.messages();
  assert.ok(!html.includes('avatar-strip'), '横向头像栏已删除');
  assert.ok(html.includes('msg-topbar'), '顶部栏保留');
  assert.ok(html.includes('data-route="#/notices/follow"'), '新关注我的入口保留');
  assert.ok(html.includes('data-route="#/notices/interact"'), '互动消息入口保留');
  assert.ok(html.includes('conv-item'), '会话列表保留');
  assert.ok(html.includes('data-route="#/chat/v-robin"'), '会话跳转保留');
});

test('M21-5 回车提交：电脑端回车触发私聊/评论提交；手机端回车不触发', async () => {
  const SearchUI = ref('SearchUI');
  SearchUI.initSearchPanel();
  await new Promise((r) => setTimeout(r, 20));
  let sent = 0;
  let commented = 0;
  // 电脑端（hover + pointer:fine）
  globalThis.__testMql.set(true);
  document.querySelector('[data-action="chat-send"]').click = () => { sent += 1; };
  document.querySelector('[data-action="post-comment"]').click = () => { commented += 1; };
  __fireDoc('keydown', { key: 'Enter', target: { id: 'chat-input' } });
  assert.equal(sent, 1, '电脑端私聊输入框回车触发发送');
  __fireDoc('keydown', { key: 'Enter', target: { id: 'comment-input' } });
  assert.equal(commented, 1, '电脑端评论输入框回车触发发表');
  // 手机端（触屏）：回车不触发提交
  globalThis.__testMql.set(false);
  __fireDoc('keydown', { key: 'Enter', target: { id: 'chat-input' } });
  assert.equal(sent, 1, '手机端私聊回车不触发发送');
  __fireDoc('keydown', { key: 'Enter', target: { id: 'comment-input' } });
  assert.equal(commented, 1, '手机端评论回车不触发发表');
  // 手机端搜索框回车不触发搜索（isDesktopInput 同一分支）
  const input = document.getElementById('search-input');
  input.value = '手机端不触发';
  fire(input, 'keydown', { key: 'Enter', keyCode: 13, target: input });
  const hist = (typeof SearchUI !== 'undefined' && SearchUI.SearchHistory) ? SearchUI.SearchHistory.get() : [];
  assert.ok(!hist.includes('手机端不触发'), '手机端搜索回车不写入历史');
});
