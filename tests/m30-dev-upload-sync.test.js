'use strict';
/* M30 阶段测试：v2.4.17 上传后内容同步修复——
   ① 刷新远程数据 fetch 对齐上传流程：无认证优先读取（绕过路径拦截）+ 超时 + 自动重试；
   ② refresh 成功后派发 hashchange 触发路由重渲染，公告/页面内容即时显示最新远程数据
      （此前仅派发自定义事件 sdv-content-refresh，渲染层无监听方，页面不刷新）。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, readAppFile } = require('./helpers/harness.js');

loadApp();

test('M30-1 刷新远程数据无认证优先读取：绕过带认证请求拦截', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('const anonRes = await fetchTimeout('), '刷新流程缺少无认证优先读取');
  assert.ok(src.includes("anonData.content"), '缺少无认证读取内容提取');
  assert.ok(src.includes("if (!Object.keys(remote).length)"), '缺少无认证失败回退分支');
  assert.ok(src.includes("await withRetry(function () {"), '刷新流程缺少自动重试');
});

test('M30-2 刷新成功后触发路由重渲染：hashchange 派发使页面显示最新远程数据', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes("new HashChangeEvent('hashchange')"), '缺少 hashchange 重渲染派发');
  assert.ok(src.includes('v2.4.17 触发路由重渲染'), '缺少重渲染说明');
  assert.ok(src.includes('仅派发自定义事件无监听方'), '缺少事件无监听方说明');
  assert.ok(src.includes('SDV_CONFIG.announcements = remote.announcements'), '缺少远程公告数据源同步');
  assert.ok(src.includes('applyPageEdits'), '缺少文本编辑即时重放');
});

test('M30-3 刷新流程异常分类保留：html/token/json/net 均映射失败结果', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes("re.__class === 'html'"), '缺少 HTML 拦截分类');
  assert.ok(src.includes("re.__class === 'token'"), '缺少 Token 分类');
  assert.ok(src.includes("re.__class === 'net'"), '缺少网络异常分类');
});

test('M30-4 原有逻辑不变：域名校验 + sha 提交 + 失败保留数据 + 上传弹窗', () => {
  const src = readAppFile('js/dev-admin.js');
  assert.ok(src.includes('GitHub API 域名异常，必须使用 api.github.com'), '缺少域名强制校验');
  assert.ok(src.includes('if (sha) body.sha = sha;'), '缺少携带最新 sha');
  assert.ok(src.includes('上传失败不会损坏仓库原有文件'), '失败提示保留');
  assert.ok(src.includes('上传成功'), '成功提示保留');
});
