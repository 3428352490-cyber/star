'use strict';
/* M23 阶段测试：v2.4.3+ 更新弹窗修复——
   点击【立即更新】不再整页跳转（旧实现被旧缓存拦截、错误返回首页），
   改为：进度条弹窗实时展示拉取进度 → 全部完成后弹出【更新完成】确认弹窗；
   【暂不更新】逻辑保持不变（仅关闭弹窗，下次仍自动检测弹窗）。 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function readAppFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('M23-1 立即更新不再整页跳转：点击后进入拉取新版资源流程（进度条 + 完成弹窗）', () => {
  const js = readAppFile('js/update.js');
  assert.ok(!js.includes('location.href = remote.downloadUrl'), '立即更新不应再整页跳转（旧实现错误返回首页）');
  assert.ok(js.includes('performUpdate(remote)'), '立即更新按钮应触发拉取新版资源流程');
  assert.ok(js.includes('async function performUpdate'), '缺少拉取新版资源异步流程');
});

test('M23-2 拉取进度弹窗：实时进度条 + 计数文字', () => {
  const js = readAppFile('js/update.js');
  assert.ok(js.includes('正在更新'), '缺少进度弹窗标题');
  assert.ok(js.includes('upd-progress-bar'), '缺少进度条元素');
  assert.ok(js.includes('upd-progress-text'), '缺少进度计数文字');
  assert.ok(js.includes("cache: 'reload'"), '预取应绕过 HTTP 缓存强拉最新');
  assert.ok(js.includes('caches.open'), '缺少写入新版缓存逻辑');
  const css = readAppFile('css/components.css');
  assert.ok(css.includes('.upd-progress-bar'), '缺少进度条像素样式');
});

test('M23-3 拉取完成弹窗：更新完成 + 自动刷新页面（v2.4.25 起无需手动刷新）', () => {
  const js = readAppFile('js/update.js');
  assert.ok(js.includes('更新完成'), '缺少【更新完成】提示弹窗');
  assert.ok(js.includes("label: '刷新页面'"), '完成弹窗缺少刷新按钮');
  assert.ok(js.includes('页面即将自动刷新，加载最新内容…'), '完成弹窗缺少自动刷新提示');
  assert.ok(js.includes('schedulePageReload()'), '缺少自动刷新调度');
});

test('M23-4 暂不更新逻辑保持不变：仅关闭弹窗，不获取内容，下次仍自动检测', () => {
  const js = readAppFile('js/update.js');
  assert.ok(js.includes('不下载任何新版资源'), '暂不更新不应拉取任何资源');
  assert.ok(js.includes('不保存忽略标记'), '暂不更新不应写入忽略标记');
  assert.ok(js.includes('下次打开页面依然会自动检测并弹窗'), '暂不更新后下次仍应自动弹窗');
});

test('M23-5 核心资源清单与 sw.js 同步维护', () => {
  const js = readAppFile('js/update.js');
  for (const f of ['./index.html', './version.json', './css/layout.css', './js/app.js', './manifest.webmanifest']) {
    assert.ok(js.includes("'" + f + "'"), 'update.js 资源清单缺少 ' + f);
  }
});
