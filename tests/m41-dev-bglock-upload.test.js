'use strict';
/* M41 阶段测试：v2.5.2 删除「背景锁定上传模块」（仅删除上传部分）——
   背景锁定为本地功能保留（窗口锁定仍可用），一键上传只提交 page-content.json；
   ① buildBackgroundLockPayload / refreshBackgroundLockFromRemote / describeBackgroundLock 已删除；
   ② pushToGitHub 单文件提交（无 bgLockPath 读取/提交，files 仅含页面内容 JSON）；
   ③ 面板文案 / 确认弹窗 / 保存配置不再涉及背景锁定 JSON；
   ④ 导出兜底（导出JSON下载）仅导出 page-content.json。 */
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

test('M41-1 背景锁定上传相关函数已删除（buildBackgroundLockPayload / refreshBackgroundLockFromRemote / describeBackgroundLock）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(!src.includes('function buildBackgroundLockPayload'), 'buildBackgroundLockPayload 未删除');
  assert.ok(!src.includes('async function refreshBackgroundLockFromRemote'), 'refreshBackgroundLockFromRemote 未删除');
  assert.ok(!src.includes('function describeBackgroundLock'), 'describeBackgroundLock 未删除');
  assert.ok(!src.includes('await refreshBackgroundLockFromRemote(repo, token)'), '刷新流程仍调用背景锁定同步');
});

test('M41-2 一键上传仅提交页面内容 JSON（单文件，无 bgLockPath 读写）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('readRemoteFile(repo.jsonPath'), '缺少页面内容 JSON 读取');
  assert.ok(!src.includes('readRemoteFile(bgLockPath'), '仍读取背景锁定 JSON');
  assert.ok(!src.includes('putFileToGitHub(bgLockPath'), '仍提交背景锁定 JSON');
  assert.ok(src.includes("files: [repo.jsonPath]"), '上传返回值 files 应仅含页面内容 JSON');
  assert.ok(!src.includes("files: [repo.jsonPath, bgLockPath]"), '上传返回值仍含背景锁定文件');
  assert.ok(!src.includes("const bgLockPath = repo.bgLockPath"), '仍存在旧配置 bgLockPath 兜底');
});

test('M41-3 本地背景锁定功能保留（窗口与锁定读取逻辑未删）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('data-action="dev-open-bglock"'), '背景锁定窗口入口被删');
  assert.ok(src.includes('打开背景锁定窗口'), '背景锁定板块文案缺失');
  // background.js 锁定读写（v2.5.1 线上生效修复）不受影响
  const bgSrc = readAppFile('js/background.js');
  assert.ok(bgSrc.includes('function readLock()'), 'background.js readLock 缺失');
  assert.ok(bgSrc.includes('if (!isDevAvailable()) return null;'), '背景锁定访客忽略语义丢失');
});

test('M41-4 面板文案与确认弹窗不再提及背景锁定 JSON（提示改为单文件 + 本地功能说明）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(!src.includes('背景锁定配置 JSON'), '面板/弹窗仍提及背景锁定配置 JSON');
  assert.ok(src.includes('背景锁定为本地功能，不再随页面上传'), '缺少背景锁定本地功能说明文案');
  assert.ok(src.includes('本次提交文件</b>'), '确认弹窗文件标题缺失');
  assert.ok(!src.includes('本次提交文件（两份）'), '确认弹窗仍显示两份文件');
  assert.ok(!src.includes('esc(bgSummary)'), '确认弹窗仍展示背景锁定摘要');
});

test('M41-5 保存仓库配置不再写入 bgLockPath', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(!src.includes("bgLockPath: 'data/background-lock.json'"), '默认仓库配置仍含 bgLockPath');
  assert.ok(!src.includes("replace(/[^/]+$/, '') + 'background-lock.json'"), '保存配置仍计算背景锁定路径');
});

test('M41-6 导出JSON下载兜底：仅导出 page-content.json（与一键上传一致）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('data-action="dev-export-json"'), '导出JSON下载按钮缺失');
  const files = DevAdmin.buildExportFiles();
  assert.equal(files.length, 1, '应只导出 1 个 JSON 文件');
  assert.equal(files[0].name, 'page-content.json', '导出文件名应为 page-content.json');
  assert.ok(src.includes('github.com/'), '缺少 GitHub 网页手动上传引导文案');
});
