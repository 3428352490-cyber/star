'use strict';
/* M32 阶段测试：v2.4.19 刷新失败回滚本地缓存修复——
   此前 refresh 先清空本地业务缓存再拉取远程，拉取失败会把本地修改清空、页面恢复默认，
   且再次上传时 payload 读空缓存会误覆盖远程修改（远程 pageEdit 被覆盖成空的实锤根因）。
   修复：拉取前快照 → 失败时回滚快照，本地修改保留可重试。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, readAppFile } = require('./helpers/harness.js');

loadApp();

test('M32-1 拉取前快照本地业务缓存：新增快照与回滚出口', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('const snapshot = {};'), '缺少缓存快照');
  assert.ok(src.includes("snapshot[k] = localStorage.getItem(k)"), '缺少快照采集');
  assert.ok(src.includes('function refreshFail(msg, extra)'), '缺少失败回滚出口');
  assert.ok(src.includes('回滚本地缓存快照'), '缺少回滚说明');
  assert.ok(src.includes('本地修改已保留'), '失败提示缺少数据保留说明');
  assert.ok(src.includes('_refreshKeys.forEach(function (k) {'), '缺少快照键遍历');
});

test('M32-2 失败分支全部经 refreshFail 出口回滚', () => {
  const src = readAppFile('js/dev-admin.js');
  // html/token/json/net 五类失败分支均调用 refreshFail
  const html = src.match(/if \(re && re\.__class === 'html'\) return refreshFail\(/g);
  const token = src.match(/if \(re && re\.__class === 'token'\) return refreshFail\(/g);
  const net = src.match(/if \(re && re\.__class === 'net'\) return refreshFail\(/g);
  assert.ok(html && html.length >= 1, 'html 分支未走回滚出口');
  assert.ok(token && token.length >= 1, 'token 分支未走回滚出口');
  assert.ok(net && net.length >= 1, 'net 分支未走回滚出口');
  // refresh 内旧式裸失败返回必须全部替换为 refreshFail（绕过回滚即本地修改丢失）
  assert.ok(!src.includes("return { ok: false, message: '刷新远程业务数据失败：' + ((re && re.message)"), 're 兜底分支仍存在绕过回滚的裸失败返回');
  assert.ok(!src.includes("return { ok: false, message: '网络异常（网络拦截/域名错误）：无法连接 GitHub API，请检查网络或确认请求域名为 api.github.com' };"), '外 catch 分支仍存在绕过回滚的裸失败返回');
  assert.ok(!src.includes("return { ok: false, message: '网络异常（网络拦截/域名错误）：无法连接 GitHub API 刷新远程数据"), 'net 分支仍存在绕过回滚的裸失败返回');
});

test('M32-3 成功分支保持不变：远程数据回写 + hashchange 重渲染（v2.5.4 远程公告不再覆盖 config 内置）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes("if (remote.pageEdit) setPageEdit(remote.pageEdit)"), '缺少远程 pageEdit 回写');
  assert.ok(!src.includes('SDV_CONFIG.announcements = remote.announcements'), 'v2.5.4 远程公告不应再覆盖 config.js 内置版本公告（旧残留会导致公告回退）');
  assert.ok(src.includes("new HashChangeEvent('hashchange')"), '缺少 hashchange 重渲染派发');
  assert.ok(src.includes('return { ok: true, message: \'已刷新远程业务数据'), '成功返回保留');
});
