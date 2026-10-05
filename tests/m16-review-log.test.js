'use strict';
/* M16 阶段测试：前端复盘日志系统 / 页面自检 / 轻量安全防护 / 定时轮询 / 发布规则 */
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();

const CONFIG = ref('SDV_CONFIG');
const ReviewLog = ref('ReviewLog');
const SelfCheck = ref('SelfCheck');
const SecurityGuard = ref('SecurityGuard');
const Updater = ref('Updater');

before(() => {
  ReviewLog.clearLogs();
});

// 每次用例前重置限流窗口与日志，保证用例间隔离
beforeEach(() => {
  if (SecurityGuard && SecurityGuard.resetLimits) SecurityGuard.resetLimits();
  ReviewLog.clearLogs();
});

test('M16-1 复盘日志：写入 localStorage page_review_logs，字段完整', () => {
  ReviewLog.clearLogs();
  const e = ReviewLog.log('page-init', { status: 'success', message: '页面初始化完成', extra: { version: 'x' } });
  assert.equal(e.eventType, 'page-init');
  assert.equal(e.status, 'success');
  assert.equal(e.message, '页面初始化完成');
  assert.ok(typeof e.timestamp === 'number' && e.timestamp > 0, '缺少时间戳');
  assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(e.timeStr), 'timeStr 应为可读时间');
  assert.equal(e.extra.version, 'x');
  const raw = JSON.parse(localStorage.getItem('page_review_logs'));
  assert.ok(Array.isArray(raw) && raw.length >= 1, '日志未持久化到 localStorage');
  // 失败状态
  const f = ReviewLog.log('version-fetch', { status: 'fail', message: '超时' });
  assert.equal(f.status, 'fail');
});

test('M16-2 日志清理：超 100 条删最旧；超过 7 天自动删除', () => {
  ReviewLog.clearLogs();
  // 写入 105 条 → 只保留 100 条（最旧 5 条被删）
  for (let i = 0; i < 105; i++) ReviewLog.log('page-init', { status: 'success', message: 'i' + i });
  let list = ReviewLog.readAll();
  assert.equal(list.length, 100, '超过 100 条应删除最旧日志');
  assert.ok(!list.some((x) => x.message === 'i0'), '最旧日志应被删除');
  assert.ok(list[0].message === 'i5', '保留的应是最新 100 条');

  // 超过 7 天的日志自动删除（构造 8 天前的旧日志）
  ReviewLog.clearLogs();
  const old = { timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, timeStr: 'old', eventType: 'page-init', status: 'success', message: 'old-entry' };
  const fresh = { timestamp: Date.now(), timeStr: 'fresh', eventType: 'page-init', status: 'success', message: 'fresh-entry' };
  localStorage.setItem('page_review_logs', JSON.stringify([old, fresh]));
  ReviewLog.log('page-init', { status: 'success', message: 'trigger' });
  list = ReviewLog.readAll();
  assert.ok(!list.some((x) => x.message === 'old-entry'), '超过 7 天的日志应被自动删除');
  assert.ok(list.some((x) => x.message === 'fresh-entry'), '7 天内的日志应保留');
});

test('M16-3 控制台函数：showLogs / clearLogs 挂载且可用', () => {
  ReviewLog.clearLogs();
  assert.equal(typeof globalThis.window.showLogs, 'function', 'window.showLogs 缺失');
  assert.equal(typeof globalThis.window.clearLogs, 'function', 'window.clearLogs 缺失');
  ReviewLog.log('page-init', { status: 'success', message: 'x' });
  const shown = ReviewLog.showLogs();
  assert.ok(Array.isArray(shown) && shown.length >= 1, 'showLogs 应返回日志列表');
  ReviewLog.clearLogs();
  assert.equal(ReviewLog.readAll().length, 0, 'clearLogs 后应清空');
});

test('M16-4 页面自检：关键依赖齐全时通过，异常仅控制台并写日志', () => {
  const r = SelfCheck.run();
  assert.equal(r.ok, true, '自检应通过，errors: ' + JSON.stringify(r.errors));
  const logs = ReviewLog.readAll();
  assert.ok(logs.some((x) => x.eventType === 'self-check' && x.status === 'success'), '自检结果应写入日志');
});

test('M16-5 安全防护：爬虫 UA 识别 + 请求限流', () => {
  assert.equal(SecurityGuard.isCrawler('Mozilla/5.0 Chrome/120'), false, '正常 UA 不应判定为爬虫');
  assert.equal(SecurityGuard.isCrawler('Googlebot/2.1'), true, '应识别 Googlebot');
  assert.equal(SecurityGuard.isCrawler('python-requests/2.31'), true, '应识别 python 爬虫');
  assert.equal(SecurityGuard.isCrawler('curl/8.0'), true, '应识别 curl');
  // 限流：5 秒窗口最多 3 次，第 4 次拒绝
  assert.equal(SecurityGuard.allowRequest('test-key'), true);
  assert.equal(SecurityGuard.allowRequest('test-key'), true);
  assert.equal(SecurityGuard.allowRequest('test-key'), true);
  assert.equal(SecurityGuard.allowRequest('test-key'), false, '第 4 次应被限流');
  assert.equal(SecurityGuard.allowRequest('other-key'), true, '不同类型请求互不影响');
});

test('M16-6 发布规则：工作流双轨版本（代码版本自动 bump、发布版本手动管理）+ 同步发版支持', () => {
  const wf = readAppFile('.github/workflows/bump-version.yml');
  // 代码版本自动递增（config.js + sw.js）
  assert.ok(wf.includes('js/config.js 的 app.version'), 'bump 应同步 config.js');
  assert.ok(wf.includes('sw.js 的 CACHE_NAME'), 'bump 应同步 sw.js');
  // 发布版本不动（工作流绝不自动改动）
  assert.ok(wf.includes('version.json / notice.json 保持不动'), 'bump 不应改动发布版本文件');
  assert.ok(!wf.includes('git add version.json'), '自动提交不应包含 version.json');
  // 双轨模式：只推业务代码 → 自动 bump 代码版本；后单独推 version.json 触发弹窗
  assert.ok(wf.includes('只推送业务代码'), '缺少发布顺序说明（先代码后发布版本）');
  assert.ok(wf.includes('再单独修改 version.json'), '缺少 version.json 单独发布说明');
  // 同步发版模式：手动改动发布版本文件 → 跳过自动 bump，两轨保持一致
  assert.ok(wf.includes('release_changed'), '缺少发布版本文件改动检测（同步发版支持）');
  assert.ok(wf.includes('同步发版'), '缺少同步发版模式说明');
  assert.ok(wf.includes("steps.detect.outputs.release_changed == 'false'"), 'bump 条件未排除同步发版提交');
  // 两对独立校验 + 公告同步发布校验
  assert.ok(wf.includes('代码版本') && wf.includes('发布版本'), '缺少两轨版本校验');
  assert.ok(wf.includes('发布版本不匹配'), '缺少公告/发布版本一致性校验');
  assert.ok(wf.includes('每次更新版本必须同步发布版本更新公告'), '缺少「每次发版必须同步发布公告」校验');
  assert.ok(wf.includes('announcements[0]'), '缺少公告页最新条目校验');
});

test('M16-7 版本检测日志埋点：请求/对比/异常/弹窗开关事件写入复盘日志', async () => {
  ReviewLog.clearLogs();
  // fetch 异常（harness 默认 fetch 抛错）→ version-fetch fail 日志
  const r = await Updater.checkUpdate(false);
  assert.equal(r.updated, false);
  let logs = ReviewLog.readAll();
  assert.ok(logs.some((x) => x.eventType === 'version-fetch' && x.status === 'fail'), 'fetch 异常应写 fail 日志');
  assert.ok(logs.some((x) => x.eventType === 'version-fetch' && x.status === 'success'), '请求发起应写日志');

  // 云端更高 → 自动刷新（不弹窗）+ auto-refresh 日志；手动检测 → 弹窗 + modal-open 日志
  ReviewLog.clearLogs();
  globalThis.location.reloadCount = 0;
  globalThis.sessionStorage.clear();
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ latestVersion: '9.9.9', updateDesc: '测试', downloadUrl: './index.html' }),
  });
  const r2 = await Updater.checkUpdate(false);
  assert.equal(r2.updated, true);
  logs = ReviewLog.readAll();
  assert.ok(logs.some((x) => x.eventType === 'auto-refresh' && x.status === 'success'), '自动刷新应写日志');
  assert.ok(logs.some((x) => x.eventType === 'version-compare' && x.status === 'success'), '对比结果应写日志');
  assert.ok(logs.some((x) => x.eventType === 'version-compare' && x.extra && x.extra.cmp === 1), '对比日志应含 cmp=1');
  // 手动检测：弹窗打开写 modal-open 日志
  ReviewLog.clearLogs();
  const m = await Updater.checkUpdate(true);
  assert.equal(m.updated, true);
  logs = ReviewLog.readAll();
  assert.ok(logs.some((x) => x.eventType === 'modal-open' && x.status === 'success'), '手动弹窗打开应写日志');
  // 恢复 harness 默认 fetch
  globalThis.fetch = async () => { throw new Error('fetch 未在测试中 stub'); };
});

test('M16-8 轮询集成：pollCheck 轮询前执行自检、自动检测静默失败不崩', async () => {
  ReviewLog.clearLogs();
  globalThis.fetch = async () => { throw new Error('offline'); };
  await Updater.pollCheck(); // 静默失败，不抛异常
  const logs = ReviewLog.readAll();
  assert.ok(logs.some((x) => x.eventType === 'self-check'), '轮询前应执行自检');
  assert.ok(logs.some((x) => x.eventType === 'version-fetch' && x.status === 'fail'), '轮询失败应写日志');
  // 导出完整性
  assert.equal(typeof Updater.startPolling, 'function', '缺少 startPolling');
  assert.equal(typeof Updater.stopPolling, 'function', '缺少 stopPolling');
});

test('M16-9 update.js 原有规则完整保留：禁 mock、数字数组对比、变量渲染、弹窗双按钮', () => {
  const js = readAppFile('js/update.js');
  assert.ok(!js.includes('9.9.9'), '禁止写死版本号');
  assert.ok(js.includes("cache: 'no-store'"), '缺少防缓存');
  assert.ok(js.includes("'?t=' + ts") || js.includes("Date.now()"), '缺少时间戳防缓存');
  assert.ok(js.includes('parseVersion'), '缺少版本解析函数');
  assert.ok(js.includes('compareVersion'), '缺少版本对比函数');
  // sessionStorage 仅用于自动刷新防循环标记（H5 自动更新）；暂不更新不写任何存储
  assert.ok(js.includes("sessionStorage.getItem(AUTO_REFRESH_KEY)"), '自动刷新缺少会话标记防循环检测');
  assert.ok(js.includes('AUTO_REFRESH_KEY'), '缺少会话自动刷新标记定义');
  assert.ok(js.includes('不保存忽略标记'), '暂不更新不应写入任何忽略标记');
  assert.ok(js.includes("label: '暂不更新'") && js.includes("cls: 'btn-text'"), '缺少暂不更新纯文字按钮');
  assert.ok(js.includes("label: '立即更新'") && js.includes("cls: 'btn-primary'"), '缺少立即更新红按钮');
  assert.ok(js.includes('LOCAL_VERSION'), '缺少本地版本常量');
  assert.ok(js.includes('检测到新版本'), '弹窗缺少新版本号变量渲染');
  assert.ok(js.includes('getUpdateTypeInfo'), '缺少更新类型自动识别');
});
