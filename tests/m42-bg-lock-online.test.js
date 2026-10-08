'use strict';
/* M42 阶段测试：v2.5.1 曾修复背景锁定线上失效（readLock/writeLock 放宽 isLocal 限制）；
   v2.5.6 按用户要求彻底删除「背景锁定」板块与背景同步上传，本文件同步更新为移除语义：
   ① readLock/writeLock/isDevAvailable 已随背景锁定整体删除（不再有锁定读写）；
   ② 背景自动切换/素材/样式逻辑不受影响（seasonOf/periodOf/素材路径/定时检测完整保留）。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readAppFile } = require('./helpers/harness.js');

test('M42-1 背景锁定读写函数已随 v2.5.6 整体移除（无 isLocal 限制/访客态门控残留）', () => {
  const src = readAppFile('js/background.js');
  assert.ok(!src.includes('function readLock()'), 'readLock 未移除');
  assert.ok(!src.includes('function writeLock(lock)'), 'writeLock 未移除');
  assert.ok(!src.includes('isDevAvailable'), 'isDevAvailable 访客态门控未移除');
  assert.ok(!src.includes('lockKey'), 'lockKey 未移除');
});

test('M42-2 背景自动切换逻辑完整保留（季节/时段判定与素材不变）', () => {
  const src = readAppFile('js/background.js');
  assert.ok(src.includes('function seasonOf('), '季节判定缺失');
  assert.ok(src.includes('function periodOf('), '时段判定缺失');
  assert.ok(src.includes('assets/bg/'), '背景素材路径缺失');
  assert.ok(src.includes('BG.checkIntervalMs'), '定时检测逻辑缺失');
  assert.ok(src.includes('function check()'), '检测函数缺失');
  assert.ok(src.includes('visibilitychange'), '切回前台刷新逻辑缺失');
});
