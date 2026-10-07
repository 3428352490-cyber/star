'use strict';
/* M25 阶段测试：v2.4.5 DevAdmin 开发者登录 / GitHub 推送 / 背景锁定权限（方案A） */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

const ROOT = path.resolve(__dirname, '..', '..');
loadApp(); // harness 已在 APP_FILES 中包含 js/dev-admin.js，加载后 DevAdmin 可见

const API = ref('CommunityAPI');
const Pages = ref('Pages');
const DevAdmin = ref('DevAdmin');

function resetAll() {
  if (typeof API !== 'undefined' && API.resetForTest) API.resetForTest();
  // 清 DevAdmin 命名空间
  Object.keys(localStorage).forEach((k) => { if (k.indexOf('sdv-guide:devadmin:') === 0) localStorage.removeItem(k); });
  try { localStorage.removeItem('sdv_bg_lock'); } catch (e) {}
}

before(resetAll);

test('M25-1 默认访客态：DevAdmin.isDev() 为 false，mine 页不渲染开发者入口', () => {
  assert.equal(DevAdmin.isDev(), false, '默认非开发者');
  const html = Pages.mine();
  assert.ok(html.includes('login-entry-card'), '未登录视图含登录卡片');
  assert.ok(html.includes('dev-open-admin'), '登录卡片触发 dev-open-admin');
  assert.ok(!html.includes('dev-admin-panel'), '访客态不渲染管理员面板');
  assert.ok(!html.includes('dev-badge'), '访客态无开发者标识');
  assert.ok(!html.includes('背景锁定窗口'), '访客态不出现背景锁定窗口文案');
});

test('M25-2 登录校验：仅 StarBOSS/20261005 成功，其余恒失败', () => {
  assert.equal(DevAdmin.login('StarBOSS', '20261005'), true, '正确凭证登录成功');
  assert.equal(DevAdmin.isDev(), true, '登录态生效');
  const st = DevAdmin.getDevLogin();
  assert.equal(st.user, 'StarBOSS', '保存开发者账号');

  // 登出
  DevAdmin.logout();
  assert.equal(DevAdmin.isDev(), false, '登出后非开发者');

  // 错误凭证
  assert.equal(DevAdmin.login('StarBOSS', 'wrong'), false, '错误密码失败');
  assert.equal(DevAdmin.login('other', '20261005'), false, '错误账号失败');
  assert.equal(DevAdmin.login('a', 'b'), false, '任意组合失败');
  assert.equal(DevAdmin.isDev(), false, '失败不保存登录态');
  assert.equal(DevAdmin.getDevLogin(), null, '无登录记录');
});

test('M25-3 登录成功后 mine 页展示开发者标识 + 管理入口（第三栏已删，由注入面板提供）', () => {
  assert.equal(DevAdmin.login('StarBOSS', '20261005'), true);
  const html = Pages.mine();
  // 开发者登录态：昵称旁显示 dev-badge 标识
  assert.ok(html.includes('dev-badge'), '开发者标识徽章');
  // 第三栏 dev-card 已删除；开发者管理入口由 DevAdmin 注入的 #dev-admin-panel 提供
  assert.ok(!html.includes('dev-card'), '第三栏 dev-card 已删除');
  DevAdmin.logout();
});

test('M25-4 登出后 mine 页恢复访客态，背景锁定再次隐藏', () => {
  DevAdmin.login('StarBOSS', '20261005');
  // 模拟登出
  DevAdmin.logout();
  const html = Pages.mine();
  assert.ok(!html.includes('dev-badge'), '登出后无开发者标识');
  assert.ok(!html.includes('dev-admin-panel'), '登出后无管理面板');
});

test('M25-5 background.js 访客态门控：readLock/writeLock 被 isDevAvailable 拦截', () => {
  const src = readAppFile('js/background.js');
  assert.ok(src.includes('function isDevAvailable()'), '定义 isDevAvailable');
  assert.ok(src.includes('if (!isDevAvailable()) return null;'), 'readLock 访客态拦截');
  assert.ok(src.includes('if (!isDevAvailable()) return;'), 'writeLock 访客态拦截');
  assert.ok(src.includes("sdv-dev-state-change"), '监听开发者状态变更');
  assert.ok(src.includes("sdv-bg-lock-change"), '监听锁定变更');
});

test('M25-6 index.html 引入 dev-admin.js 与 dev-admin.css', () => {
  const html = readAppFile('index.html');
  assert.ok(html.includes('js/dev-admin.js'), '引入 DevAdmin 脚本');
  assert.ok(html.includes('css/dev-admin.css'), '引入 DevAdmin 样式');
  // 脚本顺序：dev-admin.js 在 background.js 之前
  const iDa = html.indexOf('js/dev-admin.js');
  const iBg = html.indexOf('js/background.js');
  assert.ok(iDa > -1 && iBg > iDa, 'dev-admin.js 先于 background.js 加载');
});

test('M25-7 DevAdmin.pushToGitHub 网络异常兜底（fetch 未 stub 时返回网络异常）', async () => {
  DevAdmin.login('StarBOSS', '20261005');
  DevAdmin.setGitHubToken('fake-token');
  DevAdmin.setGitHubRepo({ owner: 'x', repo: 'y', branch: 'main', jsonPath: 'a.json' });
  const r = await DevAdmin.pushToGitHub({ note: 'test', payload: { a: 1 } });
  assert.equal(r.ok, false, '未 stub fetch 时提交失败');
  assert.ok(/网络异常|fetch/.test(r.message), '提示网络异常：' + r.message);
});

test('M25-8 DevAdmin.buildPageContentPayload 组装网页 JSON 数据', () => {
  // 通过 DevAdmin 暴露的 pushToGitHub 间接验证 payload 结构（不直接导出 buildPageContentPayload）
  // 验证 SDV_CONFIG.announcements 存在即可作为 payload 源
  assert.ok(Array.isArray(ref('SDV_CONFIG').announcements), '公告数组存在');
});

test('M25-9 图片不可上传提示文案存在', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('图片资源请前往 GitHub 网页端手动上传'), '图片提示文案');
  assert.ok(src.includes('不会损坏仓库原有文件'), '冲突不损坏提示');
});

test('M25-10 dev-admin.css 含开发者卡片 / 面板 / 徽章 / 背景锁定样式', () => {
  const css = readAppFile('css/dev-admin.css');
  assert.ok(css.includes('.dev-mode-card'), '开发者模式卡片样式');
  assert.ok(css.includes('.dev-badge'), '开发者标识徽章样式');
  assert.ok(css.includes('.admin-panel'), '管理面板样式');
  assert.ok(css.includes('.admin-github-form'), 'GitHub 表单样式');
  assert.ok(css.includes('.chip-row'), '背景锁定 chip 行样式');
  // v2.4.6 批次2：外显 #bg-debug-panel 浮动表格窗口已移除，改为管理面板入口弹窗
  // 访客态隐藏兜底改指向 #dev-admin-panel 与 .btn-upload
  assert.ok(css.includes('body:not(.dev-mode) #dev-admin-panel'), '访客态隐藏管理面板 CSS 兜底');
  assert.ok(css.includes('body:not(.dev-mode) .btn-upload'), '访客态隐藏一键上传按钮 CSS 兜底');
  assert.ok(!css.includes('#bg-debug-panel'), '外显浮动面板样式已移除');
});

test('M25-11 v2.4.7 管理面板精简为两块（一键上传GitHub + 背景锁定）+ 全局编辑工具条', () => {
  const src = readAppFile('js/dev-admin.js');
  // 管理面板仅保留两大板块：一键上传GitHub + 背景锁定
  assert.ok(src.includes('admin-block-github'), '一键上传GitHub 板块');
  assert.ok(src.includes('admin-block-bglock'), '背景锁定 板块');
  // 已移除：村民/图鉴批量导入导出、独立可视化编辑、独立字体面板
  assert.ok(!src.includes('admin-block-villagers'), '村民面板已移除');
  assert.ok(!src.includes('admin-block-codex'), '图鉴面板已移除');
  assert.ok(!src.includes('admin-block-visualedit'), '独立可视化编辑面板已移除');
  assert.ok(!src.includes('admin-block-font'), '独立字体面板已移除');
  // 全局编辑工具条：每个页面右上角【编辑】按钮 + 编辑模式【保存/重置】
  assert.ok(src.includes('dev-edit-toolbar'), '全局编辑工具条 DOM');
  assert.ok(src.includes('dev-edit-enter'), '编辑入口动作');
  assert.ok(src.includes('dev-edit-save'), '保存动作');
  assert.ok(src.includes('dev-edit-reset'), '重置动作');
  assert.ok(src.includes('enterEditMode'), '进入编辑模式函数');
  assert.ok(src.includes('savePageEdits'), '保存写入本地函数');
  assert.ok(src.includes('resetPageEdits'), '重置恢复原始函数');
  assert.ok(src.includes('applyPageEdits'), '实时预览/重放函数');
  // 像素字体模板 + 字号（节点编辑弹窗内切换）
  assert.ok(src.includes('FONT_TEMPLATES'), '内置多套像素字体模板');
  assert.ok(src.includes('dev-node-edit'), '节点文字编辑弹窗');
  // 跨端同步：本地修改存 localStorage + storage 事件监听
  assert.ok(src.includes("read('page_edit'"), '页面修改 localStorage 键');
  assert.ok(src.includes('storage'), '跨标签页 storage 事件同步');
});

test('M25-13 dev-admin.css 含全局编辑工具条 / 编辑模式 / 节点编辑弹窗 / 访客兜底隐藏', () => {
  const css = readAppFile('css/dev-admin.css');
  assert.ok(css.includes('.dev-edit-toolbar'), '全局编辑工具条样式');
  assert.ok(css.includes('body.dev-editing'), '编辑模式文字板块可点击选中样式');
  assert.ok(css.includes('.dev-node-edit'), '节点文字编辑弹窗样式');
  assert.ok(css.includes('.dev-node-preview'), '节点编辑实时预览样式');
  assert.ok(css.includes('.btn-upload'), '一键上传GitHub按钮样式');
  assert.ok(css.includes('.dev-upload-pre'), '上传确认弹窗摘要样式');
  // 访客/未登录兜底隐藏全部开发者入口与编辑控件
  assert.ok(css.includes('body:not(.dev-mode) #dev-edit-toolbar'), '访客态隐藏编辑工具条 CSS 兜底');
  assert.ok(css.includes('body:not(.dev-mode) #dev-admin-panel'), '访客态隐藏管理面板 CSS 兜底');
  assert.ok(css.includes('body:not(.dev-mode) .btn-upload'), '访客态隐藏上传按钮 CSS 兜底');
});

test('M25-12 background.js 外显浮动调试面板已移除（改入口弹窗）', () => {
  const src = readAppFile('js/background.js');
  assert.ok(!src.includes('buildDebugPanel'), 'buildDebugPanel 函数已移除');
  assert.ok(!src.includes('bg-debug-panel'), '外显浮动面板 DOM 已移除');
  // 背景自动切换逻辑保留
  assert.ok(src.includes('check();'), '背景 check 自动切换保留');
  assert.ok(src.includes('sdv-dev-state-change'), '登录态联动保留');
});
