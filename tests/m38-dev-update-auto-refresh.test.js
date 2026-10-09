'use strict';
/* M38 阶段测试：v2.4.25 检查更新合并覆盖页面 + 更新后自动刷新——
   修复「检查更新模块点击后应主动刷新页面状态并拉取更新，更新完成后应再次自动刷新页面，
   避免用户反复手动刷新」。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();
const DevAdmin = ref('DevAdmin');

test('M38-1 点击检查更新主动拉取云端内容覆盖页面（刷新页面状态）', () => {
  const src = readAppFile('js/app.js');
  const seg = src.slice(src.indexOf("case 'check-update':"), src.indexOf("case 'nav-save':"));
  assert.ok(seg.includes('DevAdmin.syncRemoteContent(true)'), '检查更新点击未主动拉取覆盖');
  assert.ok(seg.includes('先主动拉取云端最新内容覆盖页面状态'), '缺少主动覆盖说明');
});

test('M38-2 更新完成后自动刷新页面（避免反复手动刷新）', () => {
  const src = readAppFile('js/update.js');
  assert.ok(src.includes('_updateRefreshScheduled'), '缺少自动刷新防重标志');
  assert.ok(src.includes('function safePageReload()'), '缺少确认刷新函数');
  assert.ok(src.includes('function schedulePageReload(delay)'), '缺少自动刷新调度函数');
  assert.ok(src.includes('location.reload()'), '缺少页面重载调用');
  assert.ok(src.includes('页面即将自动刷新，加载最新内容…'), '缺少自动刷新提示文案');
});

test('M38-3 完成弹窗确认按钮直接触发刷新，自动刷新兜底防重复', () => {
  const src = readAppFile('js/update.js');
  const seg = src.slice(src.indexOf('async function performUpdate'));
  assert.ok(seg.includes("label: '刷新页面'"), '完成弹窗缺少刷新按钮');
  // v2.7.3 修复：确认按钮不查防重标志、直接 location.reload()（避免标志已置位导致按钮失效）
  const btnSeg = seg.slice(seg.indexOf("label: '刷新页面'"));
  assert.ok(btnSeg.includes('location.reload()'), '确认按钮应直接触发页面刷新');
  assert.ok(seg.includes('schedulePageReload()'), '缺少自动刷新兜底调用');
  assert.ok(seg.includes('共用防重标志'), '缺少防重说明');
  assert.ok(seg.includes('fetchWithTimeout'), '缺少带超时的资源拉取（防单资源挂起卡死更新流程）');
  assert.ok(seg.includes('Promise.allSettled'), '核心资源应并行预取（避免串行等待拖垮刷新链路）');
});

test('M38-4 原更新流程不变：进度条 / 预取 / 版本比对 / 暂不更新', () => {
  const src = readAppFile('js/update.js');
  assert.ok(src.includes('upd-progress-bar'), '进度条仍在');
  assert.ok(src.includes("label: '暂不更新'"), '暂不更新按钮仍在');
  assert.ok(src.includes('已是最新版本'), '版本一致弹窗仍在');
  assert.ok(src.includes('checkUpdate(manual)'), '版本比对主流程不变');
});
