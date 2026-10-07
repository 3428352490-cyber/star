'use strict';
/* M33 阶段测试：v2.4.20 同步覆盖功能——
   修复「GitHub 收到提交但页面未覆盖显示」：页面打开时不会主动拉取远程内容，
   其他设备/浏览器（无本地缓存）永远显示默认文案。新增：
   ① 页面加载后静默同步远程 page-content.json 并覆盖应用到页面；
   ② 管理面板新增「同步覆盖」按钮手动触发；
   ③ 本地有未上传修改时以本地为准，不被远程覆盖。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();
const DevAdmin = ref('DevAdmin');

test('M33-1 同步覆盖函数存在并导出', () => {
  assert.ok(typeof DevAdmin.syncRemoteContent === 'function', 'syncRemoteContent 未导出');
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('async function syncRemoteContent(manual)'), '缺少同步覆盖函数实现');
  assert.ok(src.includes('refreshPageContentFromRemote, syncRemoteContent'), '导出列表缺少 syncRemoteContent');
});

test('M33-2 本地优先规则：本地有未上传修改时不被远程覆盖', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('const localPageEdit = read(\'page_edit\', null)'), '缺少本地修改检测');
  assert.ok(src.includes('if (localPageEdit === null && remote.pageEdit) setPageEdit(remote.pageEdit)'), '缺少本地优先覆盖判断');
});

test('M33-3 管理面板新增「同步覆盖」按钮与动作接线', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('data-action="dev-sync-remote"'), '缺少同步覆盖按钮');
  assert.ok(src.includes("case 'dev-sync-remote'"), '缺少同步覆盖动作分支');
  assert.ok(src.includes('syncRemoteContent(true)'), '缺少手动触发调用');
});

test('M33-4 页面加载后自动静默同步挂载', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('syncRemoteContent(false)'), '缺少自动静默同步调用');
  assert.ok(src.includes('v2.4.20 页面加载后静默同步远程内容'), '缺少自动同步说明');
  assert.ok(src.includes('}, 1200);'), '缺少延迟挂载块');
});

test('M33-5 同步链路复用安全通道：无认证优先+带Token回退+域名校验', () => {
  const src = readAppFile('js/dev-admin.js');
  const seg = src.slice(src.indexOf('async function syncRemoteContent'), src.indexOf('/* ---------- 字体模板'));
  assert.ok(seg.includes('const anonRes = await fetchTimeout('), '同步流程缺少无认证优先读取');
  assert.ok(seg.includes("parseRemoteContent(anonData)"), '缺少远程内容解析');
  assert.ok(seg.includes('await withRetry(function ()'), '缺少带 Token 回退重试');
  assert.ok(seg.includes("'https://api.github.com'"), '缺少 API 域名常量');
  assert.ok(seg.includes("new HashChangeEvent('hashchange')"), '缺少同步后重渲染派发');
});
