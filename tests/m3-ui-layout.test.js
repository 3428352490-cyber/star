'use strict';
/* M3 阶段测试：UI 组件与布局（底部导航 / Modal / Toast / CSS 结构） */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();

const CONFIG = ref('SDV_CONFIG');
const App = ref('App');
const Modal = ref('Modal');
const Toast = ref('Toast');
const els = globalThis.__testEls;

test('M3-1 layout.css 含底部导航与双端断点结构', () => {
  const css = readAppFile('css/layout.css');
  for (const sel of ['.bottom-nav', '.nav-item', '.nav-item.search', '.nav-item.active', '.home-grid']) {
    assert.ok(css.includes(sel), '缺少选择器: ' + sel);
  }
  assert.ok(css.includes('@media (min-width: 1024px)'), '缺少 1024px 断点');
  assert.ok(css.includes('grid-template-columns: 1fr 1fr'), '缺少宽屏双栏');
  assert.ok(css.includes('flex: 1'), '底部导航未均分宽度');
});

test('M3-2 components.css 含核心组件选择器', () => {
  const css = readAppFile('css/components.css');
  for (const sel of [
    '.card', '.quick-nav-grid', '.tile', '.tile-more', '.tile-empty',
    '.codex-grid', '.home-cards', '.btn-primary', '.switch', '.chip',
    '.setting-row', '.account-card', '.avatar', '.row-btn', '.check-item',
    '.empty-state', '.search-bar', '.search-hit', '.module-placeholder',
    '.modal-mask', '.modal', '.toast', '.tag',
  ]) {
    assert.ok(css.includes(sel), '缺少选择器: ' + sel);
  }
});

test('M3-3 renderTabs：按数组渲染 5 Tab，搜索居中类名存在', () => {
  App.renderTabs();
  const nav = els.get('#bottom-nav');
  const html = nav.innerHTML;
  assert.ok(html, '底部导航未渲染');
  const count = (html.match(/class="nav-item/g) || []).length;
  assert.equal(count, 5, 'Tab 数量应为 5，实际 ' + count);
  assert.ok(html.includes('nav-item search'), '搜索 Tab 缺少居中类名');
  for (const t of CONFIG.tabs) {
    assert.ok(html.includes('>' + t.label + '<'), '缺少 Tab 文案: ' + t.label);
  }
});

test('M3-4 Modal.show 渲染标题/内容/按钮，close 清空', () => {
  Modal.show({ title: '测试标题', body: '<p>测试内容</p>', actions: [{ label: '确定', cls: 'btn-primary' }] });
  const root = els.get('modal-root');
  assert.ok(root.innerHTML.includes('测试标题'), '标题未渲染');
  assert.ok(root.innerHTML.includes('测试内容'), '内容未渲染');
  assert.ok(root.innerHTML.includes('确定'), '按钮未渲染');
  Modal.close();
  assert.equal(root.innerHTML, '', 'close 未清空');
});

test('M3-5 Modal 动作按钮点击：触发 onClick 并关闭', () => {
  const root = els.get('modal-root');
  let clicked = 0;
  Modal.show({
    title: '更新',
    body: '<p>x</p>',
    actions: [{ label: '立即更新', cls: 'btn-primary', onClick: () => { clicked += 1; } }, { label: '稍后' }],
  });
  const mask = root.querySelector('.modal-mask');
  // 模拟点击「立即更新」按钮：target.closest 返回该动作按钮
  fire(mask, 'click', { target: { closest: () => ({ dataset: { modalAction: '0' } }) } });
  assert.equal(clicked, 1, 'onClick 未触发');
  assert.equal(root.innerHTML, '', '点击后未关闭');
});

test('M3-6 Modal 点击遮罩关闭', () => {
  const root = els.get('modal-root');
  Modal.show({ title: 'x' });
  const mask = root.querySelector('.modal-mask');
  fire(mask, 'click', { target: mask });
  assert.equal(root.innerHTML, '', '点击遮罩未关闭');
});

test('M3-7 Toast.show 追加 .toast 元素到 body', () => {
  Toast.show('测试提示');
  const body = globalThis.document.body;
  assert.ok(body.children.some((c) => c.className === 'toast'), '未追加 toast 元素');
});
