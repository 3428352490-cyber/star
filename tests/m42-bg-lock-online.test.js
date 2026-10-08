'use strict';
/* M42 阶段测试：v2.5.1 修复背景锁定线上失效——
   ① readLock/writeLock 不再受 isLocal（仅 localhost）限制：开发者登录后本地与线上 GitHub Pages 均生效；
   ② 访客态忽略锁定的安全语义保留（isDevAvailable 检查仍在）；
   ③ 背景自动切换/素材/样式逻辑不受影响（background.js 仅放宽锁定生效条件）。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readAppFile } = require('./helpers/harness.js');

test('M42-1 背景锁定不再受 isLocal 限制（线上开发者登录后可锁定）', () => {
  const src = readAppFile('js/background.js');
  assert.ok(!src.includes('if (!BG.isLocal) return null;'), 'readLock 仍受 isLocal 限制（线上锁定失效根因）');
  assert.ok(!src.includes('if (!BG.isLocal) return;'), 'writeLock 仍受 isLocal 限制');
  assert.ok(src.includes('function readLock()') && src.includes('function writeLock(lock)'), '锁定读写函数缺失');
});

test('M42-2 访客态忽略锁定语义保留（isDevAvailable 检查仍在）', () => {
  const src = readAppFile('js/background.js');
  assert.ok(src.includes('if (!isDevAvailable()) return null;'), 'readLock 缺少访客态忽略（安全语义丢失）');
  assert.ok(src.includes('if (!isDevAvailable()) return;'), 'writeLock 缺少访客态禁止写入');
});

test('M42-3 背景自动切换逻辑不受影响（季节/时段判定与素材不变）', () => {
  const src = readAppFile('js/background.js');
  assert.ok(src.includes('function seasonOf('), '季节判定缺失');
  assert.ok(src.includes('function periodOf('), '时段判定缺失');
  assert.ok(src.includes('assets/bg/'), '背景素材路径缺失');
  assert.ok(src.includes('BG.checkIntervalMs'), '定时检测逻辑缺失');
});
