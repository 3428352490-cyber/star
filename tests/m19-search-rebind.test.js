'use strict';
const { loadApp, ref } = require('./helpers/harness.js');
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
  SearchUI.initSearchPanel();
  await wait(20);
  input = document.getElementById('search-input');
  panel = document.getElementById('search-panel');
  carousel = document.getElementById('search-carousel');
  btn = document.getElementById('search-btn');
});

/** 模拟真实浏览器路由重建：销毁旧组件 + 元素对象全部替换 + 重新进入搜索页 */
function simulateRebuild() {
  SearchUI.destroySearchPanel();
  globalThis.__resetEl('search-input');
  globalThis.__resetEl('search-panel');
  globalThis.__resetEl('search-carousel');
  globalThis.__resetEl('search-btn');
  SearchUI.initSearchPanel();
  input = document.getElementById('search-input');
  panel = document.getElementById('search-panel');
  carousel = document.getElementById('search-carousel');
  btn = document.getElementById('search-btn');
}

test('M19-1 二次进入搜索页（DOM 重建）后：推荐词条点击仍自动触发搜索', async () => {
  simulateRebuild();
  await wait(20);
  const wordEl = panel.querySelector('[data-word]');
  assert.ok(wordEl, '重建后推荐词条应存在');
  wordEl.dataset.word = '温室';
  fire(panel, 'click', { target: wordEl });
  assert.equal(input.value, '温室', '重建后点击词条应填入关键词');
  assert.ok(SearchUI.SearchHistory.get().includes('温室'), '重建后点击词条应自动写入历史');
  assert.equal(panel.style.display, 'none', '重建后搜索应收起面板');
});

test('M19-2 二次进入搜索页（DOM 重建）后：聚焦/输入时轮播停止，清空恢复', () => {
  simulateRebuild();
  assert.notEqual(carousel.style.display, 'none', '重建后无输入时轮播层可见');
  fire(input, 'focus', { target: input });
  assert.equal(carousel.style.display, 'none', '重建后聚焦应隐藏轮播层');
  input.value = '钓鱼';
  fire(input, 'input', { target: input });
  assert.equal(carousel.style.display, 'none', '重建后输入期间轮播保持关闭');
  input.value = '';
  fire(input, 'input', { target: input });
  assert.notEqual(carousel.style.display, 'none', '重建后清空输入应恢复轮播层');
});

test('M19-3 二次进入搜索页（DOM 重建）后：红色搜索按钮触发检索', () => {
  simulateRebuild();
  input.value = '村民';
  fire(btn, 'click', { target: btn });
  assert.equal(input.value, '村民', '重建后点按钮应执行输入词搜索');
  assert.ok(SearchUI.SearchHistory.get().includes('村民'), '重建后点按钮应写入历史');
  assert.equal(panel.style.display, 'none', '重建后点按钮应收起面板');
});

test('M19-4 二次进入搜索页（DOM 重建）后：回车键触发检索', () => {
  simulateRebuild();
  input.value = '蓝莓';
  fire(input, 'keydown', { key: 'Enter', keyCode: 13, target: input });
  assert.ok(SearchUI.SearchHistory.get().includes('蓝莓'), '重建后回车应触发搜索并写入历史');
});

test('M19-5 重建后空输入点搜索按钮：使用当前轮播词搜索', async () => {
  simulateRebuild();
  await wait(20); // 等 Mock 推荐异步加载并渲染轮播首条
  const word = (carousel.children[0] && carousel.children[0].textContent || '').replace(/^搜索：/, '');
  assert.ok(word, '重建后轮播应有当前词');
  input.value = '';
  fire(btn, 'click', { target: btn });
  assert.equal(input.value, word, '重建后空输入点按钮应使用轮播词');
});

test('M19-6 同一页面重复 mount（不重建）：事件不重复绑定、行为不叠加', () => {
  // 同元素再次 mount：不重复绑定（点击只触发一次搜索）
  SearchUI.initSearchPanel();
  const wordEl = panel.querySelector('[data-word]');
  wordEl.dataset.word = '温室';
  fire(panel, 'click', { target: wordEl });
  assert.equal(input.value, '温室', '同元素重复 mount 后词条点击仍正常');
  // 历史只写入一条（未重复触发）
  const cnt = SearchUI.SearchHistory.get().filter((s) => s === '温室').length;
  assert.equal(cnt, 1, '同元素重复 mount 不应重复触发搜索');
});
