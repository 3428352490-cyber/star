'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, readAppFile } = require('./helpers/harness');

function scrollPart() {
  const comp = readAppFile('css/components.css');
  const start = comp.indexOf('.scroll-card');
  assert.ok(start >= 0, 'components.css 缺少 .scroll-card');
  return comp.slice(start);
}

test('M11 卷轴UI：定义 scroll-card / scroll-btn / scroll-modal 三个 class', () => {
  const comp = readAppFile('css/components.css');
  assert.ok(comp.includes('.scroll-card {'), '缺少 .scroll-card');
  assert.ok(comp.includes('.scroll-btn {'), '缺少 .scroll-btn');
  assert.ok(comp.includes('.scroll-modal {'), '缺少 .scroll-modal');
});

test('M11 卷轴UI：纯 CSS 绘制，不使用 border-image 与图片素材', () => {
  const s = scrollPart();
  assert.ok(!s.includes('border-image'), '卷轴组件仍使用 border-image');
  assert.ok(!s.includes('url('), '卷轴组件仍引用图片素材');
});

test('M11 卷轴UI：三色配色（深木棕 #8b572a / 提亮 #c48b4b / 浅米 #f8f0d9）', () => {
  const s = scrollPart();
  assert.ok(s.includes('#8b572a'), '缺少边框主色深木棕 #8b572a');
  assert.ok(s.includes('#c48b4b'), '缺少边缘提亮浅木色 #c48b4b');
  assert.ok(s.includes('#f8f0d9'), '缺少内侧浅米底色 #f8f0d9');
});

test('M11 卷轴UI：边框宽度 card/modal 6px、btn 4px（细框）', () => {
  const s = scrollPart();
  const card = s.match(/\.scroll-card\s*\{[^}]*\}/)[0];
  const btn = s.match(/\.scroll-btn\s*\{[^}]*\}/)[0];
  const modal = s.match(/\.scroll-modal\s*\{[^}]*\}/)[0];
  assert.ok(card.includes('border: 6px solid #8b572a'), 'scroll-card 边框非 6px 深木棕');
  assert.ok(btn.includes('border: 4px solid #8b572a'), 'scroll-btn 边框非 4px 深木棕');
  assert.ok(modal.includes('border: 6px solid #8b572a'), 'scroll-modal 边框非 6px（应与 card 一致）');
});

test('M11 卷轴UI：box-shadow 多层明暗模拟木框立体质感（blur=0 像素硬边）', () => {
  const s = scrollPart();
  assert.ok(s.includes('inset 0 0 0 2px #c48b4b') || s.includes('inset 0 0 0 1px #c48b4b'), '缺少内缘提亮高光');
  assert.ok(s.includes('inset 0 -2px 0 0 #6d441f'), '缺少内底部暗线（立体感）');
  assert.ok(s.includes('0 0 0 1px #c48b4b'), '缺少外缘提亮描边');
  assert.ok(s.includes('0 1px 0 1px #5b3a1a'), '缺少外底部暗影（细微明暗）');
  assert.ok(!/\dpx\s+blur/.test(s) && !s.includes('rgba(0, 0, 0, 0.'), '出现柔和模糊阴影（应全部硬边）');
});

test('M11 卷轴UI：无圆角 + 合适 padding 防文字压框', () => {
  const s = scrollPart();
  assert.ok(s.includes('border-radius: 0'), '未关闭圆角');
  assert.ok(s.includes('padding: 24px'), 'scroll-card 内边距不足');
  assert.ok(s.includes('padding: 14px 10px'), 'scroll-btn 内边距不足');
  assert.ok(s.includes('padding: 28px 24px'), 'scroll-modal 内边距不足');
});

test('M11 卷轴UI：全局保留像素渲染 image-rendering: pixelated', () => {
  const base = readAppFile('css/base.css');
  assert.ok(base.includes('image-rendering: pixelated'), '缺少全局像素渲染');
});

test('M11 卷轴UI：scroll-btn 保留按压动态反馈', () => {
  const s = scrollPart();
  assert.ok(s.includes('.scroll-btn:active'), '缺少按压反馈');
  assert.ok(s.includes('transform: translate(2px, 2px)'), '按压缺少位移反馈');
});
