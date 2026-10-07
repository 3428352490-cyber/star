# 星露谷攻略 · 版本管理与发布规则

> **给后续 AI / 开发者自动读取使用**：处理本项目的版本号、更新公告、发布流程时，
> 必须先阅读本文档并严格遵守。算法与脚本见 `scripts/version-bump.js`（含完整实现）。

---

## 一、语义化版本号规则（MAJOR.MINOR.PATCH）

| 等级 | 递增 | 适用改动 | 示例 |
|---|---|---|---|
| **PATCH**（修订号） | 第三位 `+0.0.1` | 小改动 / bug 修复 / 素材微调 / 文案修改 | `1.0.9 → 1.0.10`（两位数修订正常进位） |
| **MINOR**（次版本） | 第二位 `+0.1.0`，修订号归零 | 新增页面 / 新增独立模块（向下兼容，如新模组接入、新增帖子功能） | `1.0.10 → 1.1.0` |
| **MAJOR**（主版本） | 第一位 `+1.0.0`，其余归零 | 颠覆性重构 / 不兼容旧数据 / 底层架构大规模改动 | `1.1.0 → 2.0.0` |

**硬性约束**：严格区分改动等级，禁止乱跳版本号；版本对比一律按语义化分段数字算法，禁止字符串直接比较。

---

## 二、改动类型自动判定算法（scripts/version-bump.js）

**执行逻辑**：
1. 读取本次提交的改动清单（git diff）→ 2. 启发式判定改动类型 → 3. 自动递增版本号 → 4. 更新版本文件 + 公告 → 5. 输出四段结果。

**判定优先级：MAJOR > MINOR > PATCH（PATCH 为默认兜底）**

- **MAJOR 线索**：
  - 提交说明含关键词：`重构 / 重写 / 颠覆 / 不兼容 / breaking / 架构 / 大规模 / migration / rewrite`
  - 改动规模 ≥ 3000 行且 ≥ 5 个文件
  - 删除文件 ≥ 5 个（旧结构移除）
- **MINOR 线索**：
  - 新增业务脚本文件 ≥ 150 行（**仅统计 `js/` 下**；`scripts/`、`tests/`、`helpers/` 属工具/测试不算新功能模块）
  - 新增全新目录（排除已知目录 `tests/scripts/assets/css/js/data`）
  - 改动规模 ≥ 800 行
  - 提交说明含 `新增/新页面/新模块/新功能/独立模块/feature` 关键词 **且** 配合真实新模块文件或中等规模（仅关键词无证据 → 不判 MINOR，提示用 `--type=minor` 指定）
- **PATCH**：其余所有情况（默认兜底）。

**脚本用法**：
```bash
node scripts/version-bump.js                        # 自动判定+写入（工作区改动）
node scripts/version-bump.js --scope=pushed         # 判定未推送提交（git diff origin/main..HEAD）
node scripts/version-bump.js --type=minor --note="新增XX模块"   # 强制指定类型+自定义摘要
node scripts/version-bump.js --dry-run              # 仅预览不写文件
```
脚本输出固定四段：【改动类型判定】【旧版号】【新版号】【更新公告】，并给出建议提交备注。

---

## 三、版本文件清单（每次发布必须四文件同步）

| 文件 | 更新内容 |
|---|---|
| `js/config.js` | `SDV_CONFIG.app.version`（代码版本）+ `announcements` 数组头部追加本次公告条目 |
| `sw.js` | `CACHE_NAME = 'sdv-guide-vX.Y.Z'`（必须与 config.js 版本一致，否则 SW 缓存不刷新） |
| `version.json` | `latestVersion`（云端版本）+ `updateDesc`（更新简介） |
| `notice.json` | `version` / `title` / `items`（更新公告弹窗数据） |

`scripts/version-bump.js` 一次性完成上述全部四文件同步（含公告生成），无需手工编辑。

---

## 四、发布流程（推送即升版 + 发布更新公告）

> 用户长期规则：**每次推送都必须升级版号并发布更新公告**；**推送前必须经用户确认**（发布前不发版）。

1. **开发完成**：修改代码 → 全量测试通过：
   ```bash
   node --test --test-force-exit "tests\**\*.test.js"   # Windows 需 --test-force-exit，否则挂死
   ```
2. **升版**（自动判定类型 + 自动更新四版本文件 + 生成公告）：
   ```bash
   node scripts/version-bump.js --scope=pushed --note="本次改动摘要"
   ```
3. **提交**：功能改动单独 commit；版本发布单独 commit（`release: vX.Y.Z ...` 格式，含测试结果）。
4. **推送前确认**：向用户列出版本号与公告，**等待用户明确确认后再 push**。
5. **推送前检查远程分叉**：`git fetch origin` 后比对 `HEAD` 与 `origin/main`；
   用户手机可能已通过「网页提交」推送 `data/page-content.json`（auto update 提交），
   本地有分叉必须 **rebase** 后再推（多次出现非 fast-forward 被拒）。
6. **推送**：`git push origin main`。

---

## 五、版本比对算法（应用内检查更新，js/update.js）

- `parseVersion`：去 `v` 前缀 → 按 `.` 分段转数字 → 缺段补 0、非法回退 0
- `compareVersion`：逐段**数字**比较（禁止字符串比较），云端高=1 / 相同=0 / 本地高=-1
- `getUpdateTypeInfo`：主版本→次版本→修订号优先级识别 重大/功能/补丁 更新
- 本地版本基准 `LOCAL_VERSION` 从 `config.js` 读取（无硬编码），弹窗版本文字全部变量渲染
- 已由 `tests/m39-version-algorithm.test.js` 固化验证（含两位修订号 9→10、跨位、v 前缀、缺段、非法输入边界）

---

## 六、git 提交身份与远程

- 提交身份：`竹淮白 <3428352490@qq.com>`
- 远程仓库：`https://github.com/3428352490-cyber/star.git`（owner `3428352490-cyber` / repo `star`，分支 `main`）
- 业务数据文件：`data/page-content.json`（一键上传 / 同步覆盖使用，用户手机可直接网页提交该文件）

---

## 七、测试体系

- 测试文件：`tests/m*.test.js`（Node 内置 test runner，无需额外依赖）
- 测试基础设施：`tests/helpers/harness.js`（vm 加载浏览器脚本 + stub 全局对象）
- 与版本/发布相关测试：`m39`（版本算法）、`m40`（version-bump 脚本算法）、`m23/m38`（更新弹窗与自动刷新）
- 每次发布前全量测试必须全绿；新增功能同步补测试。
