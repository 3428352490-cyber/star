'use strict';
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');
const fire = (el, t, e) => globalThis.fire(el, t, e);
const test = require('node:test');
const assert = require('node:assert');

let SearchUI;
let input, panel;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// loadApp 每文件仅一次（vm 顶层 const 不能重复声明）
test.before(() => {
  loadApp();
});

test.after(() => {
  // 停止占位轮播定时器，避免进程挂起
  if (SearchUI && SearchUI.stopCarousel) SearchUI.stopCarousel();
});

test.beforeEach(async () => {
  SearchUI = ref('SearchUI');
  assert.ok(SearchUI, 'SearchUI 应已加载');
  localStorage.clear();
  input = document.getElementById('search-input');
  panel = document.getElementById('search-panel');
  SearchUI.mount();
  await wait(20); // 等 Mock 推荐异步加载完成
});

test('M17-1 搜索历史：新增去重置顶、上限 10 条', () => {
  const H = SearchUI.SearchHistory;
  H.add('蓝莓');
  H.add('温室');
  H.add('蓝莓'); // 重复 → 置顶
  let list = H.get();
  assert.deepEqual(list, ['蓝莓', '温室'], '重复词应去重置顶');
  for (let i = 0; i < 12; i++) H.add('词条' + i);
  list = H.get();
  assert.equal(list.length, 10, '历史总数上限应为 10');
  assert.equal(list[0], '词条11', '最新词应在最顶部');
});

test('M17-2 搜索历史：单条删除与一键清空', () => {
  const H = SearchUI.SearchHistory;
  H.add('蓝莓'); H.add('温室'); H.add('钓鱼');
  let list = H.remove('温室');
  assert.deepEqual(list, ['钓鱼', '蓝莓'], '单条删除应移除对应词');
  list = H.clear();
  assert.deepEqual(list, [], '清空应返回空数组');
  assert.deepEqual(H.get(), [], 'localStorage 中历史应清空');
});

test('M17-3 AI 推荐：固定 6 条，历史词置前', async () => {
  const AI = SearchUI.SearchAI;
  const recs = await AI.fetchRecommendations(['蓝莓', '村民']);
  assert.equal(recs.length, SearchUI.RECOMMEND_COUNT, '推荐应固定 6 条');
  assert.equal(recs[0], '蓝莓', '历史词应置前');
  assert.equal(recs[1], '村民', '历史词应置前');
  const noHist = await AI.fetchRecommendations([]);
  assert.equal(noHist.length, SearchUI.RECOMMEND_COUNT, '无历史时也应返回 6 条热点推荐');
});

test('M17-4 面板渲染：历史 + 推荐两个板块；历史超 5 条出现展开按钮', () => {
  const H = SearchUI.SearchHistory;
  H.add('蓝莓'); H.add('温室'); H.add('钓鱼'); H.add('种子'); H.add('铁匠铺'); H.add('野花'); // 6 条
  SearchUI.refresh();
  const html = panel.innerHTML;
  assert.ok(html.includes('搜索历史'), '应包含历史板块');
  assert.ok(html.includes('AI 搜索推荐'), '应包含推荐板块');
  assert.ok(html.includes('展开全部'), '历史超 5 条应出现展开按钮');
  assert.ok(!html.includes('暂无搜索历史'), '有历史时不应显示空提示');
  // 默认仅展示 5 条历史
  assert.equal((html.match(/search-history-word/g) || []).length, 5, '默认最多展示 5 条历史');
});

test('M17-5 面板展开：点击展开显示全部 10 条，再点收起', () => {
  const H = SearchUI.SearchHistory;
  for (let i = 0; i < 8; i++) H.add('词条' + i);
  SearchUI.refresh();
  const expandBtn = panel.querySelector('[data-expand]');
  assert.ok(expandBtn, '展开按钮应存在');
  fire(panel, 'click', { target: expandBtn });
  let html = panel.innerHTML;
  assert.equal((html.match(/search-history-word/g) || []).length, 8, '展开后应展示全部历史');
  assert.ok(html.includes('收起'), '展开后按钮文案应为收起');
  const foldBtn = panel.querySelector('[data-expand]');
  fire(panel, 'click', { target: foldBtn });
  html = panel.innerHTML;
  assert.equal((html.match(/search-history-word/g) || []).length, 5, '收起后恢复默认 5 条');
});

test('M17-6 词条点击：填入搜索框并执行搜索、写入历史、收起面板', async () => {
  const wordEl = panel.querySelector('[data-word]');
  assert.ok(wordEl, '推荐词条应存在');
  wordEl.dataset.word = '蓝莓'; // fakeEl 不解析 innerHTML，手动注入词条值
  fire(panel, 'click', { target: wordEl });
  const w = wordEl.dataset.word;
  assert.equal(input.value, w, '点击词条应填入搜索框');
  assert.ok(SearchUI.SearchHistory.get().includes(w), '搜索成功应写入历史');
  assert.equal(panel.style.display, 'none', '提交搜索后应收起面板');
  // 输入框应触发 input 事件 → app 委托 handleSearch 渲染结果
  assert.ok(document.getElementById('search-result'), '搜索结果容器应存在');
  await wait(10);
});

test('M17-7 单条删除与清空按钮交互', () => {
  const H = SearchUI.SearchHistory;
  H.add('蓝莓'); H.add('温室');
  SearchUI.refresh();
  const delBtn = panel.querySelector('[data-del]');
  assert.ok(delBtn, '删除按钮应存在');
  fire(panel, 'click', { target: delBtn });
  assert.ok(!H.get().includes(delBtn.dataset.del), '点击删除应移除该条历史');
  SearchUI.refresh();
  const clearBtn = panel.querySelector('[data-clear]');
  assert.ok(clearBtn, '清空按钮应存在');
  fire(panel, 'click', { target: clearBtn });
  assert.deepEqual(H.get(), [], '点击清空应清空全部历史');
});

test('M17-8 交互：点击搜索框展开面板、输入时隐藏、点击空白处收起', () => {
  // 初始 mount 后面板默认可见（展示历史+推荐）
  assert.notEqual(panel.style.display, 'none', '挂载后面板应可见');
  // 开始输入 → 隐藏面板
  input.value = '蓝莓';
  fire(input, 'input', { target: input });
  assert.equal(panel.style.display, 'none', '输入时应隐藏历史与推荐面板');
  // 清空输入 → 恢复面板
  input.value = '';
  fire(input, 'input', { target: input });
  assert.notEqual(panel.style.display, 'none', '清空输入应恢复面板');
  // 点击空白处 → 收起
  SearchUI.show();
  fire(document, 'click', { target: { closest: () => null } });
  assert.equal(panel.style.display, 'none', '点击页面空白处应收起面板');
});

test('M17-9 占位轮播：挂载后占位切为推荐词，3 秒间隔', () => {
  assert.ok(input.placeholder.startsWith('搜索：'), '占位文字应轮播推荐词');
  assert.equal(SearchUI.CAROUSEL_MS, 3000, '轮播间隔应为 3 秒');
  assert.equal(SearchUI.HISTORY_MAX, 10, '历史上限应为 10');
  assert.equal(SearchUI.HISTORY_SHOW, 5, '默认展示 5 条');
});

test('M17-10 面板结构：search-area 包裹搜索区，组件含像素卡片类名', () => {
  const pageHtml = readAppFile('js/pages.js');
  assert.ok(pageHtml.includes('class="card search-area"'), '搜索区应包裹 .search-area');
  assert.ok(pageHtml.includes('id="search-panel"'), '页面应含搜索面板容器');
  const css = readAppFile('css/components.css');
  assert.ok(css.includes('.search-panel') && css.includes('.search-block'), '面板样式应存在');
  assert.ok(css.includes('.search-history-item') && css.includes('.search-reco-item'), '历史与推荐条目样式应存在');
  assert.ok(css.includes('--wood-frame') && css.includes('--card-bg'), '面板应复用像素卡片变量');
});
