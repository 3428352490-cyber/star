'use strict';
/* M4 阶段测试：路由与页面框架（首页/图鉴/搜索/公告/我的/占位页） */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref } = require('./helpers/harness.js');

loadApp();

const CONFIG = ref('SDV_CONFIG');
const Pages = ref('Pages');
const Router = ref('Router');
const Store = ref('Store');
const els = globalThis.__testEls;

function count(html, token) {
  return (html.match(new RegExp(token, 'g')) || []).length;
}

function resetNav() {
  Store.load(); // 与应用 init 一致：先加载本地存档
  Store.setSelectedNav(CONFIG.quickNav.defaultSelected.slice());
}

test('M4-1 parseHash 解析各路由', () => {
  globalThis.location.hash = '#/home';
  assert.deepEqual(Router.parseHash(), { path: 'home', param: '' });
  globalThis.location.hash = '#/module/villagers';
  assert.deepEqual(Router.parseHash(), { path: 'module', param: 'villagers' });
  globalThis.location.hash = '#/quick-edit';
  assert.deepEqual(Router.parseHash(), { path: 'quick-edit', param: '' });
  globalThis.location.hash = '';
  assert.deepEqual(Router.parseHash(), { path: 'home', param: '' }, '空 hash 应回退首页');
  globalThis.location.hash = '#/unknown/page';
  assert.deepEqual(Router.parseHash(), { path: 'unknown', param: 'page' });
});

test('M4-2 首页：默认 4 模块瓦片 + 7 自定义格 + 第 8 格「更多」', () => {
  resetNav();
  const html = Pages.home();
  // 瓦片按钮：4 选中 + 3 空位 + 1「更多」= 8 格
  assert.equal(count(html, 'class="tile"'), 4, '应渲染 4 个功能瓦片');
  assert.equal(count(html, 'tile-empty'), 3, '默认应为 3 个空位');
  assert.equal(count(html, 'tile-more'), 1, '缺少「更多」按钮');
  assert.ok(html.includes('更多'), '缺少「更多」文案');
  assert.equal(count(html, 'data-route="#/module/'), 4, '功能瓦片路由数应为 4');
  assert.ok(html.includes('data-route="#/quick-edit"'), '「更多」未跳转快捷键编辑');
  for (const label of ['村民', '日历', '计算器', '筛选器']) {
    assert.ok(html.includes(label), '缺少默认模块: ' + label);
  }
});

test('M4-3 首页：自定义勾选生效，快捷格数量恒定 8', () => {
  Store.load();
  Store.setSelectedNav(['fish', 'crops']);
  const html = Pages.home();
  assert.ok(html.includes('鱼类') && html.includes('农作物'), '自定义模块未渲染');
  assert.equal(count(html, 'class="tile"'), 2, '功能瓦片应为 2');
  assert.equal(count(html, 'tile-empty'), 5, '自定义 2 项时应 5 个空位');
  assert.equal(count(html, 'tile-more'), 1, '「更多」格应恒存在');
  assert.equal(count(html, 'data-route="#/module/'), 2, '模块路由数应为 2');
  resetNav();
});

test('M4-4 首页：四大卡片与信息卡占位', () => {
  resetNav();
  const html = Pages.home();
  for (const title of ['星露谷地图', '新手指南', '种植计算器', '模组拓展专区']) {
    assert.ok(html.includes(title), '缺少卡片: ' + title);
  }
  for (const key of ['map', 'guide', 'calculator', 'mods']) {
    assert.ok(html.includes('data-route="#/card/' + key + '"'), '卡片路由缺失: ' + key);
  }
  assert.ok(!html.includes('本地存档'), 'APP 不应展示本地存档表现');
  assert.ok(!html.includes('云端更新'), '首页不应有云端更新入口');
});

test('M4-5 图鉴：38 分类网格复用模块数组', () => {
  const html = Pages.codex();
  assert.equal(count(html, 'class="tile tile-codex"'), 38, '分类瓦片应为 38');
  assert.ok(html.includes('38 类'), '分类计数未渲染');
  assert.ok(html.includes('墙纸') && html.includes('秘密纸条') && html.includes('下装'), '关键分类缺失');
});

test('M4-6 搜索页：搜索框与结果区框架', () => {
  const html = Pages.search();
  assert.ok(html.includes('id="search-input"'), '缺少搜索输入框');
  assert.ok(html.includes('id="search-result"'), '缺少结果容器');
  assert.ok(html.includes('输入关键词，检索全部词条'), '缺少空态提示');
});

test('M4-7 公告主页：默认展示最近 3 条公告 + 「更多/收起」切换（无当前版本卡片、无更新入口）', () => {
  const html = Pages.news();
  assert.ok(html.includes('版本更新'), '缺少公告标题');
  assert.equal(count(html, 'notice-item'), 3, '主页应默认只展示最近 3 条公告');
  assert.ok(html.includes('v' + CONFIG.app.version), '缺少最新版本徽标');
  assert.ok(html.includes('data-action="news-toggle-more"'), '缺少「更多/收起」按钮动作');
  assert.ok(html.includes('更多'), '缺少「更多」按钮');
  assert.ok(!html.includes('data-action="check-update"'), '公告页不应有云端更新入口');
  // 展开后展示全部公告；重置展开态防止污染后续断言
  Pages.newsResetExpand();
  Pages.newsToggleMore();
  const expanded = Pages.news();
  assert.equal(count(expanded, 'notice-item'), CONFIG.announcements.length, '展开后应展示全部公告');
  Pages.newsResetExpand();
});

test('M4-7b 历史公告页：展示全部公告 + 左上角返回公告主页', () => {
  const html = Pages.newsHistory();
  assert.equal(count(html, 'notice-item'), CONFIG.announcements.length, '历史页应展示全部公告');
  assert.ok(html.includes('历史公告'), '缺少历史页标题');
  assert.ok(html.includes('往期公告'), '缺少往期公告区块');
  assert.ok(html.includes('data-route="#/news"'), '缺少返回公告主页按钮');
  assert.ok(html.includes('v' + CONFIG.app.version), '历史页缺少最新版本徽标');
  if (CONFIG.announcements.length >= 2) {
    assert.ok(html.includes(CONFIG.announcements[1].version), '历史页缺少往期版本徽标');
  }
});

test('M4-8 我的页：游客资料卡 + 我的社区 + 主题开关 + 版本（无快捷键编辑条目）', () => {
  Store.load();
  const html = Pages.mine();
  assert.ok(html.includes('星露谷村民') || html.includes('account-text'), '缺少游客资料文案');
  assert.ok(html.includes('account-card'), '缺少账号卡片');
  assert.ok(html.includes('data-action="open-profile-modal"'), '账号卡应打开个人资料弹窗');
  assert.ok(html.includes('我的帖子') && html.includes('我的点赞') && html.includes('我的收藏'), '缺少我的社区入口');
  assert.ok(html.includes('data-theme-follow'), '缺少跟随系统开关');
  assert.ok(html.includes('data-theme-manual="light"') && html.includes('data-theme-manual="dark"'), '缺少手动主题按钮');
  assert.ok(!html.includes('data-route="#/quick-edit"'), '我的页不应有快捷键编辑入口');
  assert.ok(html.includes('v' + CONFIG.app.version), '关于区缺少版本号');
  assert.ok(html.includes('data-action="open-admin"'), '缺少管理后台预留入口');
});

test('M4-9 快捷键编辑页：38 项勾选、计数、保存/恢复', () => {
  resetNav();
  const html = Pages.quickEdit();
  assert.equal(count(html, 'data-nav-check='), 38, '勾选项应为 38');
  assert.equal(count(html, 'data-nav-check="villagers" checked'), 1, '默认选中村民未标记');
  assert.ok(html.includes('id="nav-count"'), '缺少已选计数');
  assert.ok(html.includes('data-action="nav-save"') && html.includes('data-action="nav-reset"'), '缺少保存/恢复按钮');
});

test('M4-10 模块占位页：38 个 key 均可达；未知 key 回退 404', () => {
  for (const m of CONFIG.modules) {
    const html = Pages.modulePage(m.key);
    assert.ok(html.includes(m.label), '模块页缺标题: ' + m.key);
    assert.ok(html.includes('一期占位'), '模块页缺占位标记: ' + m.key);
  }
  assert.ok(Pages.modulePage('no-such').includes('未找到该页面'), '未知模块未回退 404');
});

test('M4-11 卡片占位页 + 未知卡片回退', () => {
  assert.ok(Pages.cardPage('map').includes('星露谷地图'));
  assert.ok(Pages.cardPage('mods').includes('模组拓展专区'));
  assert.ok(Pages.cardPage('nope').includes('未找到该页面'));
});

test('M4-12 filterModules：中英文/大小写/空查询', () => {
  assert.deepEqual(Pages.filterModules('村民').map((m) => m.key), ['villagers']);
  assert.deepEqual(Pages.filterModules('FISH').map((m) => m.key), ['fish']);
  assert.deepEqual(Pages.filterModules('  '), [], '空白查询应返回空');
  assert.ok(Pages.filterModules('工').length >= 2, '模糊匹配应命中多个');
});

test('M4-13 Router.handle 渲染当前路由到 page-container', () => {
  Store.load();
  globalThis.location.hash = '#/module/fish';
  Router.handle();
  let container = els.get('page-container');
  assert.ok(container.innerHTML.includes('鱼类'), '模块路由未渲染');
  globalThis.location.hash = '#/home';
  Router.handle();
  container = els.get('page-container');
  assert.ok(container.innerHTML.includes('快捷功能'), '首页路由未渲染');
  globalThis.location.hash = '#/nope';
  Router.handle();
  container = els.get('page-container');
  assert.ok(container.innerHTML.includes('未找到该页面'), '未知路由未回退');
});
