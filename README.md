# 星露谷攻略（PWA）

星露谷物语跨端攻略助手：电脑端 + 安卓端共用同一套自适应代码（原生 HTML/CSS/JS，零构建）。

> **⚠️ 版本管理与发布规则**：处理版本号、更新公告、发布流程前，**必须先阅读根目录
> [`VERSION-RULES.md`](VERSION-RULES.md)**（语义化版本算法、改动类型自动判定、四版本文件同步、
> 推送即升版+公告、推送前确认等规则全集，供后续 AI / 开发者自动读取使用）。

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

## 上传 GitHub / 开启 GitHub Pages

> 本机已安装 Git（2.55+），项目本地 git 仓库已初始化并完成多次提交（main 分支）。

### 1. 在 GitHub 网页新建仓库

1. 登录 https://github.com → 右上角「+」→ **New repository**
2. 仓库名建议全小写英文，如 `stardew-guide`（不要用中文/空格/大写）
3. 可见性按需选 Public / Private
4. **不要勾选**「Add a README file」「Add .gitignore」「Choose a license」（本地已有，勾选会制造推送冲突）
5. 点击 **Create repository**

### 2. 本地关联远程并推送

```powershell
# ① 关联远程（origin 不存在时）
git remote add origin https://github.com/<用户名>/<仓库名>.git

# ② 验证关联
git remote -v

# ③ 推送 main 分支（-u 记住后续 push 只需 git push）
git push -u origin main
```

### 3. 开启 GitHub Pages

1. 仓库页面 → **Settings** → 左侧 **Pages**
2. **Source** 选 `Deploy from a branch` → Branch 选 `main` → `/ (root)` → **Save**
3. 等待 1–2 分钟构建，访问 `https://<用户名>.github.io/<仓库名>/`
4. PWA（sw.js 注册）要求 HTTPS，GitHub Pages 自带 HTTPS，无需额外配置

### 4. 常见报错与解决方案

| 报错信息 | 原因 | 解决方案 |
|---|---|---|
| `remote origin already exists` | origin 已关联过 | `git remote set-url origin https://github.com/<用户名>/<仓库名>.git` |
| `! [rejected] ... (fetch first)` | 远端有本地没有的提交（如建仓时勾选了 README） | `git pull origin main --rebase` 后重新 `git push` |
| `src refspec main does not match any` | 本地没有 main 分支 | `git branch -M main` 后重试 push |
| `Permission denied (publickey)` | 用了 SSH 地址但未配密钥 | 改用 HTTPS 地址，或执行 `gh auth login` 后用 `gh repo push` |
| `failed to push some refs` | 远端领先本地 | `git pull origin main --rebase` 解决后再推（不要轻易 force） |
| 页面 404 | Pages 未开启 / 还在构建 / 路径不对 | 检查 Settings→Pages 状态；确认访问 URL 为仓库名全小写 |
| 图片 404（首次部署最常见） | 路径大小写不一致 | 见下方第 5 条 |

### 5. 图片路径大小写提醒（重要）

- GitHub Pages 服务器**区分大小写**：`assets/Stardew.png` 与 `assets/stardew.png` 是两个文件
- 本项目素材引用均为小写且与实际文件一致，已核对：`assets/stardew-wood-frame.png`、`assets/icons/icon-192.png` 等
- 今后新增素材/替换文件：**文件名必须与 CSS/HTML 中的引用逐字一致**（含扩展名大小写），否则线上 404
- 推送前可自查：`git status --short` 确认没有"改了个名字但引用没同步"的文件

### 6. 云端更新版本 URL

- 项目部署在仓库根目录时，`js/config.js` 的 `cloudVersionUrl: 'version.json'` 可直接使用
- 若部署在子路径或自定义域名，改为完整地址：`https://<用户名>.github.io/<仓库名>/version.json`
- 更新版本时四处同步：`js/config.js` 的 `app.version`、`sw.js` 的 `CACHE_NAME`、`version.json`、`notice.json`（有测试守护）；
  推荐直接用 `node scripts/version-bump.js --scope=pushed --note="摘要"` 自动完成版本判定 + 四处同步 + 公告生成（规则见 `VERSION-RULES.md`）

## 版本更新流程（云端源码更新后双端同步）

1. 修改代码，三处同步升级版本号
2. 推送到 GitHub Pages
3. 用户打开 APP 自动拉取 `version.json` 比对，发现新版本弹窗提示
4. 点击「立即更新」刷新获取新源码

## 图标替换通道

- 约定：模块图标命名为 `assets/icons/{模块key}.png`（key 见 `js/config.js` 的 modules 数组）
- 放入透明底像素风 PNG 后自动生效；缺失时自动回退为「模块首字」文字瓦片
- 一期仅预留路径，不上传功能（二期实现）
