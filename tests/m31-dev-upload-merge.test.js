'use strict';
/* M31 阶段测试：v2.4.18 上传载荷增量合并——
   修复「上传覆盖远程数据」：payload 以远程现有内容为基底，仅用本地缓存覆盖确有修改的字段，
   无本地修改的字段（如 announcements 公告）保留远程原值，杜绝 PUT 全量覆盖导致远程公告丢失。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();
const DevAdmin = ref('DevAdmin');
const NS = 'sdv-guide:devadmin:';

function resetLocal() {
  Object.keys(localStorage).forEach((k) => { if (k.indexOf(NS) === 0) localStorage.removeItem(k); });
  try { localStorage.removeItem('sdv_bg_lock'); } catch (e) {}
}

test('M31-1 增量合并：无本地公告缓存时保留远程公告，不再删远程数据', () => {
  resetLocal();
  const remote = {
    generatedAt: '2026-10-07T00:00:00.000Z',
    announcements: [{ version: '2.4.16', title: '远程公告', notes: ['必须保留'] }],
    pageEdit: { '/home::0': { text: '远程文本' } },
    fontConfig: { template: 'px-retro', fontSize: 14 },
  };
  const payload = DevAdmin.buildPageContentPayload(remote);
  assert.deepEqual(payload.announcements, remote.announcements, '无本地公告缓存时应保留远程公告');
  assert.deepEqual(payload.pageEdit, remote.pageEdit, '无本地编辑时应保留远程 pageEdit');
  assert.deepEqual(payload.fontConfig, remote.fontConfig, '无本地字体缓存时应保留远程 fontConfig');
});

test('M31-2 增量合并：本地有修改缓存时覆盖对应字段，其余保留远程', () => {
  resetLocal();
  localStorage.setItem(NS + 'page_edit', JSON.stringify({ '/home::0': { text: '本地新文本' } }));
  localStorage.setItem(NS + 'notice_edit', JSON.stringify([{ version: '9.9.9', title: '本地公告' }]));
  const remote = {
    announcements: [{ version: '2.4.16', title: '远程公告' }],
    pageEdit: { '/home::0': { text: '远程文本' } },
    fontConfig: { template: 'px-retro', fontSize: 14 },
  };
  const payload = DevAdmin.buildPageContentPayload(remote);
  assert.deepEqual(payload.pageEdit, { '/home::0': { text: '本地新文本' } }, '本地编辑应覆盖远程');
  assert.deepEqual(payload.announcements, [{ version: '9.9.9', title: '本地公告' }], '本地公告应覆盖远程');
  assert.deepEqual(payload.fontConfig, remote.fontConfig, '无本地字体修改应保留远程字体配置');
});

test('M31-3 远程基底为空（首次上传/读取失败）：仅本地缓存字段', () => {
  resetLocal();
  const payload = DevAdmin.buildPageContentPayload(null);
  assert.ok(!('announcements' in payload), '无远程无本地公告缓存时不应携带 announcements');
  assert.ok(!('pageEdit' in payload) && !('fontConfig' in payload), '无远程无本地修改时不应携带 pageEdit/fontConfig');
  assert.ok(payload.generatedAt, '缺少生成时间');
});

test('M31-4 上传流程：PUT 前合并远程基底（远程内容解析 + 载荷重建，v2.5.2 单文件）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('function parseRemoteContent'), '缺少远程内容解析函数');
  assert.ok(src.includes('atob(String(data.content).replace(/\\n/g, \'\'))'), '缺少 base64 解码');
  assert.ok(src.includes('const pagePayload = buildPageContentPayload(remotePage.base)'), 'PUT 前缺少页面内容合并载荷构建');
  assert.ok(src.includes('base: parseRemoteContent(got)'), '带 Token 读取缺少远程基底解析');
  assert.ok(!src.includes('const bgPayload = buildBackgroundLockPayload(remoteBg.base)'), '仍构建背景锁定载荷（v2.5.2 已删除）');
  assert.ok(!src.includes('bgLockPath'), '仍引用 bgLockPath（v2.5.2 已删除背景锁定上传）');
});

test('M31-5 原有逻辑不变：域名校验 + sha 提交 + 超时重试 + 失败保留数据', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes("'https://api.github.com'"), '缺少 GitHub API 基础地址');
  assert.ok(src.includes('GitHub API 域名异常，必须使用 api.github.com'), '缺少域名强制校验');
  assert.ok(src.includes('if (sha) body.sha = sha;'), '缺少携带最新 sha 防提交冲突');
  assert.ok(src.includes('async function withRetry'), '缺少自动重试');
  assert.ok(src.includes('上传失败不会损坏仓库原有文件'), '失败提示保留');
});
