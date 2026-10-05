# ============================================================
# 星露谷攻略 - 停止本地服务器
# 优先按启动时记录的 PID 精确停止（不误伤其他进程）；
# 无记录时按 server.ps1 命令行兜底定位并停止。
# 停止后自动校验端口是否真正释放。
# ============================================================
$port = 8000
$pidFile = Join-Path $env:TEMP 'sdv-guide.pid'

if (Test-Path $pidFile) {
  $id = (Get-Content $pidFile -Raw).Trim()
  if ($id -and $id -match '^\d+$') {
    $proc = Get-Process -Id ([int]$id) -ErrorAction SilentlyContinue
    if ($proc) {
      Stop-Process -Id ([int]$id)
      Write-Host "已停止服务器（进程 PID $id）" -ForegroundColor Green
    } else {
      Write-Host '服务器进程未在运行（可能已手动关闭）。' -ForegroundColor Yellow
    }
  }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
} else {
  # 兜底：无 PID 记录时，按 server.ps1 命令行定位本应用服务器进程
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  $srv = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'server\.ps1' }
  if ($srv) {
    foreach ($s in $srv) {
      Stop-Process -Id $s.ProcessId -ErrorAction SilentlyContinue
      Write-Host "已停止服务器（进程 PID $($s.ProcessId)）" -ForegroundColor Green
    }
  } elseif ($conn) {
    Write-Host "端口 $port 被占用，但未找到本应用服务器进程（监听归系统 http.sys）。" -ForegroundColor Yellow
    Write-Host "如确认是本应用残留，请重新双击 start-app.bat 后立刻运行 stop-app.bat。" -ForegroundColor Yellow
  } else {
    Write-Host '未找到运行中的服务器。' -ForegroundColor Yellow
  }
}

# 校验：端口是否真正释放
Start-Sleep -Milliseconds 500
$left = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($left) {
  Write-Host "[警告] 端口 $port 仍被监听，占用者：" -ForegroundColor Red
  $left | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
    $op = Get-Process -Id $_ -ErrorAction SilentlyContinue
    if ($op) { Write-Host "  - $($op.ProcessName)（PID $_）" -ForegroundColor Red }
  }
  Write-Host "如为其他程序占用，请勿强制结束；可改用其他端口或关闭该程序后重试。" -ForegroundColor Red
} else {
  Write-Host "端口 $port 已释放，应用已完全停止。" -ForegroundColor Green
}
