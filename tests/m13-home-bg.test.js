'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { readAppFile } = require('./helpers/harness');

test('M13 首页顶部背景：HTML 提供背景层容器 .app-bg', () => {
  const html = readAppFile('index.html');
  assert.ok(html.includes('class="app-bg"'), '缺少背景层容器');
  assert.ok(html.includes('aria-hidden="true"'), '背景层应无辅助功能语义');
});

test('M13 首页顶部背景：背景图层级置于所有卡片组件下方，低透明度不遮挡内容', () => {
  const layout = readAppFile('css/layout.css');
  assert.ok(layout.includes('.app-bg'), '缺少 .app-bg 样式');
  assert.ok(layout.includes('z-index: 0'), '背景层未置于底层');
  assert.ok(layout.includes('#page-container { position: relative; z-index: 1; }'), '页面内容未置于背景层之上');
  assert.ok(layout.includes('opacity: 0.5'), '背景未降低透明度');
  assert.ok(layout.includes('pointer-events: none'), '背景层未禁止点击穿透');
});

test('M13 首页顶部背景：使用 assets 背景图，等比缩放不拉伸，移动端适配', () => {
  const layout = readAppFile('css/layout.css');
  assert.ok(layout.includes('url("../assets/stardew-title-bg.png")'), '未引用 assets 背景图');
  assert.ok(layout.includes('background-size: cover'), '背景未等比缩放铺满（会拉伸变形）');
  assert.ok(layout.includes('background-position: top center'), '背景未对齐顶部');
  assert.ok(layout.includes('background-repeat: no-repeat'), '背景未禁止重复平铺');
  assert.ok(layout.includes('@media (max-width: 420px)'), '缺少移动端适配');
  assert.ok(layout.includes('.app-bg { background-size: cover; background-position: top center; opacity: 0.4; }'), '移动端背景规则不完整');
});

test('M13 首页顶部背景：删除首页「星露谷攻略」标题板块，其他页面标题与返回按钮保留', () => {
  const layout = readAppFile('css/layout.css');
  // 仅隐藏首页标题：通过「其后紧跟 .home-grid」精确命中，不误伤其他页面
  assert.ok(layout.includes('.page-header:has(+ .home-grid) { display: none; }'), '未精确隐藏首页标题板块');
  // 不存在裸 .page-header { display:none }（否则会误删全部页面标题/返回按钮）
  const hasBareHide = /\.page-header\s*\{\s*display:\s*none/.test(layout);
  assert.ok(!hasBareHide, '存在全局标题隐藏，会误删其他页面标题与返回按钮');
  assert.ok(layout.includes('.btn-back'), '返回按钮样式被破坏');
});
