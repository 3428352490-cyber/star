'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert');
const { loadApp, ref, readAppFile, fakeEl } = require('./helpers/harness');

// harness 在 vm 全局执行脚本，顶层 const 不可重复声明：整个文件只 loadApp 一次
before(() => { loadApp(); });

test('M12 快捷键上限提示：新增判断逻辑与弹窗组件，原有快捷键编辑代码完整保留', () => {
  const app = readAppFile('js/app.js');
  // 原有功能/事件代码未删改
  assert.ok(app.includes('function saveQuickNav()'), '保存快捷键流程被破坏');
  assert.ok(app.includes('function enforceNavLimit()'), '上限禁用逻辑被破坏');
  assert.ok(app.includes('function updateNavCounter()'), '已选计数逻辑被破坏');
  assert.ok(app.includes("checked.length > SDV_CONFIG.quickNav.maxSelected"), '保存时超限兜底被破坏');
  // 新增：上限提示判断 + 弹窗组件（复用全局 Modal）
  assert.ok(app.includes('快捷键数量已达到上限，无法继续添加更多快捷键'), '缺少上限提示文案');
  assert.ok(app.includes("Modal.show({"), '未复用全局 Modal 弹窗');
  assert.ok(app.includes("t.closest('.check-item')"), '缺少点击命中检查');
  assert.ok(app.includes("navCheck.disabled && !navCheck.checked"), '缺少「已达上限且未勾选」判断');
  assert.ok(app.includes("label: '确定'"), '弹窗缺少唯一「确定」按钮');
});

test('M12 快捷键上限提示：未满上限时点击新增 → 正常流程，不弹出提示', () => {
  const modalRoot = ref('document').getElementById('modal-root');
  const cb = fakeEl('cb');
  cb.disabled = false; cb.checked = false;
  const item = {
    closest: (sel) => (sel === '.check-item' ? item : null),
    querySelector: (sel) => (sel === 'input[data-nav-check]' ? cb : null),
  };
  ref('__fireDoc')('click', { target: item });
  assert.strictEqual(modalRoot.innerHTML, '', '未达上限不应弹出提示弹窗');
});

test('M12 快捷键上限提示：已达上限点击未勾选项 → 弹出提示弹窗（标题/正文/确定按钮），不新增', () => {
  const modalRoot = ref('document').getElementById('modal-root');
  const cb = fakeEl('cb');
  cb.disabled = true; cb.checked = false;   // 已达上限被禁用的未勾选项
  const item = {
    closest: (sel) => (sel === '.check-item' ? item : null),
    querySelector: (sel) => (sel === 'input[data-nav-check]' ? cb : null),
  };
  ref('__fireDoc')('click', { target: item });
  const html = modalRoot.innerHTML;
  assert.ok(html.includes('提示'), '弹窗缺少标题「提示」');
  assert.ok(html.includes('快捷键数量已达到上限，无法继续添加更多快捷键'), '弹窗缺少上限提示正文');
  assert.ok(html.includes('modal-title') && html.includes('modal-body') && html.includes('modal-actions'), '弹窗未复用全局 Modal 结构');
  assert.ok(html.includes('确定'), '弹窗缺少「确定」按钮');
  // 点击未勾选项不产生勾选（checkbox 保持未选 = 未新增）
  assert.strictEqual(cb.checked, false, '上限时点击不应改变勾选状态');
});

test('M12 快捷键上限提示：点击「确定」关闭弹窗', () => {
  const modalRoot = ref('document').getElementById('modal-root');
  const cb = fakeEl('cb');
  cb.disabled = true; cb.checked = false;
  const item = {
    closest: (sel) => (sel === '.check-item' ? item : null),
    querySelector: (sel) => (sel === 'input[data-nav-check]' ? cb : null),
  };
  ref('__fireDoc')('click', { target: item });
  assert.ok(modalRoot.innerHTML.includes('确定'), '前置：弹窗未打开');

  const mask = modalRoot.querySelector('.modal-mask');
  const okBtn = {
    closest: (sel) => (sel === '[data-modal-action]' ? okBtn : null),
    dataset: { modalAction: '0' },
  };
  ref('fire')(mask, 'click', { target: okBtn });
  assert.strictEqual(modalRoot.innerHTML, '', '点击「确定」后弹窗应关闭');
});

test('M12 快捷键上限提示：弹窗复用全局星露谷像素对话框样式，深浅主题可适配', () => {
  const ui = readAppFile('js/ui.js');
  const comp = readAppFile('css/components.css');
  const base = readAppFile('css/base.css');
  // 弹窗结构复用全局 Modal 组件（与其他交互弹窗同一渲染路径）
  assert.ok(ui.includes('modal-mask') && ui.includes('modal-title') && ui.includes('modal-actions'), 'Modal 组件结构不完整');
  // 样式由主题变量驱动：弹窗面板使用对话框变量
  assert.ok(comp.includes('.modal {') && comp.includes('var(--dialog-bg)'), '弹窗未使用全局对话框底色变量');
  assert.ok(comp.includes('var(--dialog-text)'), '弹窗未使用对话框文字色变量');
  // 深浅主题两套对话框变量 → 弹窗自动适配
  const darkStart = base.indexOf('[data-theme="dark"]');
  assert.ok(darkStart > 0, '缺少深色主题块');
  const darkBlock = base.slice(darkStart);
  assert.ok(darkBlock.includes('--dialog-bg:') && darkBlock.includes('--dialog-border:'), '深色主题缺少对话框面板变量');
});
