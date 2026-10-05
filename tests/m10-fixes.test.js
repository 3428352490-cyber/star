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
  // 公告页：无更新入口、无当前版本卡片（版本信息由公告徽标承载）
  const news = Pages.news();
  assert.ok(!news.includes('check-update'), '公告页不应有更新按钮');
  assert.ok(!news.includes('检查更新'), '公告页不应有检查更新文案');
  assert.ok(!news.includes('当前版本'), '公告页不应有当前版本卡片');
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

test('公告页改版：主页展示最新公告，更多进入历史页，返回回主页', () => {
  resetNav();
  const list = CONFIG.announcements;
  assert.ok(Array.isArray(list) && list.length >= 2, '应至少有一条最新与一条往期公告');
  const latest = list[0];
  assert.equal(latest.version, CONFIG.app.version, '最新公告版本应等于当前版本');

  // 主页：仅最新一条；含「更多」入口；不含往期版本徽标
  const home = Pages.news();
  assert.equal(count(home, 'notice-item'), 1, '主页应只展示最新一条');
  assert.ok(home.includes('v' + latest.version), '主页未渲染最新版本徽标');
  assert.ok(home.includes(latest.title), '主页未渲染最新公告标题');
  assert.ok(home.includes('data-route="#/news-history"'), '主页缺少「更多」入口');
  assert.ok(!home.includes(list[1].version), '主页不应展示往期公告');
  assert.ok(!home.includes('当前版本'), '主页不应有当前版本卡片');

  // 点击「更多」→ hash 变更 → 历史页渲染全部公告
  globalThis.location.hash = '#/news';
  Router.handle();
  globalThis.__fireDoc('click', {
    target: { closest: (sel) => (sel === '[data-route]' ? { dataset: { route: '#/news-history' } } : null) },
  });
  assert.equal(globalThis.location.hash, '#/news-history', '点更多未跳转历史页');
  Router.handle();
  const hist = els.get('page-container');
  assert.equal(count(hist.innerHTML, 'notice-item'), list.length, '历史页应展示全部公告');
  assert.ok(hist.innerHTML.includes(list[1].version), '历史页缺少往期公告');

  // 历史页左上角返回按钮 → 回到公告主页
  assert.ok(hist.innerHTML.includes('data-route="#/news"'), '历史页缺少返回公告主页按钮');
  globalThis.__fireDoc('click', {
    target: { closest: (sel) => (sel === '[data-route]' ? { dataset: { route: '#/news' } } : null) },
  });
  assert.equal(globalThis.location.hash, '#/news', '返回未回到公告主页');
  Router.handle();
  const back = els.get('page-container');
  assert.equal(count(back.innerHTML, 'notice-item'), 1, '返回后主页应只展示最新一条');

  // 还原 hash
  globalThis.location.hash = '#/home';
  Router.handle();
});

test('UI 复古 8-bit 红白机像素风格：高饱和撞色+直角纯色粗像素边框、禁止渐变与毛玻璃、多形态+深浅主题', () => {
  const base = readAppFile('css/base.css');
  const comp = readAppFile('css/components.css');
  const layout = readAppFile('css/layout.css');
  const all = base + comp + layout;

  // 硬性要求：禁止渐变、毛玻璃；像素渲染（注：scroll-* 卷轴组件按需求允许橙色渐变竖边框，其余禁止）
  const scrollStart = all.indexOf('.scroll-card');
  const nonScroll = scrollStart >= 0 ? all.slice(0, scrollStart) : all;
  assert.ok(!nonScroll.includes('linear-gradient') && !nonScroll.includes('radial-gradient'), '禁止渐变：非卷轴组件仍存在 gradient');
  assert.ok(!all.includes('backdrop-filter'), '禁止毛玻璃：仍存在 backdrop-filter');
  assert.ok(all.includes('image-rendering: pixelated'), '缺少像素渲染');

  // 8bit 点阵纹理（纯色块填充）
  assert.ok(base.includes('--wood-texture:') && base.includes('data:image/svg+xml'), '缺少 8bit 点阵纹理');

  // 页面米白底色 + 高饱和撞色（正红）
  assert.ok(base.includes('#F8F2E4'), '缺少页面米白底色 #F8F2E4');
  assert.ok(base.includes('#E6342C'), '缺少正红撞色 #E6342C');

  // 大卡片：纯色块 + 粗像素边框 + 直角（无渐变/无毛玻璃）
  assert.ok(comp.includes('.stardew-card,') && comp.includes('.card {'), '卡片选择器结构被破坏');
  assert.ok(comp.includes('border: 4px solid var(--wood-frame)'), '卡片未用粗像素边框');
  assert.ok(comp.includes('border-radius: var(--radius)'), '卡片未用直角像素块');
  assert.ok(comp.includes('var(--card-bg)'), '卡片未使用主题底色');

  // 快捷瓦片 /「更多」：纯色像素小按钮（.stardew-btn）
  assert.ok(comp.includes('.stardew-btn,') && comp.includes('.tile {'), '快捷瓦片选择器结构被破坏');
  assert.ok(comp.includes('.tile') && comp.includes('border: 3px solid var(--wood-frame)'), '快捷功能瓦片未用粗像素边框');
  assert.ok(comp.includes('.tile-more') && comp.includes('var(--accent-2)'), '「更多」按钮未用暖黄撞色');
  assert.ok(comp.includes('.home-card') && comp.includes('.card'), '功能专区卡片未复用像素卡片');

  // 普通按钮/公告条：像素纹理保留
  assert.ok(comp.includes('.btn {') && comp.includes('var(--wood-texture)'), '按钮未用像素纹理');
  assert.ok(comp.includes('.notice-item') && comp.includes('var(--wood-texture)'), '公告长条未用像素纹理');
  assert.ok(comp.includes('1px dashed var(--wood-border)'), '行分隔未像素化');
  assert.ok(comp.includes('.search-hit') && comp.includes('var(--wood-border)'), '搜索结果未像素边框');
  assert.ok(comp.includes('.check-item') && comp.includes('var(--wood-border)'), '勾选项未像素边框');

  // 对话弹窗：NES 米白面板 + 粗黑框 + 对话框文字色 + 头像形态
  assert.ok(comp.includes('.modal {') && comp.includes('var(--dialog-bg)'), '弹窗未用 NES 面板');
  assert.ok(comp.includes('.modal-body.avatar') && comp.includes('.modal-avatar'), '缺少头像对话框形态');
  assert.ok(comp.includes('var(--dialog-text)'), '对话框文字未用对话文字色');

  // 成就提示条：NES 面板横条
  assert.ok(comp.includes('.toast {') && comp.includes('var(--dialog-bg)'), 'Toast 未用 NES 面板');

  // 标题栏：顶部 8bit 像素牌匾
  assert.ok(layout.includes('.page-header') && layout.includes('var(--wood-frame)'), '标题栏缺少像素牌匾');

  // 底部导航：纯色像素菜单栏（.stardew-nav）+ 5 等宽像素按钮
  assert.ok(layout.includes('.stardew-nav,') && layout.includes('.bottom-nav {'), '底部导航选择器结构被破坏');
  assert.ok(layout.includes('var(--nav-bg)') && layout.includes('border-top: 4px solid var(--wood-frame)'), '底部导航未用纯色像素菜单栏');
  assert.ok(layout.includes('.nav-item {') && layout.includes('flex: 1'), '导航按钮非等宽');

  // 深浅主题：两套像素纹理与对话框变量
  const darkStart = base.indexOf('[data-theme="dark"]');
  assert.ok(darkStart > 0, '缺少深色主题块');
  const darkBlock = base.slice(darkStart);
  assert.ok(darkBlock.includes('--wood-texture:'), '深色主题缺少像素纹理');
  assert.ok(darkBlock.includes('--dialog-bg:') && darkBlock.includes('--dialog-border:'), '深色主题缺少对话框面板');

  // 可读性：正文使用主题文字色
  assert.ok(comp.includes('color: var(--text)'), '文字颜色未保持主题适配');
  assert.ok(comp.includes('--text-dim'), '次要文字颜色未保持主题适配');
});

test('移除我的页快捷键编辑条目：入口收敛至首页「更多」，编辑页仍可达', () => {
  resetNav();
  // 我的页：无「快捷功能/快捷键编辑」条目
  const mine = Pages.mine();
  assert.ok(!mine.includes('快捷键编辑'), '我的页不应有快捷键编辑条目');
  assert.ok(!mine.includes('data-route="#/quick-edit"'), '我的页不应有编辑页路由');
  assert.ok(!mine.includes('快捷功能'), '我的页不应有快捷功能卡片');

  // 首页「更多」入口保留，仍可进入编辑页
  const home = Pages.home();
  assert.ok(home.includes('data-route="#/quick-edit"'), '首页「更多」按钮入口丢失');
  globalThis.location.hash = '#/quick-edit';
  Router.handle();
  const edit = els.get('page-container');
  assert.ok(edit.innerHTML.includes('快捷键编辑'), '编辑页无法访问');
  assert.ok(!edit.innerHTML.includes('未找到该页面'), '编辑页回退 404');
  globalThis.location.hash = '#/home';
  Router.handle();
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
