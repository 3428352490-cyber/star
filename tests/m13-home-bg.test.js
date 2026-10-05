'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { readAppFile } = require('./helpers/harness');

test('M13 首页顶部背景：HTML 提供背景层容器 .app-bg', () => {
  const html = readAppFile('index.html');
  assert.ok(html.includes('class="app-bg"'), '缺少背景层容器');
  assert.ok(html.includes('aria-hidden="true"'), '背景层应无辅助功能语义');
});

test('M13 首页顶部背景：背景图层级置于所有卡片下方，顶部图片清晰', () => {
  const layout = readAppFile('css/layout.css');
  assert.ok(layout.includes('.app-bg'), '缺少 .app-bg 样式');
  assert.ok(layout.includes('z-index: 0'), '背景层未置于底层');
  assert.ok(layout.includes('#page-container { position: relative; z-index: 1; }'), '页面内容未置于背景层之上');
  assert.ok(layout.includes('opacity: 0.85'), '顶部图片未保持清晰');
  assert.ok(layout.includes('pointer-events: none'), '背景层未禁止点击穿透');
});

test('M13 首页顶部背景：顶部背景大图，等比缩放不拉伸，向下渐变淡出到下方格子背景', () => {
  const layout = readAppFile('css/layout.css');
  assert.ok(layout.includes('url("../assets/stardew-title-bg.png")'), '未引用 assets 背景图');
  assert.ok(layout.includes('background-size: cover'), '背景未等比缩放铺满（会拉伸变形）');
  assert.ok(layout.includes('background-position: top center'), '背景未对齐顶部');
  assert.ok(layout.includes('background-repeat: no-repeat'), '背景未禁止重复平铺');
  // 向下渐变透明：图片在靠近卡片上边缘处慢慢淡出，平滑过渡到下方格子背景
  assert.ok(layout.includes('mask-image: linear-gradient(to bottom'), '缺少向下渐变透明效果');
  assert.ok(layout.includes('-webkit-mask-image: linear-gradient(to bottom'), '缺少 -webkit- 前缀渐变兼容');
  assert.ok(layout.includes('#000 62%, rgba(0, 0, 0, 0) 100%'), '渐变区间不完整（应在卡片上边缘附近开始淡出）');
});

test('M13 首页顶部背景：快捷功能/功能专区板块整体下移让出顶部空间，其他页面不受影响', () => {
  const layout = readAppFile('css/layout.css');
  assert.ok(layout.includes('.app-bg') && layout.includes('height: 280px'), '顶部背景区域缺少固定高度');
  assert.ok(layout.includes('#page-container:has(> .home-grid) { padding-top: 266px; }'), '首页板块未整体下移让出顶部空间');
  // 其他页面：无 home-grid 时不受下移影响（标题与返回按钮保留）
  assert.ok(layout.includes('.page-header:has(+ .home-grid) { display: none; }'), '未精确隐藏首页标题板块');
  const hasBareHide = /\.page-header\s*\{\s*display:\s*none/.test(layout);
  assert.ok(!hasBareHide, '存在全局标题隐藏，会误删其他页面标题与返回按钮');
  assert.ok(layout.includes('.btn-back'), '返回按钮样式被破坏');
});

test('M13 首页顶部背景：移动端背景自适应，保持比例不拉伸，渐变正常生效', () => {
  const layout = readAppFile('css/layout.css');
  assert.ok(layout.includes('@media (max-width: 420px)'), '缺少移动端适配');
  assert.ok(layout.includes('.app-bg { height: 210px; background-size: cover; background-position: top center; }'), '移动端背景规则不完整');
  assert.ok(layout.includes('#page-container:has(> .home-grid) { padding-top: 196px; }'), '移动端板块下移规则缺失');
});
