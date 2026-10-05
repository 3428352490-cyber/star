# ============================================================
# 星露谷攻略 - 启动本地服务器（后台隐藏窗口）并打开浏览器
# 由 start-app.bat 调用；也可在 PowerShell 中直接运行本脚本
# 服务器为纯 PowerShell 实现（scripts/server.ps1），零外部依赖
# ============================================================
$ErrorActionPreference = 'Stop'
$port = 8000
$pidFile = Join-Path $env:TEMP 'sdv-guide.pid'
$appRoot = Split-Path -Parent $PSScriptRoot   # scripts/ 的上级 = 项目根目录
$serverScript = Join-Path $PSScriptRoot 'server.ps1'

# 1) 检查服务器脚本是否存在
if (-not (Test-Path $serverScript)) {
  Write-Host "[错误] 未找到服务器脚本：$serverScript" -ForegroundColor Red
  exit 1
}

# 2) 端口是否已被监听（应用可能已在运行）
$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "端口 $port 已被占用，占用详情如下：" -ForegroundColor Yellow
  $owners = $existing | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($oid in $owners) {
    $op = Get-Process -Id $oid -ErrorAction SilentlyContinue
    if ($op) { Write-Host "  - 进程: $($op.ProcessName)（PID $oid）" -ForegroundColor Yellow }
  }
  $rec = (Get-Content $pidFile -Raw -ErrorAction SilentlyContinue).Trim()
  if ($rec -match '^\d+$' -and $owners -contains [int]$rec) {
    Write-Host "占用者正是本应用此前启动的服务器：请直接双击 stop-app.bat 停止即可。" -ForegroundColor Yellow
  } else {
    Write-Host "占用者不是本应用（或 PID 记录丢失）：可双击 stop-app.bat 按端口停止，或关闭占用程序后重试。" -ForegroundColor Yellow
  }
  Start-Process "http://localhost:$port"
  exit 0
}

# 3) 后台启动纯 PowerShell 服务器（隐藏窗口）
$p = Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "$serverScript", '-Port', "$port", '-Root', "$appRoot" -WindowStyle Hidden -PassThru
$p.Id | Out-File -FilePath $pidFile -Encoding ascii
Start-Sleep -Seconds 2

# 4) 确认启动成功并打开浏览器
if (Get-Process -Id $p.Id -ErrorAction SilentlyContinue) {
  Write-Host "服务器已启动（进程 PID $($p.Id)）" -ForegroundColor Green
  Write-Host "访问地址：http://localhost:$port"
  Start-Process "http://localhost:$port"
} else {
  Write-Host '[错误] 服务器启动失败。' -ForegroundColor Red
  $busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($busy) {
    $busy | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
      $op = Get-Process -Id $_ -ErrorAction SilentlyContinue
      if ($op) { Write-Host "  端口 $port 当前由 $($op.ProcessName)（PID $_）占用" -ForegroundColor Red }
    }
    Write-Host '  请先双击 stop-app.bat 停止，或关闭占用该端口的程序后重试。' -ForegroundColor Red
  } else {
    Write-Host '  请手动运行 scripts\server.ps1 查看具体报错（PowerShell 中执行：powershell -File scripts\server.ps1）。' -ForegroundColor Red
  }
  if (Test-Path $pidFile) { Remove-Item $pidFile -Force }
  exit 1
}
