'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { readAppFile } = require('./helpers/harness');

test('M14 版本更新提醒：version.json 发布版本字段完整、notice.json 公告文件存在（双轨规则：发布版本与代码版本独立）', () => {
  const ver = JSON.parse(readAppFile('version.json'));
  const cfg = readAppFile('js/config.js');
  const m = cfg.match(/version:\s*'(\d+\.\d+\.\d+)'/);
  assert.ok(m, 'config.js 缺少 app.version');
  // 双轨发布规则：version.json 为「发布版本」，由开发者单独推送，不再强制与代码版本同步
  assert.ok(/^\d+\.\d+\.\d+$/.test(ver.latestVersion), 'version.json latestVersion 应为合法语义化版本（双轨规则下允许与 config.js 代码版本不同步）');
  assert.ok(ver.updateDesc && ver.updateDesc.length, 'version.json 缺少 updateDesc 更新简介');
  assert.ok(ver.downloadUrl && ver.downloadUrl.length, 'version.json 缺少 downloadUrl 下载地址');
  const notice = JSON.parse(readAppFile('notice.json'));
  assert.ok(notice.title && notice.title.length, '公告缺少标题');
  assert.ok(Array.isArray(notice.items) && notice.items.length > 0, '公告缺少更新内容');
  assert.strictEqual(notice.version, ver.latestVersion, 'notice.json 的 version 字段必须与 version.json 完全一致（发布版本内部保持同步，公告与发布版本一起打包）');
});

test('M14 版本更新提醒：白色卡片弹窗 update-notice.js 已停用（index.html 不引用、文件已删除）', () => {
  const html = readAppFile('index.html');
  assert.ok(!html.includes('update-notice.js'), 'index.html 不应再引用 update-notice.js（统一使用像素弹窗）');
  // 文件已从仓库删除：readAppFile 应抛错
  assert.throws(() => readAppFile('js/update-notice.js'), /ENOENT|no such file/i, 'js/update-notice.js 文件应已删除');
});

test('M14 版本更新提醒：update.js 自动检测 + 手动入口共用一套逻辑（fetch 真实 version.json、LOCAL_VERSION、类型识别、禁止 Mock）', () => {
  const js = readAppFile('js/update.js');
  assert.ok(js.includes("'sdv-guide:installed-version'"), '缺少已确认版本记录键（localStorage，仅立即更新写入）');
  assert.ok(!js.includes('update-skip'), '不应有永久/会话屏蔽版本标记（暂不更新仅关闭本次弹窗）');
  assert.ok(!js.includes('USE_MOCK') && !js.includes('MOCK_VERSION'), '禁止 Mock 硬编码版本（一律 fetch 真实 version.json）');
  assert.ok(!js.includes('9.9.9'), '禁止写死 v9.9.9 等固定版本文本');
  assert.ok(js.includes('SDV_CONFIG.app.version'), '本地版本应读取 config.js 固定版本号（绝不自动修改）');
  assert.ok(js.includes('const LOCAL_VERSION'), '缺少本地版本常量 LOCAL_VERSION（统一管理本地版本号）');
  assert.ok(js.includes('compareVersion(LOCAL_VERSION, remote.latestVersion)'), '缺少本地/云端版本分段数字比较调用（参数序 localVer, remoteVer）');
  assert.ok(js.includes('latestVersion'), '缺少云端版本字段 latestVersion 读取');
  assert.ok(js.includes('updateDesc'), '缺少云端更新简介字段 updateDesc 读取');
  assert.ok(js.includes('downloadUrl'), '缺少云端下载地址字段 downloadUrl 读取');
  assert.ok(js.includes('getUpdateTypeInfo'), '缺少更新类型自动识别函数 getUpdateTypeInfo');
  assert.ok(js.includes('parseVersion'), '缺少版本解析函数 parseVersion（v1.0.10 → 数字数组）');
  assert.ok(js.includes('cmp > 0'), '缺少「云端 > 本地固定版本才弹窗」触发规则');
  assert.ok(js.includes('当前已是最新版本 v\''), '版本一致缺少「当前已是最新版本」提示（手动入口）');
  assert.ok(js.includes('manual'), '缺少自动/手动模式区分参数');
  assert.ok(js.includes('版本检查失败，请稍后重试'), '手动入口网络失败缺少提示');
  assert.ok(js.includes('静默处理，不弹出任何提示'), '自动检测网络失败缺少静默处理');
  assert.ok(js.includes('下次打开页面依然会自动检测并弹窗'), '暂不更新缺少「不永久屏蔽、下次仍自动检测」语义');
  assert.ok(js.includes('cache: \'no-store\''), '缺少禁用缓存请求');
  assert.ok(js.includes("cloudVersionUrl + '?t=' + ts"), 'version.json 请求缺少 Date.now() 时间戳防缓存');
  assert.ok(js.includes('console.error'), '缺少异常控制台打印（页面不崩溃）');
  assert.ok(js.includes('location.href = remote.downloadUrl'), '缺少立即更新跳转下载地址刷新逻辑（用户手动选择后才加载新版本）');
  // 页面载入完成自动检测 + 【检查更新】备用手动入口：共用 checkUpdate
  const app = readAppFile('js/app.js');
  assert.ok(app.includes("Updater.checkUpdate(false)"), '页面载入完成缺少自动版本检测');
  assert.ok(app.includes("Updater.checkUpdate(true)"), '【检查更新】按钮缺少备用手动入口');
});

test('M14 版本更新提醒：update.js 更新弹窗底部按钮改造（暂不更新纯文字 + 立即更新红按钮）', () => {
  const js = readAppFile('js/update.js');
  assert.ok(!js.includes('知道了'), '不应再保留【知道了】按钮');
  assert.ok(!js.includes('请稍后重新打开应用获取最新内容'), '未删除过期提示文案');
  assert.ok(js.includes("label: '暂不更新'"), '缺少【暂不更新】按钮');
  assert.ok(js.includes("label: '立即更新'"), '缺少【立即更新】按钮');
  assert.ok(js.includes("cls: 'btn-text'"), '暂不更新缺少纯文字样式类');
  assert.ok(js.includes("cls: 'btn-primary'"), '立即更新缺少像素红按钮样式类');
  assert.ok(!js.includes('sessionStorage'), '暂不更新不应写入任何存储（仅关闭弹窗，不改本地版本号）');
  assert.ok(js.includes('localStorage.setItem(STORAGE_KEY'), '立即更新缺少本地版本写入');
  assert.ok(js.includes('location.href = remote.downloadUrl'), '立即更新缺少跳转下载地址刷新');
  assert.ok(js.includes('检测到新版本'), '弹窗缺少新版本号内容');
  assert.ok(js.includes('更新内容详见发布说明'), '弹窗缺少更新简介回退文案');
  assert.ok(js.includes('不下载任何新版资源'), '暂不更新缺少「禁止下载资源」语义');
  assert.ok(js.includes('下次打开页面依然会自动检测并弹窗'), '暂不更新缺少「不永久屏蔽、下次仍自动检测」语义');
  const css = readAppFile('css/components.css');
  assert.ok(css.includes('.modal-actions .btn-text'), '缺少 btn-text 纯文字灰色样式');
});

test('M14 版本更新提醒：GitHub Actions 工作流完整（main 推送触发、补丁递增、防死循环、自动提交）', () => {
  const wf = readAppFile('.github/workflows/bump-version.yml');
  assert.ok(wf.includes('name: Bump Version'), '工作流缺失');
  assert.ok(wf.includes('branches: [ main ]'), '未监听 main 分支推送');
  assert.ok(wf.includes('actions/checkout@v4'), '缺少 checkout');
  assert.ok(wf.includes('fetch-depth: 0'), '应使用 fetch-depth: 0 全量历史，保证多提交推送时能对比 before/after');
  assert.ok(wf.includes('version.json|notice.json|js/config.js|sw.js'), '防死循环文件集合不完整');
  assert.ok(wf.includes('only_version_files'), '缺少防死循环判定');
  assert.ok(wf.includes('github.event.before') && wf.includes('github.event.after'), '递增检测未覆盖本次 push 全部提交（多提交推送会漏检业务改动）');
  assert.ok(wf.includes('v[2] = (v[2] || 0) + 1'), '缺少补丁号 +1 递增');
  assert.ok(wf.includes('git commit') && wf.includes('git push origin main'), '缺少自动提交推送');
  // 版本与公告同步规则（v2.0.x 发布规则：代码版本与发布版本两轨独立）
  assert.ok(wf.includes('Validate version consistency'), '缺少版本一致性校验步骤');
  assert.ok(wf.includes('版本不匹配'), '校验失败缺少版本不匹配提示');
  assert.ok(wf.includes('process.exit(1)'), '校验失败未阻断构建');
  assert.ok(wf.includes('发布版本不匹配'), '缺少发布版本（version.json/notice.json）一致性校验');
  assert.ok(wf.includes('代码版本不匹配'), '缺少代码版本（config.js/sw.js）一致性校验');
  // 发布规则：bump 只改代码版本（config.js + sw.js），不动 version.json/notice.json
  assert.ok(!wf.includes('n.version = ver'), 'bump 不应再自动同步 notice.json（发布版本由开发者单独推送）');
  assert.ok(wf.includes('git add js/config.js sw.js'), '自动提交应只包含代码版本文件');
  assert.ok(wf.includes('version.json/notice.json 保持不动'), 'bump 应明确不动发布版本文件');
  assert.ok(wf.includes('先推送升级后的网页代码'), '缺少发布顺序说明（先代码后发布版本）');
});
