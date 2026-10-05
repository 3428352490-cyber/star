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

test('M6-3 发现新版本：弹窗 + 手动检查 Toast', async () => {
  mockFetch({ version: '9.9.9', notes: ['新增图鉴', '修复问题'] });
  const r = await Updater.check(true);
  assert.equal(r.updated, true);
  assert.ok(r.notice.includes('发现新版本 v9.9.9'), 'notice 错误: ' + r.notice);
  assert.ok(els.get('modal-root').innerHTML.includes('发现新版本'), '未弹更新弹窗');
  assert.ok(els.get('modal-root').innerHTML.includes('9.9.9'), '弹窗未含新版本号');
  assert.equal(els.get('created:div').textContent, '发现新版本 v9.9.9，新增图鉴；修复问题', 'Toast 未联动');
});

test('M6-4 已是最新版本：不弹窗，手动 Toast', async () => {
  Modal.close();
  mockFetch({ version: CONFIG.app.version, notes: [] });
  const r = await Updater.check(true);
  assert.equal(r.updated, false);
  assert.ok(r.notice.includes('已是最新版本'), 'notice 错误: ' + r.notice);
  assert.equal(els.get('modal-root').innerHTML, '', '不应弹出更新弹窗');
  assert.equal(els.get('created:div').textContent, '当前已是最新版本 v' + CONFIG.app.version);
});

test('M6-5 本地版本高于云端：提示不回退', async () => {
  Modal.close();
  mockFetch({ version: '0.0.1' });
  const r = await Updater.check(true);
  assert.equal(r.updated, false);
  assert.ok(r.notice.includes('本地版本高于云端'), 'notice 错误: ' + r.notice);
  assert.equal(els.get('modal-root').innerHTML, '', '不应弹出更新弹窗');
});

test('M6-6 网络失败：提示检查更新失败，不弹窗', async () => {
  Modal.close();
  mockFetchError();
  const r = await Updater.check(true);
  assert.equal(r.updated, false);
  assert.ok(r.notice.includes('检查更新失败'), 'notice 错误: ' + r.notice);
  assert.equal(els.get('modal-root').innerHTML, '', '网络失败不应弹窗');
});

test('M6-7 云端版本为空：提示清单格式错误', async () => {
  Modal.close();
  mockFetch({ notes: [] });
  const r = await Updater.check(true);
  assert.equal(r.updated, false);
  assert.ok(r.notice.includes('云端版本清单格式错误'), 'notice 错误: ' + r.notice);
});

test('M6-8 静默检查（manual=false）：不弹 Toast', async () => {
  mockFetch({ version: '9.9.9' });
  els.get('created:div').textContent = '';
  const r = await Updater.check(false);
  assert.equal(r.updated, true);
  assert.equal(els.get('created:div').textContent, '', '静默检查不应出现 Toast');
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
