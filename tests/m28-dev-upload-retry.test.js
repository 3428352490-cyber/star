'use strict';
/* M28 阶段测试：v2.4.15 备用上传通道 + 网络连通自检——
   ① 备用通道：带超时 fetch + 网络异常/HTML拦截/JSON错误自动重试（不接入第三方代理防 Token 泄露）；
   ② 失败弹窗新增「检测网络」按钮：点击自检 api.github.com 连通性，即时展示结果；
   ③ 返回内容片段显示优化：截取 200 字符，过短内容提示疑似空白拦截页。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, readAppFile } = require('./helpers/harness.js');

loadApp();

test('M28-1 备用通道·超时控制：fetchTimeout 使用 AbortController 中断挂起请求', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('function fetchTimeout'), '缺少带超时的 fetch');
  assert.ok(src.includes('new AbortController()'), '缺少 AbortController 超时中断');
  assert.ok(src.includes("e.__class = 'net'"), '超时/连接中断应标记为可重试的网络异常');
  assert.ok(src.includes('request超时') || src.includes('请求超时'), '缺少超时提示文案');
});

test('M28-2 备用通道·自动重试：net/html/json 可重试，token 业务错误不重试', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('async function withRetry'), '缺少通用重试');
  assert.ok(src.includes("cls !== 'net' && cls !== 'html' && cls !== 'json'"), '可重试错误分类错误');
  assert.ok(src.includes('setTimeout(r, 600 * (i + 1))'), '缺少递增重试间隔');
  assert.ok(src.includes('withRetry(function ()'), '上传流程未接入自动重试');
});

test('M28-3 安全约束：不接入第三方代理（Token 不泄露），GET/PUT 均走超时重试', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(!src.includes('corsproxy') && !src.includes('r.jina.ai') && !src.includes('api.allorigins'), '不得接入第三方代理域名');
  assert.ok(src.includes('第三方 CORS 代理会泄露 Token'), '缺少代理风险说明');
  // GET 读 sha（?ref= 分支）与 PUT 提交均应为「return fetchTimeout(」调用点
  const retryCalls = src.split('return fetchTimeout(').length - 1;
  assert.ok(retryCalls >= 2, 'GET/PUT 至少两处走超时重试，实际 ' + retryCalls);
  assert.ok(src.includes("'?ref=' + encodeURIComponent(repo.branch"), '缺少 GET 分支 ref 参数');
  assert.ok(src.includes("method: 'PUT'"), '缺少 PUT 分支');
});

test('M28-4 网络连通自检：rate_limit 无需 Token 即可判定，结果即时展示', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('async function checkGitHubConnectivity'), '缺少连通自检函数');
  assert.ok(src.includes('/rate_limit'), '自检应请求 rate_limit 接口');
  assert.ok(src.includes('async function runNetCheck'), '缺少自检执行函数');
  assert.ok(src.includes('case \'dev-net-check\''), '缺少自检按钮动作分支');
  assert.ok(src.includes('data-action="dev-net-check"'), '失败弹窗缺少检测网络按钮');
  assert.ok(src.includes('id="dev-net-result"'), '缺少自检结果容器');
  assert.ok(src.includes('可直连 api.github.com'), '缺少直连成功文案');
  assert.ok(src.includes('仍被拦截（返回 HTML）'), '缺少拦截失败文案');
});

test('M28-5 片段显示优化：截取 200 字符，过短内容提示疑似空白拦截页', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('.slice(0, 200)'), '内容片段应截取 200 字符');
  assert.ok(src.includes('返回内容过短，疑似空白拦截页'), '缺少过短内容提示');
});

test('M28-6 原有上传逻辑不变：域名校验 + sha 提交 + 失败保留数据', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes("'https://api.github.com'"), '缺少 GitHub API 基础地址');
  assert.ok(src.includes('GitHub API 域名异常，必须使用 api.github.com'), '缺少域名强制校验');
  assert.ok(src.includes('if (sha) body.sha = sha;'), '缺少携带最新 sha 防提交冲突');
  assert.ok(src.includes('上传失败不会损坏仓库原有文件'), '失败提示保留');
});
