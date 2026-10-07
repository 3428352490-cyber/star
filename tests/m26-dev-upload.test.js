'use strict';
/* M26 阶段测试：v2.4.13 一键上传读取本地缓存改造——
   ① 上传数据源改为 localStorage 缓存的待修改 JSON（公告仅在有本地缓存时携带，
      不再读取页面原始配置 SDV_CONFIG，避免旧原始数据覆盖远程最新公告）；
   ② 上传成功回调触发页面版本检测（拉取远程最新 json 刷新页面）；
   ③ 提交失败保留本地全部待更新数据不丢失。 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();
const DevAdmin = ref('DevAdmin');

const NS = 'sdv-guide:devadmin:';

function resetLocal() {
  Object.keys(localStorage).forEach((k) => { if (k.indexOf(NS) === 0) localStorage.removeItem(k); });
  try { localStorage.removeItem('sdv_bg_lock'); } catch (e) {}
}

before(resetLocal);

test('M26-1 一键上传读取本地缓存公告：有本地公告缓存时携带，无缓存时不携带', () => {
  resetLocal();
  // 无公告缓存且无远程基底：payload 不携带 announcements 字段（增量合并：不凭空生成也不删远程数据）
  let payload = DevAdmin.buildPageContentPayload();
  assert.ok(!('announcements' in payload), '无本地公告缓存且无远程基底时不应携带 announcements');
  assert.ok(!('pageEdit' in payload) && !('fontConfig' in payload), '无本地缓存且无远程基底时不应携带 pageEdit/fontConfig（增量合并语义）');
  // 写入本地公告修改缓存：payload 应携带缓存值（而非页面原始 SDV_CONFIG）
  const cached = [{ version: '9.9.9', title: '本地公告草稿', notes: ['x'] }];
  localStorage.setItem(NS + 'notice_edit', JSON.stringify(cached));
  payload = DevAdmin.buildPageContentPayload();
  assert.deepEqual(payload.announcements, cached, 'payload 应携带本地缓存公告草稿');
});

test('M26-2 上传数据源不读取页面原始公告配置（SDV_CONFIG）', () => {
  const src = readAppFile('js/dev-admin.js');
  // buildPageContentPayload 内不得再出现 cfg.announcements / SDV_CONFIG.announcements 作为上传源
  assert.ok(!src.includes('announcements: cfg.announcements'), '上传不再读取页面原始公告配置');
  assert.ok(src.includes("read('notice_edit', null)"), '缺少本地公告缓存读取逻辑');
});

test('M26-3 上传成功回调：清空本地待上传缓存标记 + 触发页面版本检测', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('Updater.checkUpdate(false)'), '成功回调缺少触发页面版本检测');
  assert.ok(src.includes("localStorage.removeItem(NS + 'notice_edit')"), '成功回调缺少清除公告缓存标记');
  assert.ok(src.includes("localStorage.removeItem(NS + 'page_edit')"), '成功回调缺少清除页面修改缓存标记');
  // 版本检测应在远程数据刷新成功（rr.ok）之后触发
  assert.ok(src.indexOf('Updater.checkUpdate(false)') > src.indexOf('rr && rr.ok'), '版本检测应仅在刷新成功后触发');
});

test('M26-4 提交失败保留本地全部待更新数据：失败分支先于清缓存/刷新流程', () => {
  const src = readAppFile('js/dev-admin.js');
  const failIdx = src.indexOf('if (!r.ok)');
  const refreshIdx = src.indexOf('refreshPageContentFromRemote()');
  assert.ok(failIdx > -1 && refreshIdx > -1, '缺少失败分支或刷新流程');
  assert.ok(failIdx < refreshIdx, '上传失败分支应先 return，不进入清缓存/刷新（本地数据不丢失）');
  assert.ok(src.includes('上传失败不会损坏仓库原有文件'), '失败提示保留');
});

test('M26-5 提交逻辑保留：api.github.com 域名校验 + contents 接口 sha', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes("'https://api.github.com'"), '缺少 GitHub API 基础地址');
  assert.ok(src.includes('GitHub API 域名异常，必须使用 api.github.com'), '缺少域名强制校验');
  assert.ok(src.includes('/contents/'), '缺少 GitHub contents 接口');
  assert.ok(src.includes('if (sha) body.sha = sha;'), '缺少携带最新 sha 防提交冲突');
});
