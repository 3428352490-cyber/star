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

test('M11 卷轴UI：border-image 九宫格三要素（source / slice:32 / stretch）', () => {
  const comp = readAppFile('css/components.css');
  assert.ok(comp.includes('border-image-source: url("../assets/scroll-frame.png")'), '缺少 border-image-source');
  assert.ok(comp.includes('border-image-slice: 32'), '缺少 border-image-slice: 32（四边裁32px，中间丢弃）');
  assert.ok(comp.includes('border-image-repeat: stretch'), '缺少 border-image-repeat: stretch');
});

test('M11 卷轴UI：边框宽度 card/modal 32px、btn 16px（缩小）', () => {
  const comp = readAppFile('css/components.css');
  assert.ok(comp.includes('border: 32px solid transparent'), '大卡片/弹窗边框宽度非 32px');
  assert.ok(comp.includes('border: 16px solid transparent'), '小按钮边框宽度非 16px');
});

test('M11 卷轴UI：scroll-modal 与 scroll-card 边框样式一致（均 32px + slice 32）', () => {
  const comp = readAppFile('css/components.css');
  const modal = comp.match(/\.scroll-modal\s*\{[^}]*\}/)[0];
  assert.ok(modal.includes('border: 32px solid transparent'), 'scroll-modal 边框宽度非 32px');
  assert.ok(modal.includes('border-image-slice: 32'), 'scroll-modal 未使用 slice:32');
});

test('M11 卷轴UI：中心浅米黄 #f8f0d9 + 足够 padding 防文字压框 + 无圆角', () => {
  const comp = readAppFile('css/components.css');
  assert.ok(comp.includes('background: #f8f0d9'), '中心未填充 #f8f0d9 浅米黄');
  assert.ok(comp.includes('padding: 36px 32px'), 'scroll-card 内边距不足');
  assert.ok(comp.includes('padding: 20px 12px'), 'scroll-btn 内边距不足');
  for (const cls of ['scroll-card', 'scroll-btn', 'scroll-modal']) {
    const block = comp.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`));
    assert.ok(block && block[0].includes('border-radius: 0'), `${cls} 未关闭圆角`);
  }
});

test('M11 卷轴UI：卷轴组件内无渐变/平铺残留（纯 border-image 方案）', () => {
  const comp = readAppFile('css/components.css');
  const scrollStart = comp.indexOf('.scroll-card');
  const scrollPart = scrollStart >= 0 ? comp.slice(scrollStart) : '';
  assert.ok(!scrollPart.includes('linear-gradient') && !scrollPart.includes('radial-gradient'), '卷轴组件不应使用渐变');
  assert.ok(!scrollPart.includes('repeat-x'), '卷轴组件不应使用平铺');
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
