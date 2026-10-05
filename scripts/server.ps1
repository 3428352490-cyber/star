# ============================================================
# 星露谷攻略 - 纯 PowerShell 本地静态服务器（零依赖，系统自带）
# 仅监听 127.0.0.1（本机回环）：非管理员即可运行，无需 URL ACL
# 由 start-server.ps1 以隐藏窗口方式启动；Stop-Process 结束进程即停止
# ============================================================
param(
  [int]$Port = 8000,
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$mime = @{
  '.html'        = 'text/html; charset=utf-8'
  '.htm'         = 'text/html; charset=utf-8'
  '.css'         = 'text/css; charset=utf-8'
  '.js'          = 'application/javascript; charset=utf-8'
  '.json'        = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.png'         = 'image/png'
  '.jpg'         = 'image/jpeg'
  '.jpeg'        = 'image/jpeg'
  '.gif'         = 'image/gif'
  '.svg'         = 'image/svg+xml'
  '.ico'         = 'image/x-icon'
  '.txt'         = 'text/plain; charset=utf-8'
  '.md'          = 'text/markdown; charset=utf-8'
  '.woff'        = 'font/woff'
  '.woff2'       = 'font/woff2'
  '.ttf'         = 'font/ttf'
  '.wasm'        = 'application/wasm'
}

function Send-File([System.Net.HttpListenerContext]$ctx, [string]$file) {
  $ctx.Response.StatusCode = 200
  $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
  if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
  else { $ctx.Response.ContentType = 'application/octet-stream' }
  $bytes = [IO.File]::ReadAllBytes($file)
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}

function Send-404([System.Net.HttpListenerContext]$ctx) {
  $ctx.Response.StatusCode = 404
  $ctx.Response.ContentType = 'text/plain; charset=utf-8'
  $msg = [Text.Encoding]::UTF8.GetBytes('404 Not Found')
  $ctx.Response.ContentLength64 = $msg.Length
  $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
  $ctx.Response.Close()
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()

$rootFull = [IO.Path]::GetFullPath($Root)
if (-not $rootFull.EndsWith([IO.Path]::DirectorySeparatorChar)) {
  $rootFull += [IO.Path]::DirectorySeparatorChar
}

while ($listener.IsListening) {
  $ctx = $null
  try {
    $ctx = $listener.GetContext()
    # 解析请求路径，防目录穿越
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    $rel = $rel -replace '/', [IO.Path]::DirectorySeparatorChar
    $candidate = [IO.Path]::GetFullPath((Join-Path $rootFull $rel))
    if (-not $candidate.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
      Send-404 $ctx
      continue
    }
    if ([IO.Directory]::Exists($candidate)) {
      $candidate = Join-Path $candidate 'index.html'
    }
    if (-not [IO.File]::Exists($candidate)) {
      # SPA 回退：未知路径一律回首页（hash 路由）
      $candidate = Join-Path $rootFull 'index.html'
    }
    if ([IO.File]::Exists($candidate)) { Send-File $ctx $candidate }
    else { Send-404 $ctx }
  } catch {
    if ($ctx -ne $null) { try { Send-404 $ctx } catch {} }
    if (-not $listener.IsListening) { break }
    Start-Sleep -Milliseconds 50
  }
}
