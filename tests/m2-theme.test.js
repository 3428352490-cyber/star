'use strict';
/* M2 阶段测试：深浅主题系统（跟随系统 / 手动联动 / 防跳变 / 持久化） */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();

const Store = ref('Store');
const Theme = ref('Theme');
const mql = globalThis.__testMql;
const rootEl = globalThis.document.documentElement;

function resetStore() {
  localStorage.clear();
  Store.load();
}

test('M2-1 默认跟随系统：系统浅色 → 生效浅色', () => {
  resetStore();
  mql.set(false);
  assert.equal(Store.getTheme().followSystem, true);
  assert.equal(Theme.effective(), 'light');
});

test('M2-2 跟随系统：系统深色 → 生效深色，并写入 data-theme', () => {
  resetStore();
  mql.set(true);
  assert.equal(Theme.effective(), 'dark');
  Theme.apply();
  assert.equal(rootEl.dataset.theme, 'dark');
});

test('M2-3 手动锁定：跟随关闭 + manual=dark，系统浅色不影响', () => {
  resetStore();
  mql.set(false);
  Store.setTheme({ followSystem: false, manual: 'dark' });
  assert.equal(Theme.effective(), 'dark');
});

test('M2-4 手动切换自动关闭「跟随系统」，并即时应用', () => {
  resetStore();
  mql.set(true); // 系统为深色
  Theme.setManual('light');
  assert.equal(Store.getTheme().followSystem, false, '手动切换未关闭跟随');
  assert.equal(Store.getTheme().manual, 'light');
  assert.equal(rootEl.dataset.theme, 'light', '界面未应用手动主题');
});

test('M2-5 关闭跟随防跳变：当前生效值写入手动', () => {
  resetStore();
  mql.set(true);
  Store.setTheme({ followSystem: true });
  assert.equal(Theme.effective(), 'dark');
  Theme.setFollowSystem(false);
  assert.equal(Store.getTheme().followSystem, false);
  assert.equal(Store.getTheme().manual, 'dark', '关闭跟随前未保留当前生效主题');
  assert.equal(Theme.effective(), 'dark', '关闭跟随前后主题跳变');
});

test('M2-6 开启跟随系统：followSystem 置回 true', () => {
  resetStore();
  Theme.setFollowSystem(false);
  Theme.setFollowSystem(true);
  assert.equal(Store.getTheme().followSystem, true);
});

test('M2-7 系统深浅变化实时跟随（仅跟随开启时）', () => {
  resetStore();
  Store.setTheme({ followSystem: true, manual: 'light' });
  mql.set(false);
  Theme.apply();
  mql.set(true); // 触发 change 监听
  assert.equal(rootEl.dataset.theme, 'dark', '跟随开启时系统变化未同步');

  // 跟随关闭时，系统变化不生效
  Theme.setManual('light');
  mql.set(false);
  assert.equal(rootEl.dataset.theme, 'light', '跟随关闭时被系统变化影响');
});

test('M2-8 主题状态写透持久化，重启后保持', () => {
  resetStore();
  Theme.setManual('dark');
  const raw = localStorage.getItem('sdv-guide:config');
  localStorage.clear();
  localStorage.setItem('sdv-guide:config', raw);
  Store.load();
  assert.equal(Store.getTheme().manual, 'dark');
  assert.equal(Store.getTheme().followSystem, false);
});

test('M2-9 base.css 含两套主题变量定义', () => {
  const css = readAppFile('css/base.css');
  assert.ok(css.includes(':root'), '缺少 :root 变量块');
  assert.ok(css.includes('[data-theme="dark"]'), '缺少深色主题变量块');
  assert.ok(css.includes('--bg:'), '缺少 --bg 变量');
});
