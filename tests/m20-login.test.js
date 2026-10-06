'use strict';
/* M20 阶段测试：v2.4.1 我的页登录（未登录/已登录双视图、登录弹窗、游客登录、退出登录、状态持久化） */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref } = require('./helpers/harness.js');

loadApp();

const API = ref('CommunityAPI');
const Pages = ref('Pages');
const els = globalThis.__testEls;

/** 构造带 closest 匹配表的点击目标（与 m5 测试一致） */
function clickTarget(map) {
  return { closest(sel) { return Object.prototype.hasOwnProperty.call(map, sel) ? map[sel] : null; } };
}

before(() => {
  if (ref('Store')) ref('Store').load();
  if (typeof API !== 'undefined' && API.resetForTest) API.resetForTest();
});

test('M20-1 默认未登录：无登录记录时我的页渲染未登录视图（登录卡片 + 底部板块保留）', () => {
  assert.equal(API.getLoginState(), null, '默认无登录记录');
  const html = Pages.mine();
  assert.ok(html.includes('login-entry-card'), '未登录视图缺少登录卡片');
  assert.ok(html.includes('data-action="open-login"'), '登录卡片可点击弹出登录弹窗');
  assert.ok(html.includes('星露谷村民'), '登录卡片含村民文案');
  assert.ok(!html.includes('stat-row'), '未登录不应显示统计行');
  assert.ok(!html.includes('data-action="logout"'), '未登录不应有退出按钮');
  assert.ok(html.includes('data-route="#/settings"') && html.includes('关于'), '底部设置入口/关于保留');
  assert.ok(!html.includes('主题设置'), '主题设置板块已迁移至设置页');
});

test('M20-2 游客登录：写入登录状态并渲染已登录个人主页', () => {
  const st = API.guestLogin();
  assert.ok(st && st.mode === 'guest', '游客登录状态写入');
  assert.ok(localStorage.getItem('sdv-guide:community:login'), '登录状态落盘 localStorage');
  const html = Pages.mine();
  assert.ok(html.includes('profile-banner'), '已登录视图顶部宽幅背景');
  assert.ok(html.includes('stat-row'), '4 个数据方块统计行');
  assert.ok(html.includes('获赞') && html.includes('互关') && html.includes('关注') && html.includes('粉丝'), '四项统计文案齐全');
  assert.ok(html.includes('data-action="edit-profile"'), '红色编辑主页按钮');
  assert.ok(html.includes('data-action="profile-tab"'), '作品/收藏标签栏');
  assert.ok(html.includes('data-route="#/settings"'), '设置入口');
  assert.ok(!html.includes('data-action="logout"'), '退出按钮已迁移至设置页');
  assert.ok(!html.includes('login-entry-card'), '已登录视图不含登录卡片');
});

test('M20-3 状态持久化：刷新后重新读取 localStorage 登录状态保持', () => {
  // 模拟刷新：直接重新读取 localStorage（同进程存储即刷新后的状态）
  const raw = JSON.parse(localStorage.getItem('sdv-guide:community:login'));
  assert.equal(raw.mode, 'guest');
  assert.ok(API.getLoginState(), 'getLoginState 读回登录状态');
  assert.ok(Pages.mine().includes('profile-banner'), '刷新后仍渲染已登录视图');
});

test('M20-4 退出登录：清除登录状态，页面切回未登录视图', () => {
  API.logout();
  assert.equal(localStorage.getItem('sdv-guide:community:login'), null, '登录键已删除');
  assert.equal(API.getLoginState(), null, 'getLoginState 返回 null');
  const html = Pages.mine();
  assert.ok(html.includes('login-entry-card'), '退出后回未登录视图');
  assert.ok(!html.includes('stat-row'), '已登录元素消失');
});

test('M20-5 登录弹窗：账号密码登录恒失败（状态不变）、游客登录成功（状态+视图切换）', () => {
  API.resetForTest();
  // ① 点击登录卡片 → 弹出登录弹窗（含账号/密码输入框 + 两个操作按钮）
  __fireDoc('click', {
    target: clickTarget({ '[data-action]': { dataset: { action: 'open-login' } } }),
  });
  const modalHtml = els.get('modal-root').innerHTML;
  assert.ok(modalHtml.includes('login-account'), '弹窗含账号输入框');
  assert.ok(modalHtml.includes('login-password'), '弹窗含密码输入框');
  assert.ok(modalHtml.includes('账号密码登录') && modalHtml.includes('游客登录'), '弹窗含两个操作按钮');
  // ② 账号密码登录（Modal 首个动作按钮）→ 提示失败且不改变登录状态
  const beforeSt = API.getLoginState();
  const mask = els.get('modal-root').querySelector('.modal-mask');
  fire(mask, 'click', {
    target: clickTarget({ '[data-modal-action]': { dataset: { modalAction: '0' } } }),
  });
  assert.equal(API.getLoginState(), beforeSt, '账号密码登录不改变登录状态');
  // ③ 游客登录（重新弹窗，点击游客登录动作按钮）→ 状态写入 + 视图切换
  API.resetForTest();
  __fireDoc('click', {
    target: clickTarget({ '[data-action]': { dataset: { action: 'open-login' } } }),
  });
  const mask2 = els.get('modal-root').querySelector('.modal-mask');
  fire(mask2, 'click', {
    target: clickTarget({ '[data-modal-action]': { dataset: { modalAction: '1' } } }),
  });
  assert.ok(API.getLoginState() && API.getLoginState().mode === 'guest', '游客登录写入状态');
  assert.ok(Pages.mine().includes('profile-banner'), '游客登录后渲染已登录视图');
  // ④ 退出登录：点击退出按钮弹确认弹窗，确认后清除状态
  __fireDoc('click', {
    target: clickTarget({ '[data-action]': { dataset: { action: 'logout' } } }),
  });
  const confirmHtml = els.get('modal-root').innerHTML;
  assert.ok(confirmHtml.includes('退出登录'), '弹出退出确认弹窗');
  const mask3 = els.get('modal-root').querySelector('.modal-mask');
  fire(mask3, 'click', {
    target: clickTarget({ '[data-modal-action]': { dataset: { modalAction: '1' } } }),
  });
  assert.equal(API.getLoginState(), null, '确认退出后登录状态清除');
  assert.ok(Pages.mine().includes('login-entry-card'), '退出后回未登录视图');
});
