'use strict';
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');
const fire = (el, t, e) => globalThis.fire(el, t, e);
const test = require('node:test');
const assert = require('node:assert');

let SearchUI;
let input, panel, carousel, btn;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test.before(() => {
  loadApp();
});

test.after(() => {
  if (SearchUI && SearchUI.stopCarousel) SearchUI.stopCarousel();
});

test.beforeEach(async () => {
  SearchUI = ref('SearchUI');
  assert.ok(SearchUI, 'SearchUI 应已加载');
  localStorage.clear();
  input = document.getElementById('search-input');
  panel = document.getElementById('search-panel');
  carousel = document.getElementById('search-carousel');
  btn = document.getElementById('search-btn');
  SearchUI.initSearchPanel();
  await wait(20); // 等 Mock 推荐异步加载完成
});

test('M18-1 搜索按钮：页面存在搜索按钮，样式为像素卡片', () => {
  assert.ok(btn, '搜索按钮应存在');
  const pageHtml = readAppFile('js/pages.js');
  assert.ok(pageHtml.includes('id="search-btn"'), '搜索页应含搜索按钮');
  assert.ok(pageHtml.includes('class="search-btn"'), '搜索按钮应带像素卡片类名');
  const css = readAppFile('css/components.css');
  assert.ok(css.includes('.search-btn'), '搜索按钮样式应存在');
  assert.ok(css.includes('var(--accent)') && css.includes('var(--wood-frame)'), '按钮应复用主题像素配色');
});

test('M18-2 空输入点击搜索：读取当前轮播词执行搜索并写入历史', () => {
  // 轮播首条已渲染（搜索：X）
  const word = (carousel.children[0] && carousel.children[0].textContent || '').replace(/^搜索：/, '');
  assert.ok(word, '轮播应已有当前词');
  input.value = ''; // 输入框空白
  fire(btn, 'click', { target: btn });
  assert.equal(input.value, word, '空输入点击搜索应填入当前轮播词');
  assert.ok(SearchUI.SearchHistory.get().includes(word), '搜索成功应写入历史');
  assert.equal(panel.style.display, 'none', '搜索后应收起面板');
});

test('M18-3 非空输入点击搜索：直接执行输入词搜索', () => {
  input.value = '钓鱼';
  fire(btn, 'click', { target: btn });
  assert.equal(input.value, '钓鱼', '非空输入应直接执行输入词');
  assert.ok(SearchUI.SearchHistory.get().includes('钓鱼'), '应写入历史');
});

test('M18-4 initSearchPanel 幂等：重复初始化不叠加多套轮播词条', () => {
  SearchUI.initSearchPanel();
  SearchUI.initSearchPanel();
  assert.equal(carousel.children.length, 1, '多次初始化轮播层只应有一条当前词条');
  const text = carousel.children[0].textContent || '';
  assert.ok(text.startsWith('搜索：'), '轮播词条应为占位文案');
});

test('M18-5 destroySearchPanel：销毁后清除轮播词，空输入不再触发搜索', () => {
  assert.ok((carousel.children[0].textContent || '').startsWith('搜索：'), '销毁前应有轮播词');
  SearchUI.destroySearchPanel();
  input.value = '';
  fire(btn, 'click', { target: btn });
  assert.equal(input.value, '', '销毁后无轮播词，空输入不应填入任何内容');
  assert.deepEqual(SearchUI.SearchHistory.get(), [], '销毁后空输入不应写入历史');
});

test('M18-6 轮播词维护：search_placeholderCurrentWord 随轮播词条同步', () => {
  // 通过导出状态间接验证：空输入点击搜索用轮播词
  input.value = '';
  fire(btn, 'click', { target: btn });
  const used = input.value;
  assert.ok(used, '空输入应取到轮播词');
  assert.equal(used, (carousel.children[0].textContent || '').replace(/^搜索：/, ''), '使用的词应与轮播展示一致');
});

test('M18-7 推荐词条点击：填入词条 → 立即 runSearch → 写入历史 → 收起面板', () => {
  const wordEl = panel.querySelector('[data-word]');
  assert.ok(wordEl, '推荐词条应存在');
  wordEl.dataset.word = '温室';
  fire(panel, 'click', { target: wordEl });
  assert.equal(input.value, '温室', '点击推荐词条应填入关键词');
  assert.ok(SearchUI.SearchHistory.get().includes('温室'), '应自动写入本地搜索历史');
  assert.equal(panel.style.display, 'none', '搜索后应收起面板');
});

test('M18-8 输入时停止轮播、清空恢复：轮播层显隐随输入状态切换', () => {
  // 挂载后轮播层可见
  assert.notEqual(carousel.style.display, 'none', '无输入时轮播层应可见');
  input.value = '蓝莓';
  fire(input, 'input', { target: input });
  assert.equal(carousel.style.display, 'none', '输入内容时轮播层应隐藏');
  input.value = '';
  fire(input, 'input', { target: input });
  assert.notEqual(carousel.style.display, 'none', '清空输入应恢复轮播层');
});
