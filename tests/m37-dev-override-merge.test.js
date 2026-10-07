'use strict';
/* M37 阶段测试：v2.4.24 覆盖页面合并到检查更新板块——
   管理面板的「同步覆盖」功能普通用户（游客）无法使用（面板仅开发者可见）。
   将覆盖页面功能合并进「检查更新」所在关于板块，普通用户可直接点击拉取云端内容覆盖页面。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();
const DevAdmin = ref('DevAdmin');

test('M37-1 关于板块新增「覆盖页面」入口（检查更新板块内）', () => {
  const src = readAppFile('js/community.js');
  assert.ok(src.includes('data-action="sync-page-override"'), '缺少覆盖页面按钮动作');
  assert.ok(src.includes('覆盖页面'), '缺少覆盖页面按钮文字');
  const seg = src.slice(src.indexOf('function renderMineLegacy'), src.indexOf('function mineTheme'));
  assert.ok(seg.includes('sync-page-override'), '覆盖页面入口未渲染在关于板块');
  assert.ok(seg.includes('check-update'), '检查更新按钮仍在同一板块');
});

test('M37-2 普通用户可用：未登录视图同样渲染覆盖页面入口', () => {
  const src = readAppFile('js/community.js');
  // renderMineLegacy 被 renderLoginEntry（未登录/游客视图）尾部调用 → 游客可见可用
  assert.ok(src.includes('renderMineLegacy()'), '未登录视图包含底部板块');
  assert.ok(src.includes('v2.4.24：关于板块新增「覆盖页面」入口（普通用户可用）'), '缺少合并语义说明');
});

test('M37-3 app.js 事件接线：覆盖页面调用同步覆盖', () => {
  const src = readAppFile('js/app.js');
  assert.ok(src.includes("case 'sync-page-override':"), '缺少覆盖页面事件分支');
  assert.ok(src.includes('DevAdmin.syncRemoteContent(true)'), '事件未调用同步覆盖');
  assert.ok(src.includes('同步模块未就绪，请稍后重试'), '缺少模块未就绪兜底提示');
});

test('M37-4 同步覆盖本身不要求开发者登录（游客可直接执行）', () => {
  const src = readAppFile('js/dev-admin.js');
  const seg = src.slice(src.indexOf('async function syncRemoteContent'), src.indexOf('/* ---------- 字体模板'));
  assert.ok(!seg.includes('isDev()'), '同步覆盖不应要求开发者登录');
  assert.ok(seg.includes('Toast.show(\'已同步远程内容并覆盖到页面\')'), '缺少成功提示');
  assert.ok(seg.includes('仓库配置缺失，无法同步远程内容'), '缺少配置缺失兜底提示');
});
