# 星露谷攻略（PWA）

星露谷物语跨端攻略助手：电脑端 + 安卓端共用同一套自适应代码（原生 HTML/CSS/JS，零构建）。

## 目录结构

```
├── index.html              # 单页入口
├── manifest.webmanifest    # PWA 清单（M6）
├── sw.js                   # Service Worker（M6）
├── version.json            # 云端版本清单
├── css/                    # base(主题变量) / layout(布局) / components(组件)
├── js/                     # config / util / store / theme / ui / pages / router / update / app
├── assets/icons/           # 图标替换通道：assets/icons/{模块key}.png
└── tests/                  # 各阶段自动化测试（node --test）
```

## 本地运行（必须用 http 服务，file:// 下 SW/fetch 受限）

```powershell
# 方式一（推荐）：双击 start-app.bat / stop-app.bat
# 方式二（命令行，需安装 Python）：
python -m http.server 8000
# 打开 http://localhost:8000
```

> 服务器为**纯 PowerShell 实现**（`scripts/server.ps1`，基于系统自带 HttpListener），
> **不依赖 Python**——无需安装任何运行时，双击即可用。

### 一键启动 / 停止（推荐）

双击 `start-app.bat`：后台启动本地服务器（端口 8000）并自动打开浏览器；
双击 `stop-app.bat`：按启动时记录的进程 PID 精确停止（无记录时按命令行兜底）。
脚本会自动跳过“已在运行”情况，重复点击不会重复启动；窗口 8 秒自动关闭，不会滞留。

## 运行测试

```powershell
# Windows 下必须用引号 glob（node --test tests/ 会报 Cannot find module）
node --test "tests/**/*.test.js"
```

当前一期（M0–M8）共 91 项自动化测试全部通过，覆盖：工程结构、配置与写透持久化、深浅主题、UI 组件、路由页面、交互、PWA 更新检测、双端适配，以及 PRD §9 十八条验收标准。

## 部署到 GitHub Pages

> 注意：本机未安装 git 与 gh，无法自动推送。请手动完成：
> 1. 安装 Git（https://git-scm.com），或直接使用 GitHub 网页上传
> 2. 在 GitHub 新建仓库，推送/上传本项目全部文件（含 `manifest.webmanifest`、`sw.js`、`version.json`、`assets/`）
> 3. 仓库 Settings → Pages → Source: Deploy from a branch → main / root → Save
> 4. 访问 `https://<用户名>.github.io/<仓库名>/`
> 5. 更新版本时三处同步：`js/config.js` 的 `app.version`、`sw.js` 的 `CACHE_NAME`、`version.json`（均有测试守护）
> 6. `js/config.js` 的 `cloudVersionUrl` 当前为相对路径 `version.json`，部署到仓库根目录可直接使用；如项目在子路径，改为完整 URL `https://<用户名>.github.io/<仓库名>/version.json`

## 版本更新流程（云端源码更新后双端同步）

1. 修改代码，三处同步升级版本号
2. 推送到 GitHub Pages
3. 用户打开 APP 自动拉取 `version.json` 比对，发现新版本弹窗提示
4. 点击「立即更新」刷新获取新源码

## 图标替换通道

- 约定：模块图标命名为 `assets/icons/{模块key}.png`（key 见 `js/config.js` 的 modules 数组）
- 放入透明底像素风 PNG 后自动生效；缺失时自动回退为「模块首字」文字瓦片
- 一期仅预留路径，不上传功能（二期实现）
