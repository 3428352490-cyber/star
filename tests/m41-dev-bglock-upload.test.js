'use strict';
/* M41 阶段测试：v2.5.3 背景锁定配置内嵌 page-content.json 单文件同步（合并上传）——
   v2.5.2 曾删除背景锁定上传（独立文件导致请求翻倍被网络拦截）；
   v2.5.3 改为 backgroundLock 字段内嵌单文件上传（单次 PUT，上传成功 + 多设备锁定同步恢复）：
   ① buildBackgroundLockPayload / refreshBackgroundLockFromRemote 已删除（不再独立文件）；
   ② buildPageContentPayload 内嵌 backgroundLock：本地锁定 → {locked,season,period}；恢复自动 → {locked:false}；
      无缓存 → 保留远程原值；
   ③ pushToGitHub 单文件提交（无 bgLockPath 读写）；
   ④ applyRemoteBackgroundLock：远程拉取时写本地 sdv_bg_lock + 通知背景重判（refreshPageContentFromRemote 与 syncRemoteContent 两处接入）；
   ⑤ 面板文案 / 确认弹窗摘要展示背景锁定内嵌字段。 */
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

test('M41-1 背景锁定不再独立文件上传（buildBackgroundLockPayload / refreshBackgroundLockFromRemote 已删，内嵌单文件）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(!src.includes('function buildBackgroundLockPayload'), 'buildBackgroundLockPayload 未删除');
  assert.ok(!src.includes('async function refreshBackgroundLockFromRemote'), 'refreshBackgroundLockFromRemote 未删除');
  assert.ok(!src.includes('readRemoteFile(bgLockPath'), '仍读取独立背景锁定 JSON');
  assert.ok(!src.includes('putFileToGitHub(bgLockPath'), '仍提交独立背景锁定 JSON');
  assert.ok(src.includes('payload.backgroundLock'), '缺少 backgroundLock 内嵌字段构建');
});

test('M41-2 背景锁定内嵌载荷：本地锁定 → {locked,season,period}；恢复自动 → {locked:false}；无缓存 → 保留远程原值', () => {
  resetLocal();
  localStorage.setItem('sdv_bg_lock', JSON.stringify({ locked: true, season: 'winter', period: 'night' }));
  const p1 = DevAdmin.buildPageContentPayload(null);
  assert.deepEqual(p1.backgroundLock, { locked: true, season: 'winter', period: 'night' }, '本地锁定应内嵌完整写入');

  resetLocal();
  localStorage.setItem('sdv_bg_lock', JSON.stringify({ locked: false }));
  const p2 = DevAdmin.buildPageContentPayload({ backgroundLock: { locked: true, season: 'spring', period: 'day' } });
  assert.deepEqual(p2.backgroundLock, { locked: false }, '本地恢复自动应以 locked:false 覆盖远程锁定');

  resetLocal();
  const p3 = DevAdmin.buildPageContentPayload({ backgroundLock: { locked: true, season: 'autumn', period: 'dusk' } });
  assert.deepEqual(p3.backgroundLock, { locked: true, season: 'autumn', period: 'dusk' }, '无本地修改应保留远程原值');
});

test('M41-3 一键上传仅提交页面内容 JSON（单文件，files 仅含 jsonPath）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('readRemoteFile(repo.jsonPath'), '缺少页面内容 JSON 读取');
  assert.ok(src.includes("files: [repo.jsonPath]"), '上传返回值 files 应仅含页面内容 JSON');
  assert.ok(!src.includes("files: [repo.jsonPath, bgLockPath]"), '上传返回值仍含独立背景锁定文件');
  assert.ok(!src.includes("const bgLockPath = repo.bgLockPath"), '仍存在旧配置 bgLockPath 兜底');
});

test('M41-4 applyRemoteBackgroundLock：远程锁定写本地 + 恢复自动清本地 + 通知背景重判（两处接入）', () => {
  resetLocal();
  DevAdmin.applyRemoteBackgroundLock({ backgroundLock: { locked: true, season: 'summer', period: 'day' } });
  assert.deepEqual(JSON.parse(localStorage.getItem('sdv_bg_lock')), { locked: true, season: 'summer', period: 'day' }, '远程锁定未写入本地');

  DevAdmin.applyRemoteBackgroundLock({ backgroundLock: { locked: false } });
  assert.deepEqual(JSON.parse(localStorage.getItem('sdv_bg_lock')), { locked: false }, '远程恢复自动应以 locked:false 保留覆盖标记（上传可覆盖远程旧锁定）');

  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('function applyRemoteBackgroundLock(remote)'), '缺少远程背景锁定应用函数');
  assert.ok(src.includes("new CustomEvent('sdv-dev-state-change'"), '应用后缺少通知 background.js 重判');
  const occurrences = (src.match(/applyRemoteBackgroundLock\(remote\);/g) || []).length;
  assert.ok(occurrences >= 2, '刷新/同步两处应接入远程背景锁定应用（实际 ' + occurrences + ' 处）');
});

test('M41-5 面板文案与确认弹窗展示背景锁定内嵌字段（单文件说明 + 摘要行）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('backgroundLock 字段内嵌同步'), '面板缺少背景锁定内嵌说明');
  assert.ok(src.includes('背景锁定：锁定'), '确认弹窗摘要缺少背景锁定行');
  assert.ok(!src.includes('本次提交文件（两份）'), '确认弹窗仍显示两份文件');
  assert.ok(!src.includes("bgLockPath: 'data/background-lock.json'"), '默认仓库配置仍含 bgLockPath');
});

test('M41-6 导出JSON下载兜底：单文件且载荷含背景锁定内嵌字段（与一键上传一致）', () => {
  resetLocal();
  localStorage.setItem('sdv_bg_lock', JSON.stringify({ locked: true, season: 'winter', period: 'night' }));
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('data-action="dev-export-json"'), '导出JSON下载按钮缺失');
  const files = DevAdmin.buildExportFiles();
  assert.equal(files.length, 1, '应只导出 1 个 JSON 文件');
  assert.equal(files[0].name, 'page-content.json', '导出文件名应为 page-content.json');
  assert.deepEqual(files[0].data.backgroundLock, { locked: true, season: 'winter', period: 'night' }, '导出载荷应含背景锁定内嵌字段');
  assert.ok(src.includes('github.com/'), '缺少 GitHub 网页手动上传引导文案');
});
