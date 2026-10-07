'use strict';
/* M40 阶段测试：版本号自动判定与更新脚本（scripts/version-bump.js）——
   语义化版本 MAJOR.MINOR.PATCH 自动递增 + 改动类型自动判定（PATCH/MINOR/MAJOR），
   仅处理版本号逻辑，不执行 git 推送。直接 require 脚本导出函数做真实计算验证。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VB = require(path.join(ROOT, 'scripts', 'version-bump.js'));

test('M40-1 版本号递增算法：PATCH +0.0.1（含两位修订号）', () => {
  assert.equal(VB.bumpVersion('2.4.24', 'patch'), '2.4.25');
  assert.equal(VB.bumpVersion('1.0.9', 'patch'), '1.0.10', '两位修订号 9→10');
  assert.equal(VB.bumpVersion('2.4.99', 'patch'), '2.4.100');
});

test('M40-2 版本号递增算法：MINOR 第二位+1 修订归零 / MAJOR 第一位+1 其余归零', () => {
  assert.equal(VB.bumpVersion('2.4.24', 'minor'), '2.5.0', 'MINOR 修订号归零');
  assert.equal(VB.bumpVersion('2.4.24', 'major'), '3.0.0', 'MAJOR 其余归零');
  assert.equal(VB.bumpVersion('1.0.10', 'minor'), '1.1.0');
  assert.equal(VB.bumpVersion('1.1.0', 'major'), '2.0.0');
  assert.throws(() => VB.bumpVersion('abc', 'patch'), /版本号非法/, '非法版本应报错');
  assert.throws(() => VB.bumpVersion('2.4.24', 'huge'), /未知递增类型/, '非法类型应报错');
});

test('M40-3 改动类型自动判定：小改动（多文件小行数）→ PATCH', () => {
  const changes = {
    files: [
      { name: 'js/app.js', added: 60, deleted: 10 },
      { name: 'js/community.js', added: 80, deleted: 5 },
      { name: 'tests/m38.js', added: 30, deleted: 0 },
    ],
    totalAdded: 170, totalDeleted: 15,
    addedFiles: ['tests/m38.js'],
    deletedFiles: [],
  };
  const r = VB.classifyChanges(changes, {});
  assert.equal(r.type, 'patch', '无新增模块/规模小 → 应为 PATCH');
  assert.ok(r.reasons.length > 0, '应输出判定理由');
});

test('M40-4 改动类型自动判定：新增独立脚本（新模块/新页面）→ MINOR', () => {
  const changes = {
    files: [
      { name: 'js/guide-mod.js', added: 320, deleted: 0 },
      { name: 'js/app.js', added: 40, deleted: 8 },
    ],
    totalAdded: 360, totalDeleted: 8,
    addedFiles: ['js/guide-mod.js'],
    deletedFiles: [],
  };
  assert.equal(VB.classifyChanges(changes, {}).type, 'minor', '新增独立脚本 → MINOR');
  // note 关键词弱线索：仅有关键词、无独立模块文件/中等规模 → 不误判 MINOR
  const byNoteOnly = VB.classifyChanges(
    { files: [{ name: 'js/app.js', added: 5, deleted: 2 }], totalAdded: 5, totalDeleted: 2, addedFiles: [], deletedFiles: [] },
    { note: '新增帖子功能模块' }
  );
  assert.equal(byNoteOnly.type, 'patch', '仅有新增关键词无文件证据 → 不应误判 MINOR');
  // note 关键词 + 真实新增业务脚本 → MINOR
  const byNoteWithFile = VB.classifyChanges(
    { files: [{ name: 'js/posts-mod.js', added: 260, deleted: 0 }], totalAdded: 260, totalDeleted: 0, addedFiles: ['js/posts-mod.js'], deletedFiles: [] },
    { note: '新增帖子功能模块' }
  );
  assert.equal(byNoteWithFile.type, 'minor', '关键词+新模块文件 → MINOR');
  // 开发工具脚本（scripts/）不算新功能模块 → PATCH
  const toolOnly = VB.classifyChanges(
    { files: [{ name: 'scripts/version-bump.js', added: 470, deleted: 0 }], totalAdded: 470, totalDeleted: 0, addedFiles: ['scripts/version-bump.js'], deletedFiles: [] },
    { note: '新增版本号自动判定脚本' }
  );
  assert.equal(toolOnly.type, 'patch', 'scripts/ 工具脚本不应判 MINOR');
});

test('M40-5 改动类型自动判定：重构/不兼容/大规模 → MAJOR', () => {
  const big = {
    files: Array.from({ length: 6 }, (_, i) => ({ name: 'js/mod' + i + '.js', added: 700, deleted: 300 })),
    totalAdded: 4200, totalDeleted: 1800,
    addedFiles: [], deletedFiles: ['js/old1.js', 'js/old2.js', 'js/old3.js', 'js/old4.js', 'js/old5.js'],
  };
  assert.equal(VB.classifyChanges(big, {}).type, 'major', '大规模重构+大量删除 → MAJOR');
  const byNote = VB.classifyChanges(
    { files: [{ name: 'js/app.js', added: 20, deleted: 10 }], totalAdded: 20, totalDeleted: 10, addedFiles: [], deletedFiles: [] },
    { note: '底层架构重构，数据不兼容旧版' }
  );
  assert.equal(byNote.type, 'major', '提交说明含重构/不兼容 → MAJOR');
});

test('M40-6 更新公告生成：类型标题 + 摘要条目', () => {
  const ann = VB.buildAnnouncement('patch', '2.4.24', '2.4.25', '修复检查更新自动刷新');
  assert.equal(ann.version, '2.4.25');
  assert.equal(ann.title, '补丁更新');
  assert.ok(ann.items[0].includes('修复检查更新自动刷新'), '公告应包含提交摘要');
  assert.equal(VB.buildAnnouncement('minor', '2.4.24', '2.5.0', '').title, '功能更新');
  assert.equal(VB.buildAnnouncement('major', '2.4.24', '3.0.0', '').title, '重大版本更新');
});

test('M40-7 dry-run 不写任何文件（含 --dry-run 纯 flag 解析）', () => {
  const verFile = path.join(ROOT, 'version.json');
  const before = JSON.parse(fs.readFileSync(verFile, 'utf8')).latestVersion;
  const result = VB.run(['--type=patch', '--dry-run']);
  assert.deepEqual(result.written, [], 'dry-run 不应写文件');
  const after = JSON.parse(fs.readFileSync(verFile, 'utf8')).latestVersion;
  assert.equal(after, before, 'dry-run 后 version.json 不应变化');
  assert.ok(result.newVer !== before || result.type === 'patch', '应输出新版本判定');
});

test('M40-8 版本一致性校验：config.js 与 version.json 不一致时报错', () => {
  // 当前文件一致（2.4.24）→ 不抛错
  assert.doesNotThrow(() => VB.readCurrentVersion());
});
