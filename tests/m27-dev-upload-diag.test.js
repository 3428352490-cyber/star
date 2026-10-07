'use strict';
/* M27 阶段测试：v2.4.14 一键上传失败诊断增强——
   上传失败弹窗展示 HTTP 状态码 + 返回内容片段 + 针对性建议，
   按根因区分 Token 失效/限流/404/网络拦截，帮助一次性定位问题。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, readAppFile } = require('./helpers/harness.js');

loadApp();

test('M27-1 HTML 响应根因诊断：区分登录页/限流页/404/网络拦截', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('function diagnoseHtml'), '缺少 HTML 响应诊断函数');
  assert.ok(src.includes("s.includes('sign in') || s.includes('log in') || s.includes('login')"), '缺少登录页识别（Token 失效）');
  assert.ok(src.includes("s.includes('rate limit')") && src.includes("st === '429'"), '缺少限流页识别');
  assert.ok(src.includes("st === '404'"), '缺少 404 识别（仓库/路径配置错误）');
  assert.ok(src.includes('kind: \'network\''), '缺少默认网络拦截分类');
});

test('M27-2 失败弹窗展示诊断区：HTTP 状态 + 内容片段 + 建议', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('function uploadFailDiagHtml'), '缺少诊断区组装函数');
  assert.ok(src.includes('class="dev-upload-diag"'), '缺少诊断区样式类引用');
  assert.ok(src.includes('HTTP 状态'), '诊断区缺少状态码标签');
  assert.ok(src.includes('返回内容片段'), '诊断区缺少内容片段标签');
  assert.ok(src.includes('建议'), '诊断区缺少建议标签');
  assert.ok(src.includes('uploadFailDiagHtml(r)'), '失败弹窗未接入诊断区');
  // 内容片段应去除 HTML 标签压缩为纯文本
  assert.ok(src.includes('replace(/<[^>]*>/g, \' \')'), '缺少 HTML 标签剥离');
});

test('M27-3 HTML 错误携带诊断细节：状态码 + 内容片段', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('status: res ? res.status : 0'), 'safeJsonWithCheck 缺少状态码附带');
  assert.ok(src.includes('diag: { kind: \'html\', status: ge.status || 0, snippet: ge.snippet || \'\', tip: diagnoseHtml(ge.snippet, ge.status).tip }'), 'GET 读 sha 分支缺少诊断信息');
  assert.ok(src.includes('diag: { kind: \'html\', status: pe.status || 0, snippet: pe.snippet || \'\', tip: diagnoseHtml(pe.snippet, pe.status).tip }'), 'PUT 提交分支缺少诊断信息');
  assert.ok(src.includes('diag: { kind: \'html\', status: re.status || 0, snippet: re.snippet || \'\', tip: diagnoseHtml(re.snippet, re.status).tip }'), 'refresh 重拉分支缺少诊断信息');
});

test('M27-4 诊断区像素样式存在（dev-admin.css）', () => {
  const css = readAppFile('css/dev-admin.css');
  assert.ok(css.includes('.dev-upload-diag'), '缺少诊断区样式');
  assert.ok(css.includes('word-break: break-all'), '诊断区长内容应自动换行');
});

test('M27-5 上传核心逻辑不变：域名校验 + sha 提交 + 失败保留数据', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes("'https://api.github.com'"), '缺少 GitHub API 基础地址');
  assert.ok(src.includes('GitHub API 域名异常，必须使用 api.github.com'), '缺少域名强制校验');
  assert.ok(src.includes('if (sha) body.sha = sha;'), '缺少携带最新 sha 防提交冲突');
  assert.ok(src.includes('上传失败不会损坏仓库原有文件'), '失败提示保留');
});
