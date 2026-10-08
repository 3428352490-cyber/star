'use strict';
/* M41 阶段测试：v2.5.6 背景锁定板块与背景同步上传整体移除——
   v2.5.2 曾删除独立背景锁定上传文件；v2.5.3 改为 backgroundLock 字段内嵌单文件上传；
   v2.5.6 按用户要求彻底删除「背景锁定」板块与「背景同步上传」：
   ① 开发者面板不再渲染背景锁定板块（无 admin-block-bglock / dev-open-bglock / openBgLockModal / applyBgLock）；
   ② 上传载荷与导出 JSON 不再包含 backgroundLock 字段（buildPageContentPayload 无任何锁定读写）；
   ③ applyRemoteBackgroundLock 已删除（refresh/sync 不再应用远程锁定）；
   ④ dev-admin.js 全文件无 sdv_bg_lock / backgroundLock / bg-lock 残留；
   ⑤ background.js 无 readLock/writeLock/lockKey/锁定分支（背景回归纯自动轮换）；
   ⑥ 一键上传仍为单文件 page-content.json，基础能力不受影响。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();
const DevAdmin = ref('DevAdmin');

test('M41-1 开发者面板不再渲染背景锁定板块（入口/弹窗/锁定应用函数全部移除）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(!src.includes('admin-block-bglock'), '面板仍含背景锁定板块容器');
  assert.ok(!src.includes('data-action="dev-open-bglock"'), '面板仍含打开背景锁定窗口按钮');
  assert.ok(!src.includes('function openBgLockModal'), 'openBgLockModal 未删除');
  assert.ok(!src.includes('function applyBgLock'), 'applyBgLock 未删除');
  assert.ok(!src.includes('function applyRemoteBackgroundLock'), 'applyRemoteBackgroundLock 未删除');
  assert.ok(!src.includes('背景锁定'), '面板/文案仍出现背景锁定字样');
});

test('M41-2 上传载荷与导出 JSON 不再包含 backgroundLock 字段（无任何锁定读写残留）', () => {
  const p = DevAdmin.buildPageContentPayload({});
  assert.equal('backgroundLock' in p, false, '上传载荷仍含 backgroundLock 字段');
  const files = DevAdmin.buildExportFiles();
  assert.equal(files.length, 1, '应只导出 1 个 JSON 文件');
  assert.equal(files[0].name, 'page-content.json', '导出文件名应为 page-content.json');
  assert.equal('backgroundLock' in files[0].data, false, '导出载荷仍含 backgroundLock 字段');
});

test('M41-3 dev-admin.js 无背景锁定状态残留（sdv_bg_lock / backgroundLock / bg-lock 全部清除）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(!src.includes('sdv_bg_lock'), '仍存在 sdv_bg_lock 读写');
  assert.ok(!src.includes('backgroundLock'), '仍存在 backgroundLock 处理');
  assert.ok(!src.includes('bg-lock'), '仍存在 bg-lock 标识');
});

test('M41-4 一键上传仍为单文件 page-content.json（files 仅含 jsonPath，无独立/内嵌背景锁定）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('readRemoteFile(repo.jsonPath'), '缺少页面内容 JSON 读取');
  assert.ok(src.includes("files: [repo.jsonPath]"), '上传返回值 files 应仅含页面内容 JSON');
  assert.ok(!src.includes('bgLockPath'), '仍存在 bgLockPath 配置');
});

test('M41-5 background.js 回归纯自动轮换（锁定逻辑全部移除）', () => {
  const src = readAppFile('js/background.js');
  assert.ok(!src.includes('lockKey'), '仍存在 lockKey');
  assert.ok(!src.includes('readLock'), '仍存在 readLock');
  assert.ok(!src.includes('writeLock'), '仍存在 writeLock');
  assert.ok(!src.includes('sdv-bg-lock-change'), '仍派发背景锁定变化事件');
  assert.ok(src.includes('function check()'), '缺少自动检测函数');
  assert.ok(src.includes('seasonOf(d.getMonth() + 1)'), '自动季节判定缺失');
});

test('M41-6 确认弹窗摘要与面板说明不含背景锁定（导出引导保留）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('data-action="dev-export-json"'), '导出JSON下载按钮缺失');
  assert.ok(src.includes('github.com/'), '缺少 GitHub 网页手动上传引导文案');
  assert.ok(!src.includes('背景锁定：'), '确认弹窗摘要仍含背景锁定行');
});
