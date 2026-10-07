'use strict';
/* M36 阶段测试：v2.4.23 同源通道修复——
   修复「更新到最新版仍显示旧内容」：用户手机网络拦截 GitHub 系全部域名
   （api.github.com 已确认被拦，raw.githubusercontent.com 同属 GitHub 系同样被拦），
   同步拉取全部失败 → 页面永远默认。而应用自身源站（GitHub Pages 项目页）必然可达——
   新增同源相对路径通道 ./data/page-content.json 作为必通兜底。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();
const DevAdmin = ref('DevAdmin');

test('M36-1 多通道拉取含同源相对路径通道', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes("fetchTimeout('data/page-content.json?t=' + Date.now()"), '缺少同源相对路径拉取');
  assert.ok(src.includes("cache: 'no-store'"), '同源拉取缺少 no-store 防缓存');
  assert.ok(src.includes("via: 'same-origin'"), '缺少同源通道标记');
});

test('M36-2 通道顺序：raw → 同源 → api 无认证 → api 带 Token', () => {
  const src = readAppFile('js/dev-admin.js');
  const seg = src.slice(src.indexOf('async function fetchRemoteContentMulti'), src.indexOf('async function syncRemoteContent'));
  const iRaw = seg.indexOf('// ① raw 通道');
  const iSame = seg.indexOf('// ② 同源相对路径');
  const iApiAnon = seg.indexOf('// ③ api 无认证');
  const iApiToken = seg.indexOf('// ④ api 带 Token');
  assert.ok(iRaw >= 0 && iSame >= 0 && iApiAnon >= 0 && iApiToken >= 0, '缺少任一通道标记');
  assert.ok(iRaw < iSame && iSame < iApiAnon && iApiAnon < iApiToken, '通道顺序错误（raw → 同源 → api 无认证 → api 带 Token）');
});

test('M36-3 refresh 拉取同样走同源兜底', () => {
  const src = readAppFile('js/dev-admin.js');
  const seg = src.slice(src.indexOf('async function refreshPageContentFromRemote'), src.indexOf('async function checkRemoteConfig'));
  assert.ok(seg.includes("fetchTimeout('data/page-content.json?t=' + Date.now()"), 'refresh 缺少同源通道');
  assert.ok(seg.includes('手机端必通兜底'), '缺少同源通道说明');
});

test('M36-4 既有通道与逻辑不变：raw / api 回退 / _dirty 本地优先 / 域名校验', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes("via: 'raw'"), 'raw 通道仍存在');
  assert.ok(src.includes("via: 'api-token'"), 'api 带 Token 回退仍存在');
  assert.ok(src.includes('if (!localDirty && remote.pageEdit) setPageEdit(remote.pageEdit)'), '本地未上传标记优先逻辑不变');
  assert.ok(src.includes('GitHub API 域名异常，必须使用 api.github.com'), '域名强制校验不变');
});
