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

test('M11 卷轴UI：三色配色（外层深棕 var(--wood-frame) / 内层浅米 var(--wood-light) / 米卡其底 var(--card-bg)）', () => {
  const s = scrollPart();
  assert.ok(s.includes('var(--wood-frame)'), '缺少外层粗描边深棕 var(--wood-frame)');
  assert.ok(s.includes('var(--wood-light)'), '缺少内层浅色描边 var(--wood-light)');
  assert.ok(s.includes('var(--card-bg)'), '缺少内侧米卡其底色 var(--card-bg)');
});

test('M11 卷轴UI：边框宽度 card/modal 6px、btn 4px（深棕粗框）', () => {
  const s = scrollPart();
  const card = s.match(/\.scroll-card\s*\{[^}]*\}/)[0];
  const btn = s.match(/\.scroll-btn\s*\{[^}]*\}/)[0];
  const modal = s.match(/\.scroll-modal\s*\{[^}]*\}/)[0];
  assert.ok(card.includes('border: 6px solid var(--wood-frame)'), 'scroll-card 边框非 6px 深棕粗框');
  assert.ok(btn.includes('border: 4px solid var(--wood-frame)'), 'scroll-btn 边框非 4px 深棕粗框');
  assert.ok(modal.includes('border: 6px solid var(--wood-frame)'), 'scroll-modal 边框非 6px（应与 card 一致）');
});

test('M11 卷轴UI：box-shadow 多层明暗模拟像素立体质感（blur=0 硬边，双层像素边框）', () => {
  const s = scrollPart();
  assert.ok(s.includes('inset 0 0 0 3px var(--wood-light)') || s.includes('inset 0 0 0 2px var(--wood-light)'), '缺少内层浅色描边 var(--wood-light)');
  assert.ok(s.includes('inset 0 -10px 0 var(--bg-deep)') || s.includes('inset 0 -8px 0 var(--bg-deep)'), '缺少内底部卡其立体');
  assert.ok(s.includes('6px 6px 0 var(--shadow)') || s.includes('4px 4px 0 var(--shadow)') || s.includes('2px 2px 0 var(--shadow)'), '缺少外硬阴影');
  assert.ok(!/\dpx\s+blur/.test(s) && !s.includes('rgba(0, 0, 0, 0.'), '出现柔和模糊阴影（应全部硬边）');
});

test('M11 卷轴UI：像素小圆角 + 合适 padding 防文字压框', () => {
  const s = scrollPart();
  assert.ok(s.includes('border-radius: var(--radius)'), '未使用像素圆角变量');
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
