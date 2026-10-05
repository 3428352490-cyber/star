'use strict';
/* M0 阶段测试：工程初始化（结构完整性 + 资源引用 + PNG/JSON 校验） */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REQUIRED_DIRS = ['css', 'js', 'assets', 'assets/icons', 'scripts', 'tests', 'tests/helpers'];
const REQUIRED_FILES = [
  'index.html', 'version.json', 'README.md',
  'css/base.css', 'css/layout.css', 'css/components.css',
  'js/util.js', 'js/config.js', 'js/store.js', 'js/theme.js', 'js/ui.js',
  'js/pages.js', 'js/router.js', 'js/update.js', 'js/app.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-blank.png',
];

test('M0-1 必需目录存在', () => {
  for (const d of REQUIRED_DIRS) {
    assert.ok(fs.existsSync(path.join(ROOT, d)), '缺少目录: ' + d);
  }
});

test('M0-2 必需文件存在', () => {
  for (const f of REQUIRED_FILES) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), '缺少文件: ' + f);
  }
});

test('M0-3 index.html 含核心容器，且所有资源引用可解析', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const id of ['page-container', 'bottom-nav', 'modal-root', 'import-file']) {
    assert.ok(html.includes('id="' + id + '"'), '缺少容器: ' + id);
  }
  const refs = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g)).map((m) => m[1]);
  assert.ok(refs.length >= 5, '资源引用数量异常: ' + refs.length);
  for (const r of refs) {
    const clean = r.split('#')[0].split('?')[0];
    if (!clean) continue;
    assert.ok(fs.existsSync(path.join(ROOT, clean)), '资源引用缺失: ' + clean);
  }
});

test('M0-4 version.json 为合法 JSON 且版本与 js/config.js 同步', () => {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
  const configSrc = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
  const m = configSrc.match(/version:\s*'([^']+)'/);
  assert.ok(m, 'js/config.js 缺少版本号');
  assert.equal(v.version, m[1], 'version.json 与 js/config.js 版本不同步');
  assert.ok(Array.isArray(v.notes) && v.notes.length > 0, 'notes 缺失');
});

test('M0-5 图标为合法 PNG（签名 + 尺寸）', () => {
  const sizes = { 'icon-192.png': 192, 'icon-512.png': 512 };
  for (const [name, size] of Object.entries(sizes)) {
    const buf = fs.readFileSync(path.join(ROOT, 'assets/icons', name));
    assert.deepEqual(
      Array.from(buf.subarray(0, 8)),
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      name + ' 不是合法 PNG'
    );
    assert.equal(buf.readUInt32BE(16), size, name + ' 宽度不符');
    assert.equal(buf.readUInt32BE(20), size, name + ' 高度不符');
  }
});

test('M0-6 全部 js/css 占位文件可被 Node 语法加载', () => {
  const files = [
    'js/util.js', 'js/config.js', 'js/store.js', 'js/theme.js', 'js/ui.js',
    'js/pages.js', 'js/router.js', 'js/update.js', 'js/app.js',
    'css/base.css', 'css/layout.css', 'css/components.css',
  ];
  for (const f of files) {
    assert.doesNotThrow(() => fs.readFileSync(path.join(ROOT, f), 'utf8'), '读取失败: ' + f);
  }
});
