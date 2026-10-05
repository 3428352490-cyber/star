'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, readAppFile } = require('./helpers/harness');

test('M11 卷轴UI：scroll-frame 素材在项目 assets 目录且 CSS 引用正确', () => {
  const asset = readAppFile('assets/scroll-frame.png');
  assert.ok(asset && asset.length > 0, 'assets/scroll-frame.png 缺失或为空');
  const comp = readAppFile('css/components.css');
  assert.ok(comp.includes('url("../assets/scroll-frame.png")'), 'CSS 未引用 scroll-frame.png');
});

test('M11 卷轴UI：定义 scroll-card / scroll-btn / scroll-modal 三个 class', () => {
  const comp = readAppFile('css/components.css');
  assert.ok(comp.includes('.scroll-card {'), '缺少 .scroll-card');
  assert.ok(comp.includes('.scroll-btn {'), '缺少 .scroll-btn');
  assert.ok(comp.includes('.scroll-modal {'), '缺少 .scroll-modal');
});

test('M11 卷轴UI：顶/底横向平铺（repeat-x）+ 四角端头取块不扭曲', () => {
  const comp = readAppFile('css/components.css');
  assert.ok(comp.includes('repeat-x'), '缺少顶部/底部水平平铺');
  assert.ok(comp.includes('calc(3 * var(--scroll-h)) calc(3 * var(--scroll-h))'), '四角端头未按放大取块（会扭曲）');
  const repeatDecl = comp.match(/background-repeat:\s*([^;]+);/g) || [];
  assert.ok(repeatDecl.some((d) => d.includes('repeat-x')), 'background-repeat 未配置水平平铺');
});

test('M11 卷轴UI：左右禁止拉伸横向图，使用橙色木质线性渐变竖边框', () => {
  const comp = readAppFile('css/components.css');
  assert.ok(comp.includes('linear-gradient(90deg'), '缺少左右线性渐变竖边框');
  assert.ok(comp.includes('#d9a75c') && comp.includes('#a86f2e'), '渐变非橙色木质色调');
  assert.ok(!comp.includes('url("../assets/scroll-frame.png") 100%'), '左右边仍引用素材拉伸（应禁用）');
});

test('M11 卷轴UI：中心浅米黄 #f8f0d9 + 足够 padding 防文字压框 + 无圆角', () => {
  const comp = readAppFile('css/components.css');
  assert.ok(comp.includes('background-color: #f8f0d9'), '中心未填充 #f8f0d9 浅米黄');
  assert.ok(comp.includes('padding: calc(var(--scroll-h) + 12px)'), '缺少足够内边距');
  for (const cls of ['scroll-card', 'scroll-btn', 'scroll-modal']) {
    const block = comp.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`));
    assert.ok(block && block[0].includes('border-radius: 0'), `${cls} 未关闭圆角`);
  }
});

test('M11 卷轴UI：全局保留像素渲染 image-rendering: pixelated', () => {
  const base = readAppFile('css/base.css');
  assert.ok(base.includes('image-rendering: pixelated'), '缺少全局像素渲染');
});

test('M11 卷轴UI：scroll-btn 保留按压动态反馈', () => {
  const comp = readAppFile('css/components.css');
  assert.ok(comp.includes('.scroll-btn:active'), '缺少按压反馈');
  assert.ok(comp.includes('transform: translate(2px, 2px)'), '按压缺少位移反馈');
});
