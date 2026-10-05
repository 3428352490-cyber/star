'use strict';
/* M6 阶段测试：PWA 更新检测（版本比较 / 云端拉取 / 弹窗与 Toast 联动） */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();

const CONFIG = ref('SDV_CONFIG');
const Updater = ref('Updater');
const Modal = ref('Modal');
const els = globalThis.__testEls;

function mockFetch(json, ok = true) {
  globalThis.fetch = async () => ({ ok, json: async () => json });
}
function mockFetchError() {
  globalThis.fetch = async () => { throw new Error('network down'); };
}

test('M6-1 compareVersion 语义化比较（标准实现：remote 在左、local 在右）', () => {
  assert.equal(Updater.compareVersion('0.1.0', '0.1.0'), 0);
  assert.equal(Updater.compareVersion('0.2.0', '0.1.0'), 1);
  assert.equal(Updater.compareVersion('0.1.0', '0.2.0'), -1);
  assert.equal(Updater.compareVersion('0.1.10', '0.1.9'), 1);
  assert.equal(Updater.compareVersion('1.0.0', '0.9.9'), 1);
  assert.equal(Updater.compareVersion('0.1', '0.1.0'), 0, '缺段应视为 0');
  assert.equal(Updater.compareVersion('', '0.1.0'), -1, '空版本视为 0');
});

test('M6-2 extractVersion 容错', () => {
  assert.equal(Updater.extractVersion({ version: '0.2.0' }), '0.2.0');
  assert.equal(Updater.extractVersion({ version: ' 0.3.0 ' }), '0.3.0');
  assert.equal(Updater.extractVersion({}), '');
  assert.equal(Updater.extractVersion(null), '');
});

test('M6-2b 更新类型自动识别：主版本/次版本/修订号升级与无更新', () => {
  // 主版本升级
  assert.equal(Updater.getUpdateType('2.0.0', '1.10.5'), 3, '2.0.0 vs 1.10.5 应为主版本升级');
  // 次版本升级（主版本相同，次版本变大）
  assert.equal(Updater.getUpdateType('1.2.0', '1.1.9'), 2, '1.2.0 vs 1.1.9 应为次版本升级');
  // 修订号升级（主/次相同，修订变大）
  assert.equal(Updater.getUpdateType('1.1.10', '1.1.9'), 1, '1.1.10 vs 1.1.9 应为修订号升级');
  // 无更新：相等 / 云端更低
  assert.equal(Updater.getUpdateType('1.1.9', '1.1.9'), 0, '版本相等应为无更新');
  assert.equal(Updater.getUpdateType('1.0.9', '1.1.0'), 0, '云端更低应为无更新');
  // 版本号解析：支持 v 前缀与缺位补 0
  const p = Updater.parseVersion('v1.2.3');
  assert.deepEqual(p, { major: 1, minor: 2, patch: 3 }, 'parseVersion 解析错误');
  assert.deepEqual(Updater.parseVersion('2'), { major: 2, minor: 0, patch: 0 }, '缺位应补 0');
  assert.deepEqual(Updater.parseVersion(''), { major: 0, minor: 0, patch: 0 }, '空串应全 0');
});

test('M6-2c 弹窗标题按更新类型变化：次版本/修订号升级', async () => {
  Updater.setMockEnabled(false);
  // 次版本升级：1.1.0 vs 1.0.10 → 功能更新
  mockFetch({ version: '1.1.0' });
  await Updater.check(false);
  assert.ok(els.get('modal-root').innerHTML.includes('功能更新'), '次版本升级标题应为「功能更新」');
  assert.ok(els.get('modal-root').innerHTML.includes('新增功能与内容'), '缺少次版本升级小字提示');
  // 修订号升级：1.0.11 vs 1.0.10 → 补丁更新
  Modal.close();
  mockFetch({ version: '1.0.11' });
  await Updater.check(false);
  assert.ok(els.get('modal-root').innerHTML.includes('补丁更新'), '修订号升级标题应为「补丁更新」');
  assert.ok(els.get('modal-root').innerHTML.includes('问题修复与细节优化'), '缺少修订号升级小字提示');
  Modal.close();
});

test('M6-3 发现新版本：自动/手动均弹窗（云端 > 本地固定版本），不额外弹 Toast', async () => {
  // 本地版本 = config.js 固定版本号（SDV_CONFIG.app.version），云端 9.9.9 更高 → 弹窗
  Updater.setMockEnabled(false); // 关闭 Mock，走 fetch 分支（等价上线状态）
  mockFetch({ version: '9.9.9', notes: ['新增图鉴', '修复问题'] });
  const r = await Updater.check(false);
  assert.equal(r.updated, true);
  assert.ok(r.notice.includes('发现新版本 v9.9.9'), 'notice 错误: ' + r.notice);
  assert.ok(els.get('modal-root').innerHTML.includes('重大版本更新'), '弹窗标题应为类型化标题（9.9.9 属主版本升级）');
  assert.ok(els.get('modal-root').innerHTML.includes('本次为底层重大更新'), '弹窗缺少主版本升级小字提示');
  assert.ok(els.get('modal-root').innerHTML.includes('9.9.9'), '弹窗未含新版本号');
  const toastEl = els.get('created:div');
  assert.equal(toastEl ? toastEl.textContent : '', '', '更新弹窗本身即提示，不应额外弹 Toast');
});

test('M6-4 已是最新版本：自动检测静默不提示；手动入口 Toast 提示', async () => {
  Modal.close();
  Updater.setMockEnabled(false);
  mockFetch({ version: CONFIG.app.version, notes: [] });
  // 自动检测（false）：静默，不弹窗不 Toast
  const rAuto = await Updater.check(false);
  assert.equal(rAuto.updated, false);
  assert.equal(els.get('modal-root').innerHTML, '', '自动检测不应弹出更新弹窗');
  const toastAuto = els.get('created:div');
  assert.equal(toastAuto ? toastAuto.textContent : '', '', '自动检测版本一致应静默');
  // 手动入口（true）：Toast「当前已是最新版本」
  const r = await Updater.check(true);
  assert.equal(r.updated, false);
  assert.ok(r.notice.includes('已是最新版本'), 'notice 错误: ' + r.notice);
  assert.equal(els.get('modal-root').innerHTML, '', '不应弹出更新弹窗');
  assert.equal(els.get('created:div').textContent, '当前已是最新版本 v' + CONFIG.app.version);
});

test('M6-5 本地版本高于云端：自动静默，手动提示不回退', async () => {
  Modal.close();
  Updater.setMockEnabled(false);
  mockFetch({ version: '0.0.1' });
  const rAuto = await Updater.check(false);
  assert.equal(rAuto.updated, false);
  const r = await Updater.check(true);
  assert.equal(r.updated, false);
  assert.ok(r.notice.includes('本地版本高于云端'), 'notice 错误: ' + r.notice);
  assert.equal(els.get('modal-root').innerHTML, '', '不应弹出更新弹窗');
});

test('M6-6 网络失败：自动检测静默不提示；手动入口提示「版本检查失败，请稍后重试」', async () => {
  Modal.close();
  Updater.setMockEnabled(false);
  mockFetchError();
  // 自动检测：静默（无 Toast、无弹窗、无报错）
  const rAuto = await Updater.check(false);
  assert.equal(rAuto.updated, false);
  assert.equal(rAuto.notice, '', '自动检测网络失败应静默');
  assert.equal(els.get('modal-root').innerHTML, '', '自动检测网络失败不应弹窗');
  // 手动入口：Toast 提示
  const r = await Updater.check(true);
  assert.equal(r.updated, false);
  assert.ok(r.notice.includes('版本检查失败，请稍后重试'), 'notice 错误: ' + r.notice);
  assert.equal(els.get('modal-root').innerHTML, '', '手动检查网络失败不应弹窗');
});

test('M6-7 云端版本为空：自动静默；手动入口提示检查失败', async () => {
  Modal.close();
  Updater.setMockEnabled(false);
  mockFetch({ notes: [] });
  const rAuto = await Updater.check(false);
  assert.equal(rAuto.updated, false);
  const r = await Updater.check(true);
  assert.equal(r.updated, false);
  assert.ok(r.notice.includes('版本检查失败'), 'notice 错误: ' + r.notice);
});

test('M6-8 发现新版本仅弹窗提示：不额外弹 Toast（弹窗与手动/自动一致）', async () => {
  Updater.setMockEnabled(false);
  const prev = els.get('created:div');
  if (prev) prev.textContent = ''; // 清空前置用例残留 Toast
  mockFetch({ version: '9.9.9' });
  const r = await Updater.check(false);
  assert.equal(r.updated, true);
  const toastEl = els.get('created:div');
  assert.equal(toastEl ? toastEl.textContent : '', '', '弹窗即反馈，不应再弹 Toast');
});

test('M6-9 manifest.webmanifest 结构完整', () => {
  const m = JSON.parse(readAppFile('manifest.webmanifest'));
  assert.equal(m.name, '星露谷攻略');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './index.html');
  assert.ok(m.icons.length >= 2, '图标数量不足');
  assert.ok(m.icons.some((i) => i.src.includes('192')), '缺少 192 图标');
  assert.ok(m.icons.some((i) => i.src.includes('512')), '缺少 512 图标');
});

test('M6-10 sw.js：缓存名与版本同步、资源清单齐全、fetch 兜底', () => {
  const sw = readAppFile('sw.js');
  assert.ok(sw.includes("CACHE_NAME = 'sdv-guide-v" + CONFIG.app.version + "'"), '缓存名与版本不同步');
  for (const f of ['index.html', 'js/app.js', 'js/pages.js', 'js/update.js', 'css/base.css', 'manifest.webmanifest']) {
    assert.ok(sw.includes(f), '缓存清单缺: ' + f);
  }
  assert.ok(sw.includes("caches.match('./index.html')"), '缺少离线兜底');
});

test('M6-11 index.html 挂载 manifest 与 PWA 基础 meta', () => {
  const html = readAppFile('index.html');
  assert.ok(html.includes('rel="manifest"'), '缺少 manifest 链接');
  assert.ok(html.includes('theme-color'), '缺少 theme-color');
  assert.ok(html.includes('viewport-fit=cover'), '缺少安全区 viewport 配置');
});

test('M6-12 缓存策略为网络优先：更新即时生效，离线回退缓存', () => {
  const sw = readAppFile('sw.js');
  const fetchIdx = sw.indexOf('fetch(e.request)');
  const cacheMatchIdx = sw.indexOf('caches.match(e.request)');
  assert.ok(fetchIdx >= 0, '缺少网络请求分支');
  assert.ok(cacheMatchIdx >= 0, '缺少缓存回退分支');
  assert.ok(fetchIdx < cacheMatchIdx, '应先走网络、失败后再回退缓存（网络优先）');
  assert.ok(sw.includes("hit || caches.match('./index.html')"), '缺少离线兜底首页');
});
