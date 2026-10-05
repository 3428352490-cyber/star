'use strict';
/* M6 阶段测试：PWA 更新检测（版本比较 / 云端拉取 / 弹窗与 Toast 联动） */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();

const CONFIG = ref('SDV_CONFIG');
const Updater = ref('Updater');
const Modal = ref('Modal');
const SecurityGuard = ref('SecurityGuard');
const els = globalThis.__testEls;

// 每次用例前重置前端请求限流窗口（5 秒 3 次），避免同进程内连续用例互相影响
beforeEach(() => {
  if (SecurityGuard && SecurityGuard.resetLimits) SecurityGuard.resetLimits();
});

function mockFetch(json, ok = true) {
  globalThis.fetch = async () => ({ ok, json: async () => json });
}
function mockFetchError() {
  globalThis.fetch = async () => { throw new Error('network down'); };
}

test('M6-1 compareVersion 语义化比较（compareVersion(localVer, remoteVer)：1=云端更高；0=相同；-1=本地更高）', () => {
  assert.equal(Updater.compareVersion('0.1.0', '0.1.0'), 0, '版本相同应为 0');
  assert.equal(Updater.compareVersion('0.1.0', '0.2.0'), 1, '云端 0.2.0 更高应为 1');
  assert.equal(Updater.compareVersion('0.2.0', '0.1.0'), -1, '本地 0.2.0 更高应为 -1');
  assert.equal(Updater.compareVersion('0.1.9', '0.1.10'), 1, '1.0.9 与 1.0.10 必须数字比较');
  assert.equal(Updater.compareVersion('0.9.9', '1.0.0'), 1, '主版本增大云端更高');
  assert.equal(Updater.compareVersion('0.1', '0.1.0'), 0, '缺段应视为 0');
  assert.equal(Updater.compareVersion('', '0.1.0'), 1, '本地空版本视为 0，云端更高');
  assert.equal(Updater.compareVersion('1.0.10', '1.0.10'), 0, '相同版本应为 0');
});

test('M6-2 extractVersion 容错（latestVersion 字段优先，兼容旧 version）', () => {
  assert.equal(Updater.extractVersion({ latestVersion: '0.2.0' }), '0.2.0');
  assert.equal(Updater.extractVersion({ latestVersion: ' 0.3.0 ' }), '0.3.0');
  assert.equal(Updater.extractVersion({ version: '0.4.0' }), '0.4.0', '旧 version 字段应兼容');
  assert.equal(Updater.extractVersion({}), '');
  assert.equal(Updater.extractVersion(null), '');
});

test('M6-2b 版本解析转数字数组 + 更新类型自动识别（主/次/修订/无更新）', () => {
  // parseVersion：v1.0.10 → [1, 0, 10]（数字数组，禁止字符串直接比较）
  assert.deepEqual(Updater.parseVersion('v1.0.10'), [1, 0, 10], 'v1.0.10 应解析为 [1,0,10]');
  assert.deepEqual(Updater.parseVersion('1.2.3'), [1, 2, 3], '1.2.3 应解析为 [1,2,3]');
  assert.deepEqual(Updater.parseVersion('2'), [2, 0, 0], '缺位应补 0');
  assert.deepEqual(Updater.parseVersion(''), [0, 0, 0], '空串应全 0');
  // getUpdateTypeInfo：主版本升级 → major / 重大版本更新
  let info = Updater.getUpdateTypeInfo('2.0.0', '1.10.5');
  assert.equal(info.type, 'major', '2.0.0 vs 1.10.5 应为主版本升级');
  assert.equal(info.title, '重大版本更新');
  assert.equal(info.tip, '本次为底层重大更新');
  // 次版本升级（主版本相同，次版本变大）→ minor / 功能更新
  info = Updater.getUpdateTypeInfo('1.2.0', '1.1.9');
  assert.equal(info.type, 'minor', '1.2.0 vs 1.1.9 应为次版本升级');
  assert.equal(info.title, '功能更新');
  assert.equal(info.tip, '新增功能与内容');
  // 修订号升级（主/次相同，修订变大）→ patch / 补丁更新
  info = Updater.getUpdateTypeInfo('1.1.10', '1.1.9');
  assert.equal(info.type, 'patch', '1.1.10 vs 1.1.9 应为修订号升级');
  assert.equal(info.title, '补丁更新');
  assert.equal(info.tip, '问题修复与细节优化');
  // 无更新：相等 / 云端更低
  info = Updater.getUpdateTypeInfo('1.1.9', '1.1.9');
  assert.equal(info.type, null, '版本相等应为无更新');
  info = Updater.getUpdateTypeInfo('1.0.9', '1.1.0');
  assert.equal(info.type, null, '云端更低应为无更新');
});

test('M6-2c 弹窗标题按更新类型变化：次版本/修订号升级（手动入口弹窗）', async () => {
  // 基于当前本地版本动态构造更高的云端版本（版本升级后断言不过期）
  const loc = CONFIG.app.version.split('.').map(Number);
  const minorUp = [loc[0], loc[1] + 1, 0].join('.');   // 次版本升级，如 2.1.0
  const patchUp = [loc[0], loc[1], loc[2] + 1].join('.'); // 修订号升级，如 2.0.2
  // 次版本升级 → 功能更新（手动检测才弹窗）
  mockFetch({ latestVersion: minorUp, updateDesc: '新增功能与内容', downloadUrl: './index.html' });
  await Updater.checkUpdate(true);
  assert.ok(els.get('modal-root').innerHTML.includes('功能更新'), '次版本升级标题应为「功能更新」');
  assert.ok(els.get('modal-root').innerHTML.includes('新增功能与内容'), '缺少次版本升级小字提示');
  // 修订号升级 → 补丁更新
  Modal.close();
  mockFetch({ latestVersion: patchUp, updateDesc: '问题修复与细节优化', downloadUrl: './index.html' });
  await Updater.checkUpdate(true);
  assert.ok(els.get('modal-root').innerHTML.includes('补丁更新'), '修订号升级标题应为「补丁更新」');
  assert.ok(els.get('modal-root').innerHTML.includes('问题修复与细节优化'), '缺少修订号升级小字提示');
  Modal.close();
});

test('M6-3 自动检测发现新版本：不弹窗、直接自动刷新页面，会话标记防无限循环', async () => {
  // 本地版本 = config.js 固定版本号（LOCAL_VERSION），云端 9.9.9 更高
  globalThis.location.reloadCount = 0;
  globalThis.sessionStorage.clear();
  mockFetch({ latestVersion: '9.9.9', updateDesc: '新增图鉴；修复问题', downloadUrl: './index.html' });
  const r = await Updater.checkUpdate(false);
  assert.equal(r.updated, true);
  assert.ok(r.notice.includes('发现新版本 v9.9.9'), 'notice 错误: ' + r.notice);
  // 自动：不弹窗、不弹 Toast
  assert.equal(els.get('modal-root').innerHTML, '', '自动检测不应弹更新弹窗');
  const toastEl = els.get('created:div');
  assert.equal(toastEl ? toastEl.textContent : '', '', '自动检测不应额外弹 Toast');
  // 自动刷新页面 + 写入会话标记
  assert.ok(globalThis.location.reloadCount >= 1, '云端更高应自动刷新页面');
  assert.equal(globalThis.sessionStorage.getItem('sdv-guide:auto-refreshed'), '1', '自动刷新前应写会话标记');
  // 再次自动检测（模拟刷新后）：会话标记存在 → 不再刷新（防无限循环）
  const r2 = await Updater.checkUpdate(false);
  assert.equal(r2.updated, true);
  assert.equal(globalThis.location.reloadCount, 1, '会话内不应重复自动刷新');
});

test('M6-8 手动检查发现新版本：弹窗确认刷新，不额外弹 Toast', async () => {
  const prev = els.get('created:div');
  if (prev) prev.textContent = ''; // 清空前置用例残留 Toast
  mockFetch({ latestVersion: '9.9.9', updateDesc: '', downloadUrl: './index.html' });
  const r = await Updater.checkUpdate(true);
  assert.equal(r.updated, true);
  assert.ok(els.get('modal-root').innerHTML.includes('重大版本更新'), '手动检测应弹更新弹窗（9.9.9 属主版本升级）');
  const toastEl = els.get('created:div');
  assert.equal(toastEl ? toastEl.textContent : '', '', '弹窗即反馈，不应再弹 Toast');
});

test('M6-4 已是最新版本：自动检测静默不提示；手动入口 Toast 提示', async () => {
  Modal.close();
  mockFetch({ latestVersion: CONFIG.app.version, updateDesc: '', downloadUrl: './index.html' });
  // 自动检测（false）：静默，不弹窗不 Toast
  const rAuto = await Updater.checkUpdate(false);
  assert.equal(rAuto.updated, false);
  assert.equal(els.get('modal-root').innerHTML, '', '自动检测不应弹出更新弹窗');
  const toastAuto = els.get('created:div');
  assert.equal(toastAuto ? toastAuto.textContent : '', '', '自动检测版本一致应静默');
  // 手动入口（true）：Toast「当前已是最新版本」
  const r = await Updater.checkUpdate(true);
  assert.equal(r.updated, false);
  assert.ok(r.notice.includes('已是最新版本'), 'notice 错误: ' + r.notice);
  assert.equal(els.get('modal-root').innerHTML, '', '不应弹出更新弹窗');
  assert.equal(els.get('created:div').textContent, '当前已是最新版本 v' + CONFIG.app.version);
});

test('M6-5 本地版本高于云端：自动静默，手动提示不回退', async () => {
  Modal.close();
  mockFetch({ latestVersion: '0.0.1', updateDesc: '', downloadUrl: './index.html' });
  const rAuto = await Updater.checkUpdate(false);
  assert.equal(rAuto.updated, false);
  const r = await Updater.checkUpdate(true);
  assert.equal(r.updated, false);
  assert.ok(r.notice.includes('本地版本高于云端'), 'notice 错误: ' + r.notice);
  assert.equal(els.get('modal-root').innerHTML, '', '不应弹出更新弹窗');
});

test('M6-6 网络失败：自动检测静默不提示；手动入口提示「版本检查失败，请稍后重试」', async () => {
  Modal.close();
  mockFetchError();
  // 自动检测：静默（无 Toast、无弹窗、无报错）
  const rAuto = await Updater.checkUpdate(false);
  assert.equal(rAuto.updated, false);
  assert.equal(rAuto.notice, '', '自动检测网络失败应静默');
  assert.equal(els.get('modal-root').innerHTML, '', '自动检测网络失败不应弹窗');
  // 手动入口：Toast 提示
  const r = await Updater.checkUpdate(true);
  assert.equal(r.updated, false);
  assert.ok(r.notice.includes('版本检查失败，请稍后重试'), 'notice 错误: ' + r.notice);
  assert.equal(els.get('modal-root').innerHTML, '', '手动检查网络失败不应弹窗');
});

test('M6-7 云端版本为空：自动静默；手动入口提示检查失败', async () => {
  Modal.close();
  mockFetch({ updateDesc: '', downloadUrl: './index.html' });
  const rAuto = await Updater.checkUpdate(false);
  assert.equal(rAuto.updated, false);
  const r = await Updater.checkUpdate(true);
  assert.equal(r.updated, false);
  assert.ok(r.notice.includes('版本检查失败'), 'notice 错误: ' + r.notice);
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
