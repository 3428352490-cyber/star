'use strict';
/* M24 阶段测试：v2.4.3+ 【检查更新】触发逻辑——
   ① 版本一致（已是最新）时弹出独立提示弹窗（确认按钮关闭），不再仅 Toast；
   ② 修复进度弹窗时序：立即更新 onClick 延迟一帧启动拉取流程，
      避免进度弹窗刚渲染就被 Modal 按钮 close() 清掉。 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function readAppFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('M24-1 版本一致：弹出独立提示弹窗「已是最新版本」+ 确认按钮', () => {
  const js = readAppFile('js/update.js');
  assert.ok(js.includes('已是最新版本'), '版本一致缺少「已是最新版本」弹窗');
  assert.ok(js.includes('当前版本 v\''), '弹窗缺少当前版本号展示');
  assert.ok(js.includes("label: '确认'"), '提示弹窗缺少确认按钮');
  assert.ok(js.includes('当前已是最新版本 v\''), 'checkUpdate 返回 notice 应保留');
});

test('M24-2 版本一致弹窗不影响云端更高分支：更新弹窗（暂不更新/立即更新）逻辑保留', () => {
  const js = readAppFile('js/update.js');
  assert.ok(js.includes("label: '暂不更新'"), '更新弹窗缺少暂不更新按钮');
  assert.ok(js.includes("label: '立即更新'"), '更新弹窗缺少立即更新按钮');
  assert.ok(js.includes('showUpdateModal(remote, LOCAL_VERSION)'), '云端更高分支应继续弹出更新弹窗');
});

test('M24-3 进度弹窗时序修复：立即更新延迟一帧启动拉取流程（不被 Modal close 秒杀）', () => {
  const js = readAppFile('js/update.js');
  assert.ok(js.includes('setTimeout(() => { performUpdate(remote); }, 0)'), '立即更新缺少延迟一帧启动拉取流程');
  assert.ok(js.includes('async function performUpdate'), '缺少拉取新版资源异步流程');
});
