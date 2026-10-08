'use strict';
/* M5 阶段测试：交互功能（事件委托 / 主题联动 / 快捷键编辑 / 搜索 / 弹窗） */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, fakeEl } = require('./helpers/harness.js');

loadApp();

const CONFIG = ref('SDV_CONFIG');
const Store = ref('Store');
const Theme = ref('Theme');
const els = globalThis.__testEls;
const modalRoot = els.get('modal-root');

/** 构造带 closest 匹配表的点击目标 */
function clickTarget(map) {
  return { closest(sel) { return Object.prototype.hasOwnProperty.call(map, sel) ? map[sel] : null; } };
}

/** 构造快捷导航勾选框伪元素 */
function navCb(key, checked) {
  const el = fakeEl('cb-' + key);
  el.dataset.navCheck = key;
  el.checked = checked;
  el.matches = (sel) => sel === '[data-nav-check]';
  el.closest = (sel) => (sel === '.check-item' ? { classList: { toggle() {} } } : null);
  return el;
}

const toastEl = () => els.get('created:div').textContent;

test('M5-1 点击 data-route 元素：更新 location.hash', () => {
  globalThis.location.hash = '#/home';
  __fireDoc('click', {
    target: clickTarget({ '[data-route]': { dataset: { route: '#/quick-edit' } } }),
  });
  assert.equal(globalThis.location.hash, '#/quick-edit', 'hash 未更新');
});

test('M5-2 手动主题开关（v2.5.5 开关UI）：开=深色关=浅色，自动关闭跟随并写入 manual', () => {
  Store.load();
  Theme.setFollowSystem(true);
  const cb = fakeEl('theme-manual-switch');
  cb.matches = (sel) => sel === '[data-theme-manual-switch]';
  cb.checked = true; // 开 → 深色
  __fireDoc('change', { target: cb });
  assert.equal(Store.getTheme().followSystem, false, '手动切换未关闭跟随');
  assert.equal(Store.getTheme().manual, 'dark');
  assert.equal(globalThis.document.documentElement.dataset.theme, 'dark', '界面未应用深色');
  cb.checked = false; // 关 → 浅色
  __fireDoc('change', { target: cb });
  assert.equal(Store.getTheme().manual, 'light', '关闭未切回浅色');
  assert.equal(globalThis.document.documentElement.dataset.theme, 'light', '界面未应用浅色');
});

test('M5-3 游客资料卡点击：弹出「个人资料」弹窗（v2.0.0 社区身份）', () => {
  __fireDoc('click', {
    target: clickTarget({ '[data-action]': { dataset: { action: 'open-profile-modal' } } }),
  });
  assert.ok(els.get('modal-root').innerHTML.includes('个人资料'), '未弹出个人资料弹窗');
});

test('M5-4 跟随系统开关 change：同步 Theme', () => {
  Store.load();
  const cb = fakeEl('theme-follow');
  cb.matches = (sel) => sel === '[data-theme-follow]';
  cb.checked = true;
  __fireDoc('change', { target: cb });
  assert.equal(Store.getTheme().followSystem, true, '开关未生效');
  cb.checked = false;
  __fireDoc('change', { target: cb });
  assert.equal(Store.getTheme().followSystem, false, '关闭未生效');
});

test('M5-5 勾选 change：计数更新 + 超限禁用未选项', () => {
  Store.load();
  const cbs = ['a', 'b', 'c', 'd', 'e'].map((k, i) => navCb(CONFIG.modules[i].key, i < 5));
  const unchecked = navCb('fish', false);
  globalThis.__setQSA([...cbs, unchecked]);
  __fireDoc('change', { target: cbs[0] });
  assert.equal(els.get('#nav-count').textContent, '已选 5/7', '计数未更新');
  assert.equal(unchecked.disabled, false, '未达上限不应禁用');

  const full = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k, i) => navCb(CONFIG.modules[i].key, i < 7));
  const fullUnchecked = navCb('fish', false);
  globalThis.__setQSA([...full, fullUnchecked]);
  __fireDoc('change', { target: full[0] });
  assert.equal(els.get('#nav-count').textContent, '已选 7/7', '满额计数错误');
  assert.equal(fullUnchecked.disabled, true, '达上限未禁用未选项');
  globalThis.__setQSA([]);
});

test('M5-6 保存快捷键：勾选项写透到 Store 并回首页', () => {
  Store.load();
  Store.setSelectedNav([]);
  globalThis.__setQSA([
    navCb('fish', true), navCb('crops', true), navCb('minerals', true),
  ]);
  __fireDoc('click', {
    target: clickTarget({ '[data-action]': { dataset: { action: 'nav-save' } } }),
  });
  assert.deepEqual(Store.getSelectedNav(), ['fish', 'crops', 'minerals'], '勾选未保存');
  assert.equal(globalThis.location.hash, '#/home', '保存后未回首页');
  assert.equal(toastEl(), '已保存', '缺少保存提示');
  // 重启保持
  const raw = localStorage.getItem('sdv-guide:config');
  localStorage.clear();
  localStorage.setItem('sdv-guide:config', raw);
  Store.load();
  assert.deepEqual(Store.getSelectedNav(), ['fish', 'crops', 'minerals'], '重启后勾选丢失');
  globalThis.__setQSA([]);
});

test('M5-7 勾选超过 7 个：保存被拦截且 Store 不变', () => {
  Store.load();
  Store.setSelectedNav(['fish']);
  const over = CONFIG.modules.slice(0, 8).map((m) => navCb(m.key, true));
  globalThis.__setQSA(over);
  __fireDoc('click', {
    target: clickTarget({ '[data-action]': { dataset: { action: 'nav-save' } } }),
  });
  assert.equal(toastEl(), '最多选择 7 个功能', '未提示上限');
  assert.deepEqual(Store.getSelectedNav(), ['fish'], '超限勾选被错误保存');
  globalThis.__setQSA([]);
});

test('M5-8 恢复默认：selected 回默认 4 项', () => {
  Store.load();
  Store.setSelectedNav(['fish']);
  __fireDoc('click', {
    target: clickTarget({ '[data-action]': { dataset: { action: 'nav-reset' } } }),
  });
  assert.deepEqual(Store.getSelectedNav(), ['villagers', 'calendar', 'calculator', 'filter']);
  assert.equal(toastEl(), '已恢复默认');
});

test('M5-9 搜索输入：命中渲染、未命中空态、空查询空态', () => {
  Store.load();
  __fireDoc('input', { target: { id: 'search-input', value: '村民' } });
  const box = els.get('#search-result');
  assert.ok(box.innerHTML.includes('村民'), '命中未渲染');
  assert.ok(box.innerHTML.includes('data-route="#/module/villagers"'), '命中结果缺路由');

  __fireDoc('input', { target: { id: 'search-input', value: '不存在的词条xyz' } });
  assert.ok(box.innerHTML.includes('未找到相关词条'), '未命中未提示');

  __fireDoc('input', { target: { id: 'search-input', value: '' } });
  assert.ok(box.innerHTML.includes('来搜索感兴趣的内容吧～'), '空查询未回空态');
});

test('M5-10 检查更新按钮：当前版本缺失 Updater 时安全空操作', () => {
  assert.doesNotThrow(() => {
    __fireDoc('click', {
      target: clickTarget({ '[data-action]': { dataset: { action: 'check-update' } } }),
    });
  });
});
