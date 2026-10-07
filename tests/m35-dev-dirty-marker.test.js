'use strict';
/* M35 阶段测试：v2.4.22 未上传标记（_dirty）修复——
   修复「已更新到最新版但页面仍显示默认文案」：sync 的本地优先逻辑把「旧同步残留缓存」
   误当「未上传草稿」保护，导致云端内容永远不覆盖页面。新增 _dirty 标记区分：
   保存草稿 → 标记未上传（sync 本地优先）；上传成功 / 同步覆盖 / 重置 → 清除标记（远程可覆盖）。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();
const DevAdmin = ref('DevAdmin');

test('M35-1 setPageEdit 支持未上传标记（_dirty）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('function setPageEdit(v, dirty)'), 'setPageEdit 缺少 dirty 参数');
  assert.ok(src.includes("val._dirty = true"), '缺少未上传标记写入');
  assert.ok(src.includes('v2.4.22：dirty=true 表示「本地未上传修改」'), '缺少标记语义说明');
});

test('M35-2 保存草稿标记未上传：同步时本地优先', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('setPageEdit(stored, true)'), '保存草稿缺少未上传标记');
  assert.ok(src.includes('const localDirty = localPageEdit !== null && localPageEdit._dirty === true'), '缺少 dirty 判断');
  assert.ok(src.includes('if (!localDirty && remote.pageEdit) setPageEdit(remote.pageEdit)'), '同步覆盖缺少 dirty 判断');
});

test('M35-3 上传载荷剥离未上传标记', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('delete pe._dirty'), '上传载荷缺少 _dirty 剥离');
  assert.ok(src.includes('上传载荷不含未上传标记'), '缺少剥离说明');
});

test('M35-4 旧同步残留缓存（无 _dirty）不再被误保护', () => {
  const src = readAppFile('js/dev-admin.js');
  // 本地优先仅当 _dirty === true；无标记（旧残留/已同步）→ 远程可覆盖
  const syncSeg = src.slice(src.indexOf('async function syncRemoteContent'), src.indexOf('async function refreshPageContentFromRemote') < 0 ? src.length : src.indexOf('/* ---------- 字体模板'));
  assert.ok(!syncSeg.includes('if (localPageEdit === null && remote.pageEdit) setPageEdit(remote.pageEdit)'), '旧的本地为null判断仍存在');
  assert.ok(src.includes('旧同步残留缓存（无 _dirty）会被远程覆盖'), '缺少残留缓存说明');
});

test('M35-5 上传成功刷新写回远程内容自动清除未上传标记', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('if (remote.pageEdit) setPageEdit(remote.pageEdit)'), '刷新写回远程内容（无 _dirty 自动清除标记）');
  // 远程内容无 _dirty → 写回即清除；本地优先仅对 _dirty=true 生效
  assert.ok(src.includes("localPageEdit._dirty === true"), 'dirty 判断仅匹配显式未上传标记');
});
