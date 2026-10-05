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
