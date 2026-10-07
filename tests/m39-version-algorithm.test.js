'use strict';
/* M39 阶段测试：版本号按算法更新（真实执行校验）——
   核查「检查更新」版号是否按算法（语义化分段数字比较）更新，而非硬编码/字符串比较。
   直接调用 Updater 导出的 parseVersion / compareVersion / getUpdateTypeInfo / extractVersion
   做真实计算，覆盖两位修订号、跨位升级、v 前缀、缺段、异常输入等边界；
   并校验本地版本基准（config.js）与发布版本文件（sw.js / version.json / notice.json）同步一致。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();
const Updater = ref('Updater');
const SDV_CONFIG = ref('SDV_CONFIG');

test('M39-1 版本解析按算法（parseVersion）：v 前缀 / 缺段补 0 / 非法回退', () => {
  assert.deepEqual(Updater.parseVersion('2.4.25'), [2, 4, 25]);
  assert.deepEqual(Updater.parseVersion('v2.4.9'), [2, 4, 9], 'v 前缀应被剥离');
  assert.deepEqual(Updater.parseVersion('1.0'), [1, 0, 0], '缺段应补 0');
  assert.deepEqual(Updater.parseVersion('3'), [3, 0, 0], '单段应补位');
  assert.deepEqual(Updater.parseVersion('abc'), [0, 0, 0], '非法输入应回退 0');
  assert.deepEqual(Updater.parseVersion('2.4.25.1'), [2, 4, 25, 1], '四段版本保留');
});

test('M39-2 版本比对按算法（compareVersion）：两位修订号 / 跨位 / 相等 / 回退', () => {
  assert.equal(Updater.compareVersion('2.4.24', '2.4.25'), 1, '修订号更高 → 云端更高');
  assert.equal(Updater.compareVersion('2.4.9', '2.4.10'), 1, '两位修订号 9→10 应为云端更高');
  assert.equal(Updater.compareVersion('2.4.25', '2.5.0'), 1, '次版本跨位 → 云端更高');
  assert.equal(Updater.compareVersion('2.4.25', '2.4.24'), -1, '本地更高 → -1');
  assert.equal(Updater.compareVersion('2.4.25', '2.4.25'), 0, '相同 → 0');
  assert.equal(Updater.compareVersion('2.4.25', 'v2.4.25'), 0, 'v 前缀等价');
  assert.equal(Updater.compareVersion('1.0', '1.0.0'), 0, '缺段补位后相等');
  assert.equal(Updater.compareVersion('0.0.0', '2.4.25'), 1, '异常本地版本不误判最新');
});

test('M39-3 更新类型按算法识别（getUpdateTypeInfo）：patch / minor / major / null', () => {
  assert.equal(Updater.getUpdateTypeInfo('2.4.25', '2.4.24').type, 'patch');
  assert.equal(Updater.getUpdateTypeInfo('2.4.25', '2.4.25').type, null, '版本相同无更新');
  assert.equal(Updater.getUpdateTypeInfo('2.5.0', '2.4.24').type, 'minor');
  assert.equal(Updater.getUpdateTypeInfo('3.0.0', '2.4.24').type, 'major');
  assert.equal(Updater.getUpdateTypeInfo('2.4.10', '2.4.9').type, 'patch', '两位修订号仍识别为补丁');
  assert.equal(Updater.getUpdateTypeInfo('2.4.23', '2.4.24').type, null, '云端不更高无类型');
});

test('M39-4 云端版本提取（extractVersion）：latestVersion 优先 / version 回退 / 空兜底', () => {
  assert.equal(Updater.extractVersion({ latestVersion: '2.4.25' }), '2.4.25');
  assert.equal(Updater.extractVersion({ version: '2.4.24' }), '2.4.24', '无 latestVersion 时回退 version');
  assert.equal(Updater.extractVersion({ latestVersion: ' 2.4.25 ' }), '2.4.25', '应去除首尾空白');
  assert.equal(Updater.extractVersion(null), '', '空输入返回空串');
});

test('M39-5 版本基准按算法同步：config.js = sw.js = version.json = notice.json', () => {
  const cfgVersion = SDV_CONFIG.app.version;
  const cfg = readAppFile('js/config.js');
  const sw = readAppFile('sw.js');
  const verJson = JSON.parse(readAppFile('version.json'));
  const notice = JSON.parse(readAppFile('notice.json'));
  const swCache = sw.match(/CACHE_NAME = 'sdv-guide-(v[\d.]+)'/);
  assert.ok(swCache, 'sw.js 缺少 CACHE_NAME 版本');
  assert.equal(swCache[1].replace(/^v/, ''), cfgVersion, 'sw.js 缓存版本应与 config.js 一致');
  assert.equal(verJson.latestVersion, cfgVersion, 'version.json latestVersion 应与 config.js 一致');
  assert.equal(notice.version, cfgVersion, 'notice.json version 应与 config.js 一致');
  assert.ok(/version: 'v?[\d.]+'/.test(cfg), 'config.js 版本为算法化版本号');
});

test('M39-6 版本比对禁止字符串直接比较、禁止硬编码版本号', () => {
  const src = readAppFile('js/update.js');
  assert.ok(!src.includes("return localVer > remoteVer"), '不应使用字符串直接比较');
  assert.ok(!src.includes("localVer < remoteVer"), '不应使用字符串直接比较');
  assert.ok(!src.includes("localeCompare"), '不应使用 localeCompare');
  assert.ok(src.includes('const LOCAL_VERSION = (() => {'), '本地版本基准来自常量统一管理');
  assert.ok(src.includes('SDV_CONFIG.app.version'), '本地版本基准来自 config.js');
});
