'use strict';
/* M10 阶段测试：一期问题修复（问题1-4，逐个验证） */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

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
  Store.load();
  Store.setSelectedNav(CONFIG.quickNav.defaultSelected.slice());
}

test('修复1 首页「更多」按钮进入快捷键编辑页（quick-edit 路由映射）', () => {
  resetNav();
  // 首页「更多」按钮路由指向编辑页
  const home = Pages.home();
  assert.ok(home.includes('data-route="#/quick-edit"'), '「更多」按钮路由缺失');

  // 点击「更多」→ hash 更新 → Router 渲染快捷键编辑页而非 404
  globalThis.location.hash = '#/quick-edit';
  Router.handle();
  const container = els.get('page-container');
  assert.ok(container.innerHTML.includes('快捷键编辑'), '未渲染快捷键编辑页');
  assert.ok(container.innerHTML.includes('data-nav-check='), '编辑页缺少勾选项');
  assert.ok(!container.innerHTML.includes('未找到该页面'), '不应回退到页面不存在');

  // 还原首页 hash，避免影响其他用例
  globalThis.location.hash = '#/home';
  Router.handle();
});

test('修复1b 端到端：点击「更多」成功打开编辑页，并可返回首页', () => {
  resetNav();
  globalThis.location.hash = '#/home';
  Router.handle();

  // 模拟点击首页「更多」按钮（data-route="#/quick-edit"）
  globalThis.__fireDoc('click', {
    target: { closest: (sel) => (sel === '[data-route]' ? { dataset: { route: '#/quick-edit' } } : null) },
  });
  assert.equal(globalThis.location.hash, '#/quick-edit', '点击更多未跳转');
  Router.handle();
  const edit = els.get('page-container');
  assert.ok(edit.innerHTML.includes('快捷键编辑'), '编辑页未打开');
  assert.ok(edit.innerHTML.includes('data-route="#/home"'), '编辑页缺少返回首页按钮');
  assert.ok(!edit.innerHTML.includes('未找到该页面'), '不应提示页面不存在');

  // 模拟点击编辑页返回按钮（data-route="#/home"）
  globalThis.__fireDoc('click', {
    target: { closest: (sel) => (sel === '[data-route]' ? { dataset: { route: '#/home' } } : null) },
  });
  assert.equal(globalThis.location.hash, '#/home', '返回未跳回首页');
  Router.handle();
  const home = els.get('page-container');
  assert.ok(home.innerHTML.includes('快捷功能'), '返回后未渲染首页');
});

test('修复1c 版本三处同步（config / sw.js / version.json），升级触发 SW 缓存更新', () => {
  const v = CONFIG.app.version;
  assert.ok(v !== '0.1.0', '版本应已升级（触发缓存失效，使修复生效）');
  const sw = readAppFile('sw.js');
  assert.ok(sw.includes("CACHE_NAME = 'sdv-guide-v" + v + "'"), 'sw.js 缓存名与版本不同步');
  const vj = JSON.parse(readAppFile('version.json'));
  assert.equal(vj.version, v, 'version.json 与版本不同步');
});

test('修复2 APP 不展示本地存档功能表现（持久化仍为系统功能）', () => {
  resetNav();
  assert.ok(!Pages.home().includes('本地存档'), '首页不应展示本地存档说明');
  assert.ok(!Pages.mine().includes('本地存档'), '我的页不应展示本地存档说明');

  // 持久化能力本身不因界面移除而受影响（写透 + 重启保持）
  Store.setSelectedNav(['fish', 'crops']);
  const raw = localStorage.getItem('sdv-guide:config');
  localStorage.clear();
  localStorage.setItem('sdv-guide:config', raw);
  Store.load();
  assert.deepEqual(Store.getSelectedNav(), ['fish', 'crops'], '本地存档功能失效');
  resetNav();
});

test('修复2b 刷新首页不可见本地存档卡片，本地存储功能正常', () => {
  resetNav();
  // 连续两次“刷新”（重新渲染首页），卡片始终不可见
  for (let i = 0; i < 2; i++) {
    const home = Pages.home();
    assert.ok(!home.includes('本地存档'), '刷新后首页仍不应有本地存档卡片');
    assert.ok(!home.includes('info-card'), '刷新后首页不应有信息卡残留');
  }
  // 底层本地存储功能正常：写入 → 模拟重启（清空并重载）→ 保持
  Store.setTheme({ followSystem: false, manual: 'dark' });
  const raw = localStorage.getItem('sdv-guide:config');
  localStorage.clear();
  localStorage.setItem('sdv-guide:config', raw);
  Store.load();
  assert.equal(Store.getTheme().manual, 'dark', '本地存储功能异常');
  resetNav();
});

test('修复3 云端更新入口仅保留「我的」页', () => {
  resetNav();
  // 首页：无云端更新入口
  const home = Pages.home();
  assert.ok(!home.includes('云端更新'), '首页不应有云端更新卡片');
  assert.ok(!home.includes('check-update'), '首页不应有更新按钮');
  // 公告页：无更新入口，保留版本信息
  const news = Pages.news();
  assert.ok(!news.includes('check-update'), '公告页不应有更新按钮');
  assert.ok(!news.includes('检查更新'), '公告页不应有检查更新文案');
  assert.ok(news.includes('当前版本'), '公告页版本信息应保留');
  // 我的页：保留唯一更新入口
  const mine = Pages.mine();
  assert.equal(count(mine, 'check-update'), 1, '我的页应保留唯一云端更新入口');
  assert.ok(mine.includes('data-action="check-update"'), '我的页缺少检查更新按钮');
});

test('修复3b 刷新首页不可见云端更新卡片，版本检测底层逻辑保留', async () => {
  resetNav();
  // 连续两次“刷新”（重新渲染首页），云端更新卡片始终不可见
  for (let i = 0; i < 2; i++) {
    const home = Pages.home();
    assert.ok(!home.includes('云端更新'), '刷新后首页仍不应有云端更新卡片');
    assert.ok(!home.includes('check-update'), '刷新后首页不应有更新按钮');
  }
  // 版本检测底层逻辑保留：云端更高版本 → 仍能检出更新
  const Updater = ref('Updater');
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ version: '9.9.9', notes: ['云端检测验证'] }) });
  const r = await Updater.check(false);
  assert.equal(r.updated, true, '版本检测底层逻辑失效');
  assert.ok(r.notice.includes('发现新版本'), '未检出新版本');
  // 恢复 harness 默认 fetch（未 stub 时抛错），避免影响其他用例
  globalThis.fetch = async () => { throw new Error('fetch 未在测试中 stub'); };
});

test('公告 本次更新内容写入公告页（数组驱动，最新在前）', () => {
  resetNav();
  const list = CONFIG.announcements;
  assert.ok(Array.isArray(list) && list.length >= 1, '公告数组缺失或为空');

  // 最新公告版本应与当前版本一致，且包含本次更新内容
  const latest = list[0];
  assert.equal(latest.version, CONFIG.app.version, '最新公告版本应等于当前版本');
  assert.ok(latest.title, '最新公告缺标题');
  assert.ok(latest.date, '最新公告缺日期');
  assert.ok(Array.isArray(latest.notes) && latest.notes.length > 0, '最新公告缺内容');

  // 每条公告结构完整
  for (const a of list) {
    assert.ok(a.title && a.date, '公告缺标题/日期: ' + a.version);
    assert.ok(Array.isArray(a.notes) && a.notes.length > 0, '公告缺内容: ' + a.version);
  }

  // 公告页渲染本次更新要点
  const html = Pages.news();
  assert.ok(html.includes('notice-item'), '公告页未渲染公告条目');
  assert.ok(html.includes('v' + latest.version), '公告页未渲染最新版本徽标');
  assert.ok(html.includes(latest.title), '公告页未渲染最新公告标题');
  for (const kw of ['更多', '快捷键编辑', '按压动态反馈']) {
    assert.ok(html.includes(kw), '公告页缺少本次更新要点: ' + kw);
  }
  // 旧版本公告也应保留（历史可追溯）
  if (list.length >= 2) {
    assert.ok(html.includes(list[1].version), '公告页缺少历史版本公告');
  }
});

test('修复4 按钮按压动态反馈：全部可点元素含 :active 与过渡动画', () => {
  const css = readAppFile('css/components.css');
  // 覆盖快捷键瓦片、底部导航、按钮、chip、勾选项、行按钮、首页卡片、账号卡、搜索结果
  const interactive = [
    '.nav-item', '.tile', '.btn', '.chip', '.check-item',
    '.row-btn', '.home-card', '.account-card', '.search-hit',
  ];
  for (const sel of interactive) {
    assert.ok(css.includes(sel + ':active'), '缺少按压反馈: ' + sel + ':active');
  }
  assert.ok(css.includes('transition: transform 0.08s'), '缺少按压过渡动画');
  assert.ok(css.includes('filter: brightness'), '缺少按压亮度变化');
  // 按压应产生位移（像素风按下凹陷）
  assert.ok(css.includes('translate(2px, 2px)'), '缺少按下位移');
});
