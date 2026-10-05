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

test('M14 版本更新提醒：版本检测 JS 逻辑完整（时间戳防缓存、localStorage/sessionStorage、立即/暂不更新）', () => {
  const js = readAppFile('js/update-notice.js');
  assert.ok(js.includes("'sdv-guide:installed-version'"), '缺少本地已安装版本键（localStorage）');
  assert.ok(js.includes("'sdv-guide:update-skip'"), '缺少会话跳过标记键（sessionStorage）');
  assert.ok(js.includes('?t='), '缺少时间戳参数绕过浏览器缓存');
  assert.ok(js.includes('cache: \'no-store\''), '缺少禁用缓存请求');
  assert.ok(js.includes('location.reload()'), '缺少立即更新刷新逻辑');
  assert.ok(js.includes('sessionStorage.setItem(SKIP_KEY'), '缺少暂不更新会话跳过逻辑');
  assert.ok(js.includes('首次使用'), '缺少首次使用不弹窗逻辑');
  assert.ok(js.includes('不弹窗、不刷新'), '缺少线上等于本地时不弹窗逻辑');
  assert.ok(js.includes('立即更新') && js.includes('暂不更新'), '弹窗缺少主次按钮');
});

test('M14 版本更新提醒：弹窗为独立遮罩+白色圆角卡片，移动端适配，不影响项目 UI', () => {
  const js = readAppFile('js/update-notice.js');
  assert.ok(js.includes('upd-mask'), '缺少全屏遮罩');
  assert.ok(js.includes('rgba(0,0,0,.55)'), '遮罩非半透明黑色');
  assert.ok(js.includes('upd-card') && js.includes('border-radius:14px') && js.includes('background:#fff'), '缺少居中白色圆角卡片');
  assert.ok(js.includes('max-width:360px'), '卡片未做移动端宽度适配');
  assert.ok(js.includes('upd-primary') && js.includes('upd-secondary'), '缺少主次按钮样式');
  assert.ok(js.includes('z-index:9999'), '遮罩层级不足');
  // 独立 class，不复用/不污染项目原有样式
  assert.ok(!js.includes('.modal-mask'), '不得复用项目原有弹窗结构');
});

test('M14 版本更新提醒：index.html 在 </body> 前引入版本检测 JS', () => {
  const html = readAppFile('index.html');
  const bodyEnd = html.lastIndexOf('</body>');
  const scriptPos = html.indexOf('update-notice.js');
  assert.ok(scriptPos >= 0 && scriptPos < bodyEnd, '版本检测 JS 未放在 </body> 之前');
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
