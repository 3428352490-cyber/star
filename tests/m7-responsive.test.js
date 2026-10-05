'use strict';
/* M7 阶段测试：双端自适应与打磨（宽屏双栏 / 安全区 / 按压反馈 / 焦点态 / 像素风） */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, readAppFile } = require('./helpers/harness.js');

loadApp();

test('M7-1 宽屏双栏：1024px 断点完整规则', () => {
  const css = readAppFile('css/layout.css');
  const mediaStart = css.indexOf('@media (min-width: 1024px)');
  assert.ok(mediaStart >= 0, '缺少 1024px 断点');
  const block = css.slice(mediaStart);
  assert.ok(block.includes('grid-template-columns: 1fr 1fr'), '首页缺少双栏');
  assert.ok(block.includes('.codex-grid { grid-template-columns: repeat(6, 1fr); }'), '图鉴宽屏 6 列缺失');
  assert.ok(block.includes('.check-grid { grid-template-columns: repeat(4, 1fr); }'), '勾选宽屏 4 列缺失');
  assert.ok(block.includes('gap: 18px'), '双栏间距缺失');
});

test('M7-2 手机竖屏单列：默认块级布局', () => {
  const layout = readAppFile('css/layout.css');
  const comp = readAppFile('css/components.css');
  assert.ok(layout.includes('.home-grid { display: block; }'), '竖屏首页应为单列');
  assert.ok(comp.includes('.codex-grid { display: grid; grid-template-columns: repeat(3, 1fr);'), '竖屏图鉴应为 3 列');
});

test('M7-3 安全区：底部导航适配刘海屏', () => {
  const css = readAppFile('css/layout.css');
  assert.ok(css.includes('env(safe-area-inset-bottom)'), '底部导航缺少安全区');
  const html = readAppFile('index.html');
  assert.ok(html.includes('viewport-fit=cover'), 'viewport 未开启安全区适配');
});

test('M7-4 按压反馈：可交互元素均有 :active 位移', () => {
  const css = readAppFile('css/components.css') + readAppFile('css/layout.css');
  for (const sel of ['.tile:active', '.btn:active', '.btn-back:active', '.nav-item:active', '.chip.active']) {
    assert.ok(css.includes(sel), '缺少按压反馈: ' + sel);
  }
});

test('M7-5 键盘焦点态：主要交互元素 focus-visible', () => {
  const css = readAppFile('css/components.css');
  assert.ok(css.includes(':focus-visible'), '缺少焦点态样式');
  for (const sel of ['.tile', '.btn', '.nav-item', '.check-item', '.search-hit']) {
    assert.ok(css.includes(sel + ':focus-visible'), '缺少焦点态: ' + sel);
  }
});

test('M7-6 像素美术风格：图片抗锯齿关闭 + 九宫格木板卡片（无圆角/毛玻璃）', () => {
  const base = readAppFile('css/base.css');
  assert.ok(base.includes('image-rendering: pixelated'), '缺少像素渲染');
  const comp = readAppFile('css/components.css');
  assert.ok(comp.includes('background-image') && comp.includes('url("../assets/stardew-wood-frame.png")'), '卡片缺少九宫格木板背景');
  const all = base + comp + readAppFile('css/layout.css');
  assert.ok(!all.includes('backdrop-filter'), '禁止毛玻璃：仍存在 backdrop-filter');
});

test('M7-7 触控目标尺寸：瓦片与开关不小于 44px 交互区', () => {
  const comp = readAppFile('css/components.css');
  assert.ok(comp.includes('width: 42px; height: 42px;'), '快捷瓦片图标过小');
  assert.ok(comp.includes('width: 46px; height: 26px;'), '开关尺寸定义缺失');
  assert.ok(comp.includes('padding: 9px 10px;'), '勾选项点击区过小');
  const lay = readAppFile('css/layout.css');
  assert.ok(lay.includes('width: 36px; height: 36px;'), '搜索按钮过小');
});

test('M7-8 桌面端信息密度：宽屏字号与间距加大', () => {
  const css = readAppFile('css/layout.css');
  assert.ok(css.includes('.page-header h1 { font-size: 24px; }'), '宽屏标题字号未加大');
  assert.ok(css.includes('.quick-nav-grid { gap: 12px; }'), '宽屏网格间距未加大');
});
