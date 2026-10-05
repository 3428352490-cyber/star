'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { readAppFile } = require('./helpers/harness');

test('M14 版本更新提醒：version.json 线上版本与 config.js 同步、notice.json 公告文件存在', () => {
  const ver = JSON.parse(readAppFile('version.json'));
  const cfg = readAppFile('js/config.js');
  const m = cfg.match(/version:\s*'(\d+\.\d+\.\d+)'/);
  assert.ok(m, 'config.js 缺少 app.version');
  assert.strictEqual(ver.version, m[1], 'version.json 应与 js/config.js 的 app.version 同步（Actions 自动递增后保持一致）');
  const notice = JSON.parse(readAppFile('notice.json'));
  assert.ok(notice.title && notice.title.length, '公告缺少标题');
  assert.ok(Array.isArray(notice.items) && notice.items.length > 0, '公告缺少更新内容');
});

test('M14 版本更新提醒：白色卡片弹窗 update-notice.js 已停用（index.html 不引用、文件已删除）', () => {
  const html = readAppFile('index.html');
  assert.ok(!html.includes('update-notice.js'), 'index.html 不应再引用 update-notice.js（统一使用像素弹窗）');
  // 文件已从仓库删除：readAppFile 应抛错
  assert.throws(() => readAppFile('js/update-notice.js'), /ENOENT|no such file/i, 'js/update-notice.js 文件应已删除');
});

test('M14 版本更新提醒：版本提醒逻辑统一收敛到 update.js（存储键、会话跳过、立即更新、防缓存请求）', () => {
  const js = readAppFile('js/update.js');
  assert.ok(js.includes("'sdv-guide:installed-version'"), '缺少本地已安装版本键（localStorage）');
  assert.ok(js.includes("'sdv-guide:update-skip'"), '缺少会话跳过标记键（sessionStorage）');
  assert.ok(js.includes("cache: 'no-store'"), '缺少禁用缓存请求');
  assert.ok(js.includes('sessionSkipped()'), '缺少会话跳过判断（本次会话不再弹窗）');
  assert.ok(js.includes('location.reload()'), '缺少立即更新刷新逻辑');
});

test('M14 版本更新提醒：update.js 更新弹窗底部按钮改造（暂不更新纯文字 + 立即更新红按钮）', () => {
  const js = readAppFile('js/update.js');
  assert.ok(!js.includes('知道了'), '不应再保留【知道了】按钮');
  assert.ok(!js.includes('请稍后重新打开应用获取最新内容'), '未删除过期提示文案');
  assert.ok(js.includes("label: '暂不更新'"), '缺少【暂不更新】按钮');
  assert.ok(js.includes("label: '立即更新'"), '缺少【立即更新】按钮');
  assert.ok(js.includes("cls: 'btn-text'"), '暂不更新缺少纯文字样式类');
  assert.ok(js.includes("cls: 'btn-primary'"), '立即更新缺少像素红按钮样式类');
  assert.ok(js.includes('sessionStorage.setItem(SKIP_KEY'), '暂不更新缺少会话跳过逻辑（不改本地版本号）');
  assert.ok(js.includes('localStorage.setItem(STORAGE_KEY'), '立即更新缺少本地版本写入');
  assert.ok(js.includes('location.reload()'), '立即更新缺少页面刷新');
  assert.ok(js.includes('sessionSkipped()'), '缺少会话跳过判断（本次会话不再弹窗）');
  const css = readAppFile('css/components.css');
  assert.ok(css.includes('.modal-actions .btn-text'), '缺少 btn-text 纯文字灰色样式');
});

test('M14 版本更新提醒：GitHub Actions 工作流完整（main 推送触发、补丁递增、防死循环、自动提交）', () => {
  const wf = readAppFile('.github/workflows/bump-version.yml');
  assert.ok(wf.includes('name: Bump Version'), '工作流缺失');
  assert.ok(wf.includes('branches: [ main ]'), '未监听 main 分支推送');
  assert.ok(wf.includes('actions/checkout@v4'), '缺少 checkout');
  assert.ok(wf.includes('fetch-depth: 2'), '缺少深度 2 用于防循环对比');
  assert.ok(wf.includes('version.json|notice.json|js/config.js|sw.js'), '防死循环文件集合不完整');
  assert.ok(wf.includes('only_version_files'), '缺少防死循环判定');
  assert.ok(wf.includes('v[2] = (v[2] || 0) + 1'), '缺少补丁号 +1 递增');
  assert.ok(wf.includes('git commit') && wf.includes('git push origin main'), '缺少自动提交推送');
});
