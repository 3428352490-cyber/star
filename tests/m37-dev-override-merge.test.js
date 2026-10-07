'use strict';
/* M37 阶段测试：覆盖页面功能合并（v2.4.24 → v2.4.25 演进）——
   最初将管理面板「同步覆盖」功能合并为我的页关于板块独立入口（v2.4.24）；
   v2.4.25 进一步合并进「检查更新」入口：点击检查更新 = 版本检测 + 主动拉取云端内容覆盖页面，
   普通用户（游客）无需开发者登录即可使用。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();
const DevAdmin = ref('DevAdmin');

test('M37-1 覆盖页面已合并进检查更新入口（不再有独立按钮）', () => {
  const src = readAppFile('js/community.js');
  const seg = src.slice(src.indexOf('function renderMineLegacy'), src.indexOf('function mineTheme'));
  assert.ok(!seg.includes('sync-page-override'), 'v2.4.25 不应再有独立覆盖页面按钮');
  assert.ok(seg.includes('check-update'), '检查更新入口仍存在');
  assert.ok(src.includes('v2.4.25：覆盖页面功能已合并进「检查更新」入口'), '缺少合并语义说明');
});

test('M37-2 普通用户可用：未登录视图同样包含检查更新（合并覆盖功能）', () => {
  const src = readAppFile('js/community.js');
  assert.ok(src.includes('renderMineLegacy()'), '未登录视图包含底部板块');
  assert.ok(src.includes('普通用户可用，无需开发者登录'), '缺少普通用户可用说明');
});

test('M37-3 app.js 事件接线：检查更新同时执行同步覆盖与版本比对', () => {
  const src = readAppFile('js/app.js');
  assert.ok(src.includes("case 'check-update':"), '缺少检查更新事件分支');
  assert.ok(src.includes('DevAdmin.syncRemoteContent(true)'), '检查更新未调用同步覆盖');
  assert.ok(src.includes('Updater.checkUpdate(true)'), '检查更新未调用版本比对');
  assert.ok(!src.includes("case 'sync-page-override':"), '独立覆盖页面事件分支应已移除');
});

test('M37-4 同步覆盖本身不要求开发者登录（游客可直接执行）', () => {
  const src = readAppFile('js/dev-admin.js');
  const seg = src.slice(src.indexOf('async function syncRemoteContent'), src.indexOf('/* ---------- 字体模板'));
  assert.ok(!seg.includes('isDev()'), '同步覆盖不应要求开发者登录');
  assert.ok(seg.includes('Toast.show(\'已同步远程内容并覆盖到页面\')'), '缺少成功提示');
});
