'use strict';
/* M43 阶段测试：v2.5.2 导出 JSON 下载兜底通道（网络无法直连 api.github.com 时，
   下载本地修改数据 → GitHub 网页端手动上传覆盖，走 github.com 域名不受 API 拦截影响）。
   ① 开发者面板提供「导出JSON下载」按钮（dev-export-json 动作）；
   ② buildExportFiles 返回 page-content.json + background-lock.json 两份载荷，
      与一键上传的载荷构建完全一致（buildPageContentPayload(null) / buildBackgroundLockPayload(null)）；
   ③ 导出载荷不携带版本字段（网页端过滤规则：不以「网页提交」开头的提交不会被 Actions 升版）。 */
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

test('M43-1 面板提供导出JSON下载按钮（dev-export-json 动作 + 提示文案）', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('data-action="dev-export-json"'), '面板缺少导出JSON下载按钮');
  assert.ok(src.includes('exportLocalData'), '缺少 exportLocalData 函数');
  assert.ok(src.includes('buildExportFiles'), '缺少 buildExportFiles 函数');
  assert.ok(src.includes('case \'dev-export-json\''), '缺少 dev-export-json 动作处理');
  assert.ok(src.includes('github.com/' ), '缺少 GitHub 网页手动上传引导文案');
});

test('M43-2 buildExportFiles 返回页面内容文件且载荷与一键上传一致', () => {
  resetLocal();
  localStorage.setItem('sdv_bg_lock', JSON.stringify({ locked: true, season: 'winter', period: 'night' }));
  const files = DevAdmin.buildExportFiles();
  assert.equal(files.length, 1, '应只导出 1 个 JSON 文件');
  assert.equal(files[0].name, 'page-content.json', '文件名应为 page-content.json');
  const a = files[0].data;
  const b = DevAdmin.buildPageContentPayload(null);
  // generatedAt 为毫秒时间戳，两次调用可能差 1ms，剥离后逐字段比较
  delete a.generatedAt; delete b.generatedAt;
  assert.deepEqual(a, b, '页面内容载荷应与一键上传一致');
});

test('M43-3 导出载荷不携带版本字段（网页手动上传不触发自动升版）', () => {
  resetLocal();
  const files = DevAdmin.buildExportFiles();
  files.forEach((f) => {
    assert.ok(!('version' in f.data), f.name + ' 不应携带 version 字段');
    assert.ok(!('latestVersion' in f.data), f.name + ' 不应携带 latestVersion 字段');
  });
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('网页提交'), '提交过滤关键词缺失（Actions 依赖「网页提交」过滤）');
});
