'use strict';
/* M33 阶段测试：v2.4.33 背景锁定配置独立 JSON 上传——
   ① 背景锁定配置单独存入 background-lock.json，与 page-content.json 区分开（page 载荷不再含 backgroundLock）；
   ② buildBackgroundLockPayload 语义：本地锁定 → {locked,season,period}；本地恢复自动 → {locked:false}；
      无本地修改 → 保留远程原值；远程为空 → 空对象（自动模式）；
   ③ 一键上传双文件提交（页面内容 + 背景锁定各一次 readRemoteFile/putFileToGitHub）；
   ④ 仓库配置保存逻辑兼容背景锁定路径（bgLockPath 默认 data/background-lock.json）。 */
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

test('M33-1 背景锁定载荷：本地锁定缓存 → locked/season/period', () => {
  resetLocal();
  localStorage.setItem('sdv_bg_lock', JSON.stringify({ locked: true, season: 'winter', period: 'night' }));
  const p = DevAdmin.buildBackgroundLockPayload(null);
  assert.deepEqual(p, { locked: true, season: 'winter', period: 'night' }, '本地锁定应完整写入独立载荷');
});

test('M33-2 背景锁定载荷：本地恢复自动 → locked:false 覆盖远程锁定', () => {
  resetLocal();
  localStorage.setItem('sdv_bg_lock', JSON.stringify({ locked: false }));
  const p = DevAdmin.buildBackgroundLockPayload({ locked: true, season: 'spring', period: 'day' });
  assert.deepEqual(p, { locked: false }, '本地恢复自动应以 locked:false 覆盖远程锁定');
});

test('M33-3 背景锁定载荷：无本地修改 → 保留远程原值；远程为空 → 空对象', () => {
  resetLocal();
  const p1 = DevAdmin.buildBackgroundLockPayload({ locked: true, season: 'autumn', period: 'dusk' });
  assert.deepEqual(p1, { locked: true, season: 'autumn', period: 'dusk' }, '无本地修改应保留远程原值');
  const p2 = DevAdmin.buildBackgroundLockPayload(null);
  assert.deepEqual(p2, {}, '远程不存在且无本地缓存应为空对象（自动模式）');
});

test('M33-4 page-content 载荷不再包含 backgroundLock（背景锁定独立存储）', () => {
  resetLocal();
  localStorage.setItem('sdv_bg_lock', JSON.stringify({ locked: true, season: 'spring', period: 'day' }));
  const p = DevAdmin.buildPageContentPayload({ backgroundLock: { locked: true, season: 'spring', period: 'day' } });
  assert.ok(!('backgroundLock' in p), 'page-content 载荷不应再携带 backgroundLock 字段');
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('data/background-lock.json'), '缺少独立背景锁定 JSON 路径常量');
});

test('M33-5 一键上传双文件提交：页面内容 + 背景锁定各一次读取与提交', () => {
  const src = readAppFile('js/dev-admin.js');
  // 两次远程读取（page + bg）
  const reads = (src.match(/readRemoteFile\(/g) || []).length;
  assert.ok(reads >= 3, '应存在 readRemoteFile 定义 + 两处文件读取调用（实际 ' + reads + ' 处）');
  const puts = (src.match(/putFileToGitHub\(/g) || []).length;
  assert.ok(puts >= 3, '应存在 putFileToGitHub 定义 + 两处文件提交调用（实际 ' + puts + ' 处）');
  // 顺序提交：先页面内容，后背景锁定（失败即停，保留本地数据）
  assert.ok(src.indexOf('putFileToGitHub(repo.jsonPath') < src.indexOf('putFileToGitHub(bgLockPath'), '应先提交页面内容 JSON，再提交背景锁定 JSON');
  assert.ok(src.includes("if (!putPage.ok) return putPage;"), '页面内容提交失败应中止（不覆盖背景锁定）');
  assert.ok(src.includes("if (!putBg.ok) return putBg;"), '背景锁定提交失败应中止');
});

test('M33-6 仓库配置兼容背景锁定路径：保存逻辑写入 bgLockPath', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes("bgLockPath: 'data/background-lock.json'"), '仓库配置默认值缺少背景锁定路径');
  assert.ok(src.includes("const bgLockPath = repo.bgLockPath || 'data/background-lock.json';"), '上传流程缺少旧配置兼容兜底');
  assert.ok(src.includes('replace(/[^/]+$/, \'\') + \'background-lock.json\''), '保存仓库配置缺少背景锁定路径同步兼容');
});

test('M33-7 提示文案区分文本 JSON 与背景配置数据（图片仍需手动上传）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('页面内容 JSON') && src.includes('背景锁定配置 JSON'), '面板提示缺少两份 JSON 区分文案');
  assert.ok(src.includes('图片资源请前往 GitHub 网页端手动上传'), '缺少图片手动上传提示');
});

test('M33-8 上传成功回调同步拉取背景锁定并应用（refreshBackgroundLockFromRemote）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('async function refreshBackgroundLockFromRemote'), '缺少背景锁定远程拉取函数');
  assert.ok(src.includes("await refreshBackgroundLockFromRemote(repo, token)"), '刷新流程缺少背景锁定同步调用');
  assert.ok(src.includes("localStorage.setItem('sdv_bg_lock'"), '背景锁定应用缺少写本地锁定');
  assert.ok(src.includes("localStorage.removeItem('sdv_bg_lock')"), '未锁定/空时缺少清除本地锁定');
  assert.ok(src.includes("new CustomEvent('sdv-dev-state-change'"), '应用后缺少通知 background.js 重判背景');
});

test('M33-9 确认弹窗展示两份文件路径与背景锁定摘要', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('本次提交文件（两份）'), '确认弹窗缺少「两份文件」标题');
  assert.ok(src.includes('① 页面内容 JSON') && src.includes('② 背景锁定配置 JSON'), '确认弹窗缺少两份文件路径展示');
  assert.ok(src.includes("esc(repo.bgLockPath || 'data/background-lock.json')"), '确认弹窗缺少背景锁定路径兜底');
  assert.ok(src.includes('esc(bgSummary)'), '确认弹窗缺少背景锁定摘要展示');
});
