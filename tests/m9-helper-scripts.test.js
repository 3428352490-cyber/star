'use strict';
/* M9 阶段测试：启动/停止辅助脚本（结构完整性 + PowerShell 语法解析） */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function ps1SyntaxOk(rel) {
  const abs = path.join(ROOT, rel);
  const script =
    "$errs = $null; " +
    "[System.Management.Automation.Language.Parser]::ParseFile('" + abs.replace(/'/g, "''") +
    "', [ref]$null, [ref]$errs) | Out-Null; " +
    "if ($errs.Count -gt 0) { $errs | ForEach-Object { Write-Error $_.Message }; exit 1 }";
  execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'pipe' });
}

test('M9-1 启动/停止 bat 存在且调用对应 ps1', () => {
  const start = read('start-app.bat');
  const stop = read('stop-app.bat');
  assert.ok(start.includes('start-server.ps1'), '启动 bat 未调用 start-server.ps1');
  assert.ok(stop.includes('stop-server.ps1'), '停止 bat 未调用 stop-server.ps1');
  assert.ok(start.includes('%~dp0'), '启动 bat 未使用脚本所在目录定位');
  assert.ok(stop.includes('%~dp0'), '停止 bat 未使用脚本所在目录定位');
});

test('M9-2 ps1 文件存在且 PowerShell 语法解析通过', () => {
  for (const rel of ['scripts/start-server.ps1', 'scripts/stop-server.ps1', 'scripts/server.ps1']) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), rel + ' 缺失');
    assert.doesNotThrow(() => ps1SyntaxOk(rel), rel + ' 语法错误');
  }
});

test('M9-3 ps1 含 BOM（PowerShell 5.1 中文正确解析前提）', () => {
  for (const rel of ['scripts/start-server.ps1', 'scripts/stop-server.ps1', 'scripts/server.ps1']) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    assert.ok(
      buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF,
      rel + ' 缺少 UTF-8 BOM'
    );
  }
});

test('M9-4 端口约定一致：8000 与 PID 文件路径约定', () => {
  const start = read('scripts/start-server.ps1');
  const stop = read('scripts/stop-server.ps1');
  assert.ok(start.includes('$port = 8000') && stop.includes('$port = 8000'), '端口不一致');
  assert.ok(start.includes("Join-Path $env:TEMP 'sdv-guide.pid'"), '启动脚本 PID 文件约定缺失');
  assert.ok(stop.includes("Join-Path $env:TEMP 'sdv-guide.pid'"), '停止脚本 PID 文件约定缺失');
  assert.ok(stop.includes('Get-NetTCPConnection'), '停止脚本缺少端口兜底查找');
});

test('M9-5 bat 使用 8 秒自动关闭，避免窗口滞留占用', () => {
  const start = read('start-app.bat');
  const stop = read('stop-app.bat');
  assert.ok(start.includes('timeout /t 8'), '启动 bat 缺少自动关闭');
  assert.ok(stop.includes('timeout /t 8'), '停止 bat 缺少自动关闭');
  assert.ok(!start.includes('pause'), '启动 bat 不应使用无限 pause');
  assert.ok(!stop.includes('pause'), '停止 bat 不应使用无限 pause');
});

test('M9-6 端口占用自诊断：启动脚本列出占用者与处置指引', () => {
  const start = read('scripts/start-server.ps1');
  assert.ok(start.includes('占用详情如下'), '缺少占用详情输出');
  assert.ok(start.includes('ProcessName'), '未输出占用进程名');
  assert.ok(start.includes('stop-app.bat'), '未给出停止指引');
});

test('M9-7 纯 PowerShell 服务器：零 python 依赖、回环监听、防穿越、SPA 回退、MIME', () => {
  const srv = read('scripts/server.ps1');
  assert.ok(srv.includes('System.Net.HttpListener'), '未使用 HttpListener');
  assert.ok(srv.includes('http://127.0.0.1:$Port/'), '未监听本机回环');
  assert.ok(srv.includes("'python'") === false, '不应依赖 python');
  assert.ok(srv.includes('StartsWith'), '缺少路径穿越防护');
  assert.ok(srv.includes('index.html'), '缺少 SPA 回退');
  assert.ok(srv.includes("'.html'"), '缺少 html MIME');
  assert.ok(srv.includes("'.png'"), '缺少 png MIME');
  assert.ok(srv.includes("'.webmanifest'"), '缺少 webmanifest MIME');
  const start = read('scripts/start-server.ps1');
  assert.ok(start.includes("'server.ps1'"), '启动脚本未引用 server.ps1');
  assert.ok(!/python/i.test(start), '启动脚本不应再依赖 python');
});
