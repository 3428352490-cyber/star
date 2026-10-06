'use strict';
/* M22 阶段测试：v2.4.3 返回按钮统一 + 访问层级路由记录（返回上一级来源页，禁止直接跳首页） */
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref } = require('./helpers/harness.js');

loadApp();

const Router = ref('Router');
const Pages = ref('Pages');
const els = globalThis.__testEls;

/** 模拟点击 nav-back（走全局事件委托） */
function clickNavBack() {
  globalThis.__fireDoc('click', {
    target: { closest: (sel) => (sel === '[data-action]' ? { dataset: { action: 'nav-back' } } : null) },
  });
}

before(() => {
  if (ref('Store')) ref('Store').load();
  globalThis.location.hash = '#/home';
  Router.handle();
});

beforeEach(() => {
  globalThis.location.hash = '#/home';
  Router.handle();
});

test('M22-1 层级返回：我的→设置→返回我的（不越级跳首页）', () => {
  // 进入我的 Tab（重置层级根）
  globalThis.location.hash = '#/mine';
  Router.handle();
  assert.deepEqual(Router.getStack(), ['#/mine'], '我的页为访问根');
  // 进入设置页
  globalThis.location.hash = '#/settings';
  Router.handle();
  assert.deepEqual(Router.getStack(), ['#/mine', '#/settings'], '设置页记录来源层级');
  // 返回 → 我的页（不是首页）
  clickNavBack();
  assert.equal(globalThis.location.hash, '#/mine', '返回应回到上一级来源页（我的页）');
  Router.handle();
  assert.ok(els.get('page-container').innerHTML.includes('登录后查看'), '返回后渲染我的页');
});

test('M22-2 空栈兜底：直接进入设置页后返回 → 兜底到我的页而非首页', () => {
  Router.resetStack(); // 模拟无来源记录（如刷新后直入）
  globalThis.location.hash = '#/settings';
  Router.handle();
  clickNavBack();
  assert.equal(globalThis.location.hash, '#/mine', '空栈兜底回我的页，禁止直接跳首页');
});

test('M22-3 三级链路：首页→社区列表→帖子详情→返回社区列表→返回首页', () => {
  globalThis.location.hash = '#/home';
  Router.handle();
  globalThis.location.hash = '#/community';
  Router.handle();
  globalThis.location.hash = '#/post/seed-1';
  Router.handle();
  assert.deepEqual(Router.getStack(), ['#/home', '#/community', '#/post/seed-1'], '三级链路记录');
  clickNavBack();
  assert.equal(globalThis.location.hash, '#/community', '帖子详情返回社区列表');
  Router.handle();
  clickNavBack();
  assert.equal(globalThis.location.hash, '#/home', '社区列表返回首页');
});

test('M22-4 Tab 切换重置层级：消息→私聊→返回消息（平级 Tab 不串层）', () => {
  globalThis.location.hash = '#/home';
  Router.handle();
  globalThis.location.hash = '#/messages';
  Router.handle();
  globalThis.location.hash = '#/chat/v-robin';
  Router.handle();
  assert.deepEqual(Router.getStack(), ['#/messages', '#/chat/v-robin'], '消息 Tab 为根');
  clickNavBack();
  assert.equal(globalThis.location.hash, '#/messages', '私聊返回消息页');
});

test('M22-5 返回按钮统一：所有板块页左上角为文本箭头返回按钮（nav-back）', () => {
  assert.ok(Pages.settingsPage().includes('data-action="nav-back"'), '设置页返回按钮');
  assert.ok(Pages.userPage('v-robin').includes('data-action="nav-back"'), '他人主页返回按钮');
  assert.ok(Pages.chatPage('v-robin').includes('data-action="nav-back"'), '私聊窗口返回按钮');
  assert.ok(Pages.noticesPage('follow').includes('data-action="nav-back"'), '通知列表返回按钮');
  assert.ok(Pages.postDetail('seed-1').includes('data-action="nav-back"'), '帖子详情返回按钮');
  assert.ok(Pages.community().includes('data-action="nav-back"'), '社区列表返回按钮');
  assert.ok(Pages.minePosts().includes('data-action="nav-back"'), '我的帖子返回按钮');
  assert.ok(Pages.mineLikes().includes('data-action="nav-back"'), '我的点赞返回按钮');
  assert.ok(Pages.mineFavorites().includes('data-action="nav-back"'), '我的收藏返回按钮');
  assert.ok(Pages.quickEdit().includes('data-action="nav-back"'), '快捷键编辑页返回按钮');
  assert.ok(!Pages.home().includes('btn-back'), '首页（Tab）无返回按钮');
});
