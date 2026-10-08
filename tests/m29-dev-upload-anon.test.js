'use strict';
/* M29 阶段测试：v2.4.16 上传路径拦截绕过 + 双段连通自检——
   ① GET 读 sha 无认证优先（公开仓库可直接读 sha，绕过对「带认证请求」的路径级拦截），失败回退带 Token；
   ② 检测网络升级双段：rate_limit 连通性 + 仓库 contents 路径复现，精准区分「可直连重试」/「路径被拦关代理」；
   ③ 失败弹窗在自检可直连但上传失败时，明确提示关闭 VPN/代理类 app。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, readAppFile } = require('./helpers/harness.js');

loadApp();

test('M29-1 GET 读 sha 无认证优先：公开仓库绕过带认证拦截，失败回退带 Token', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('无认证优先读取'), '缺少无认证优先读取说明');
  assert.ok(src.includes("const anonRes = await fetchTimeout("), '缺少无认证读取请求');
  assert.ok(src.includes("anonData.sha"), '缺少无认证读取 sha 提取');
  assert.ok(src.includes("if (anonData && anonData.sha) {"), '缺少无认证命中即返回 sha 分支');
  assert.ok(src.includes("'Accept': 'application/vnd.github+json' }, redirect: 'manual' },"), '无认证请求缺少 Accept 头');
});

test('M29-2 检测网络升级双段检测：rate_limit 连通性 + contents 路径复现', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('两段检测'), '缺少双段检测说明');
  assert.ok(src.includes('api.github.com/rate_limit'), '缺少连通性检测段');
  assert.ok(src.includes("'/contents/'"), '缺少上传路径复现检测段');
  assert.ok(src.includes('const rate = { ok: false'), '缺少连通性结果对象');
  assert.ok(src.includes('const contents = { ok: false'), '缺少路径检测结果对象');
  assert.ok(src.includes("if (rate.ok && contents.ok)"), '缺少双段汇总判断');
  assert.ok(src.includes("kind: 'path-blocked'"), '缺少路径拦截结论分类');
});

test('M29-3 自检结果精准文案：可直连重试 / 路径被拦关代理 / 网络拦截', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('可直连 api.github.com 且上传路径可达'), '缺少直连+路径可达文案');
  assert.ok(src.includes('仓库 contents 路径被拦截'), '缺少路径被拦文案');
  assert.ok(src.includes('VPN/代理/加速类应用的路径规则'), '缺少关闭代理提示');
  assert.ok(src.includes('case \'dev-net-check\''), '缺少自检按钮动作分支');
});

test('M29-4 原有逻辑不变：域名校验 + sha 提交 + 超时重试 + 失败保留数据', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes("'https://api.github.com'"), '缺少 GitHub API 基础地址');
  assert.ok(src.includes('GitHub API 域名异常，必须使用 api.github.com'), '缺少域名强制校验');
  assert.ok(src.includes('if (sha) body.sha = sha;'), '缺少携带最新 sha 防提交冲突');
  assert.ok(src.includes('function fetchTimeout'), '缺少超时控制');
  assert.ok(src.includes('async function withRetry'), '缺少自动重试');
  assert.ok(src.includes('上传失败不会损坏仓库原有文件'), '失败提示保留');
});
