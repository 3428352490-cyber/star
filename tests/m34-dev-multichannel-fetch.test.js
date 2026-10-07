'use strict';
/* M34 阶段测试：v2.4.21 多通道拉取修复——
   修复「其他网页更改无法被新版本覆盖」：自动同步/刷新拉取 api.github.com 的 contents 路径
   在你手机网络会被路径级拦截（可直连 rate_limit 但 /repos/.../contents/ 被拦），拉取永远失败、
   页面永远显示默认内容。新增 raw.githubusercontent.com 优先通道（普通 HTTPS CDN，通常放行）
   绕开 api 路径拦截，api 无认证/带 Token 作为回退。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();
const DevAdmin = ref('DevAdmin');

test('M34-1 多通道拉取函数存在并导出', () => {
  assert.ok(typeof DevAdmin.fetchRemoteContentMulti === 'function', 'fetchRemoteContentMulti 未导出');
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('async function fetchRemoteContentMulti(repo, token)'), '缺少多通道拉取实现');
  assert.ok(src.includes('fetchRemoteContentMulti'), '导出列表缺少多通道拉取');
});

test('M34-2 raw 通道优先：raw.githubusercontent.com 域名构造与解析', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes("'https://raw.githubusercontent.com/'"), '缺少 raw 通道域名');
  assert.ok(src.includes('await fetchTimeout(rawUrl, { redirect: \'follow\' }'), '缺少 raw 通道请求');
  assert.ok(src.includes("via: 'raw'"), '缺少 raw 通道标记');
  assert.ok(src.includes("rawText.trim().charAt(0) === '{'"), '缺少 raw JSON 校验');
});

test('M34-3 回退链完整：raw → api 无认证 → api 带 Token', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes("via: 'api-anon'"), '缺少 api 无认证回退');
  assert.ok(src.includes("via: 'api-token'"), '缺少 api 带 Token 回退');
  assert.ok(src.includes('return { remote: {}, via: \'\' }'), '缺少全通道失败兜底');
});

test('M34-4 sync 与 refresh 均使用多通道拉取', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('const { remote, via } = await fetchRemoteContentMulti(repo, token)'), 'sync 未使用多通道拉取');
  assert.ok(src.includes('// v2.4.21 raw 通道优先（raw.githubusercontent.com 普通 HTTPS，绕过 api.github.com 路径级拦截）'), 'refresh 缺少 raw 优先说明');
  const rawCount = (src.match(/raw.githubusercontent\.com/g) || []).length;
  assert.ok(rawCount >= 3, 'raw 域名引用不足（应同时出现在 helper 与 refresh）');
});

test('M34-5 原逻辑不变：域名校验 + 本地优先 + 静默失败', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('GitHub API 域名异常，必须使用 api.github.com'), '缺少域名强制校验');
  assert.ok(src.includes('if (localPageEdit === null && remote.pageEdit) setPageEdit(remote.pageEdit)'), '缺少本地优先规则');
  assert.ok(src.includes('new HashChangeEvent(\'hashchange\')'), '缺少同步后重渲染派发');
});
