'use strict';

/**
 * ============================================================
 * 版本号自动判定与更新脚本（语义化版本 MAJOR.MINOR.PATCH）
 *
 * 规则：
 *  · PATCH（+0.0.1）：小改动、bug 修复、素材微调、文案修改
 *  · MINOR（+0.1.0，修订号归零）：新增页面、新增独立模块，向下兼容
 *  · MAJOR（+1.0.0，其余归零）：颠覆性重构、不兼容旧数据、底层架构大规模改动
 *
 * 执行逻辑：
 *  ① 读取改动清单（默认最近一次提交；--push 模式读上次发版至今的全部提交）
 *  ② 依据改动类型自动选择递增规则（MAJOR > MINOR > PATCH）
 *  ③ 自动更新 version.json 版本号，同步写入 notice.json 本次更新公告
 *  ④ 输出新版本号 + 简短更新摘要（供 GitHub 提交备注）
 *
 * 约束：
 *  · 默认仅做版本判断、更新 version.json / notice.json、生成公告摘要；
 *    不自动执行 git 提交与推送
 *  · 严格区分改动等级，禁止乱跳版本号
 *  · 可用 --major / --minor / --patch 显式指定类型（跳过自动判定）
 *  · --push 模式：完整发布流程 —— ① 推送业务代码 ② 自动识别是否发版
 *    （js/css/html/assets 业务文件改动即发版；仅文档/公告/测试不发版）
 *    ③ 判定版本类型并递增 ④ 四文件同步（version.json / notice.json /
 *    config.js / sw.js）+ 公告写入 ⑤ 提交版本文件并推送
 * ============================================================
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'version.json');
const NOTICE_FILE = path.join(ROOT, 'notice.json');

/* ---------------- 基础工具 ---------------- */

function git(args) {
  return execSync('git ' + args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function hasGitRepo() {
  try {
    git('rev-parse --is-inside-work-tree');
    return true;
  } catch (e) {
    return false;
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

/** 本地日期 YYYY-MM-DD */
function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/* ---------------- 版本号解析与递增 ---------------- */

/** 解析语义化版本 v1.2.3 → [1, 2, 3]（去掉 v 前缀，数字分段） */
function parseVersion(v) {
  const m = String(v).trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error('无法解析版本号：' + v);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function formatVersion(arr) {
  return arr.join('.');
}

/** 按类型递增：major/minor/patch */
function bumpVersion(version, type) {
  const [major, minor, patch] = parseVersion(version);
  switch (type) {
    case 'major': return formatVersion([major + 1, 0, 0]);
    case 'minor': return formatVersion([major, minor + 1, 0]);
    case 'patch': return formatVersion([major, minor, patch + 1]);
    default: throw new Error('未知版本类型：' + type);
  }
}

/* ---------------- ① 读取改动清单 ---------------- */

/** 读取最近一次提交（或指定 range）的改动清单与提交信息；无提交时回退到未提交改动 */
function getChangeSet(range) {
  if (!hasGitRepo()) {
    return { files: [], message: '（非 git 仓库，无法读取改动清单）' };
  }
  try {
    if (range) {
      // --push 模式：合并 range 内全部提交的 message 与文件（去重）
      const messages = git('log ' + range + ' --format=%s').split('\n').filter(Boolean);
      const statuses = git('diff --name-status ' + range).split('\n').filter(Boolean);
      const files = [];
      const seen = {};
      for (const line of statuses) {
        const parts = line.split('\t');
        const file = parts[parts.length - 1];
        if (!seen[file]) { seen[file] = 1; files.push({ status: parts[0], file }); }
      }
      return { files, message: messages.join('；') || '（范围提交无信息）' };
    }
    const out = git('show HEAD --name-status --format="%s"');
    const lines = out.split('\n');
    const message = (lines[0] || '').trim() || '（无提交信息）';
    const files = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split('\t');
      files.push({ status: parts[0], file: parts[parts.length - 1] });
    }
    return { files, message };
  } catch (e) {
    // 没有提交：读取未提交改动（git status --short）
    const out = git('status --short');
    const files = out.split('\n').filter(Boolean).map((line) => {
      const status = line.slice(0, 2).trim() || 'M';
      return { status, file: line.slice(3).trim() };
    });
    return { files, message: '（未提交改动）' };
  }
}

/** --push 模式：上次发版（release:）提交至今的提交范围；无发版记录时取最近 3 条 */
function getReleaseRange() {
  try {
    const last = git('log -1 --format=%H --grep="release:"');
    if (last) return last + '..HEAD';
  } catch (e) { /* 无发版记录 */ }
  return 'HEAD~3..HEAD';
}

/** 业务代码是否发生改动（js/css/html/assets/sw）：是 → 需要发版；仅文档/公告/测试/脚本 → 不发版 */
const RELEASE_FILE = /^(js\/|css\/|sw\.js$|assets\/|index\.html$)/;
function isReleaseNeeded(files) {
  return files.some((f) => RELEASE_FILE.test(f.file));
}

/* ---------------- ② 改动类型判定 ---------------- */

// MAJOR：只有明确的"颠覆性 / 不兼容 / 架构级"信号才算（防止"重构"二字误升主版本）
const MAJOR_KEYS = ['breaking', '不兼容', '迁移', '架构', '颠覆', '底层', '大规模', '数据结构变更', '不兼容旧数据'];
// MINOR：复合词优先；裸"新增"仅在非修复语境下生效（fix 里"新增 xxx 函数/测试"不算新模块）
// 注意：裸 "feat:" 前缀不算 MINOR（小功能改动归 PATCH），仅"新增页面/独立模块"等复合词升级
const MINOR_KEYS = ['新页面', '新模块', '独立模块', '新增页面', '新增模块', '新增功能', '新增独立', '新增帖子', '新功能', '接入', '集成', '新增模组'];
// PATCH：小改动 / bug 修复 / 素材 / 文案 / 样式
const PATCH_KEYS = ['fix', '修复', 'bug', '素材', '文案', '样式', '优化', '微调', '调整', '细节', '补丁'];

/** 判定改动类型：MAJOR > MINOR > PATCH（严格区分等级，禁止乱跳） */
function judgeType({ files, message }) {
  const msg = String(message || '').toLowerCase();
  const isFixContext = /^(fix|修复)/i.test(String(message || ''));

  // ① MAJOR：仅强信号（颠覆性重构 / 不兼容 / 架构级改动）
  for (const k of MAJOR_KEYS) {
    if (msg.includes(k)) {
      return { type: 'major', reason: '命中重大信号「' + k + '」' };
    }
  }

  // ② MINOR：新增独立 js 模块文件（全新模块接入）
  const newJsFiles = files.filter((f) => {
    const st = String(f.status || '');
    return (st === 'A' || st === '??') && /^js\/.+\.js$/.test(f.file);
  });
  if (newJsFiles.length > 0) {
    return { type: 'minor', reason: '新增独立模块文件：' + newJsFiles.map((f) => f.file).join('、') };
  }

  // ③ MINOR：提交信息命中新增页面 / 新模块 / 功能升级信号（复合词）
  for (const k of MINOR_KEYS) {
    if (msg.includes(k)) {
      return { type: 'minor', reason: '提交信息命中「' + k + '」' };
    }
  }

  // ④ PATCH：bug 修复 / 小改动 / 素材 / 文案 / 样式（优先于裸"新增"，防"新增样式类名"误升次版本）
  for (const k of PATCH_KEYS) {
    if (msg.includes(k)) {
      return { type: 'patch', reason: '提交信息命中「' + k + '」' };
    }
  }

  // ⑤ 非修复语境下的裸"新增"（如"新增社区板块"）→ MINOR
  if (!isFixContext && msg.includes('新增')) {
    return { type: 'minor', reason: '提交信息命中「新增」' };
  }

  // ⑥ 兜底：仅素材 / 样式 / 配置类文件改动 → PATCH
  const onlyCosmetic = files.length > 0 && files.every((f) =>
    /\.(css|json|png|jpg|svg|ico|txt|md)$/.test(f.file) ||
    /^assets\//.test(f.file)
  );
  if (onlyCosmetic) {
    return { type: 'patch', reason: '仅素材 / 样式 / 配置类文件改动' };
  }

  // ⑦ 无法明确判定：默认按最小等级 PATCH，并提示
  return { type: 'patch', reason: '未命中明确信号，按最小等级 PATCH 处理（如有更大改动请用 --major / --minor 显式指定）' };
}

/* ---------------- ③ 公告摘要生成 ---------------- */

/** 面向玩家的技术词安全替换（仅整词替换，不破坏 search_xxx 这类标识符） */
const SAFE_TERMS = {
  'BUG': '问题',
  'bug': '问题',
  'localStorage': '本地保存',
  'LocalStorage': '本地保存',
  'Mock': '演示数据',
  'mock': '演示数据',
  'JSON': '数据文件',
  'json': '数据文件',
  'SVG': '图形',
  'svg': '图形',
};

function cleanTerm(s) {
  let t = s;
  for (const k of Object.keys(SAFE_TERMS)) {
    // 前后都不是字母/数字/下划线才替换（避免破坏 search_placeholderTimer 这类标识符）
    t = t.replace(new RegExp('(?<![A-Za-z0-9_])' + k + '(?![A-Za-z0-9_])', 'g'), SAFE_TERMS[k]);
  }
  return t;
}

/** 从提交信息清洗生成简短更新摘要条目列表（每条取一个分句，截断到 45 字） */
function buildSummaryItems(message) {
  if (!message || message.startsWith('（')) {
    return ['本次更新内容'];
  }
  // 按提交拆分（多提交用；连接）→ 每条剥离 fix():/feat:/release: 前缀 → 取第一个分句
  const commits = String(message).split(/[；;]\s*(?=fix|feat|release|refactor|chore|docs|style|test|perf|build|ci|merge)/i);
  const items = [];
  const seen = {};
  for (const c of commits) {
    let text = String(c)
      .replace(/^(fix|feat|refactor|chore|docs|release|style|test|perf|build|ci|merge)\s*(\([^)]*\))?\s*[:：]\s*/i, '')
      .trim();
    if (!text) continue;
    // 取第一个分句作为摘要
    const first = text.split(/[———；;。!！?？,，]/)[0].trim();
    const cleaned = cleanTerm(first).replace(/^[-·\s]+/, '').trim();
    if (!cleaned || seen[cleaned]) continue;
    seen[cleaned] = 1;
    items.push(cleaned.length > 45 ? cleaned.slice(0, 45) + '…' : cleaned);
    if (items.length >= 6) break; // 公告最多 6 条
  }
  return items.length ? items : ['本次更新内容'];
}

/* ---------------- ④ 发版同步：四文件一致 + 自动提交推送（--release） ---------------- */

/** 同步 js/config.js：app.version 与 announcements[0] 新公告条目 */
function syncConfigJs(newVersion, items, dateStr) {
  const p = path.join(ROOT, 'js/config.js');
  let src = fs.readFileSync(p, 'utf8');
  // ① app.version（替换第一处 version: 'x.y.z'，即 app 对象内）
  src = src.replace(/(version:\s*')\d+\.\d+\.\d+(')/, '$1' + newVersion + '$2');
  // ② announcements 头部插入新公告条目（version 同步 + 玩家向 notes）
  const notes = items.map((it) => "        '" + String(it).replace(/'/g, "\\'") + "',").join('\n');
  const entry =
    "    {\n" +
    "      version: '" + newVersion + "',\n" +
    "      date: '" + dateStr + "',\n" +
    "      title: '更新公告',\n" +
    "      notes: [\n" +
    notes + '\n' +
    "      ],\n" +
    "    },\n";
  src = src.replace(/announcements:\s*\[/, 'announcements: [\n' + entry);
  fs.writeFileSync(p, src, 'utf8');
  console.log('已同步 js/config.js：app.version=' + newVersion + '，announcements[0] 插入 v' + newVersion + ' 公告');
}

/** 同步 sw.js：CACHE_NAME 代码版本 */
function syncSwJs(newVersion) {
  const p = path.join(ROOT, 'sw.js');
  let src = fs.readFileSync(p, 'utf8');
  src = src.replace(/sdv-guide-v[\d.]+/, 'sdv-guide-v' + newVersion);
  fs.writeFileSync(p, src, 'utf8');
  console.log('已同步 sw.js：CACHE_NAME=sdv-guide-v' + newVersion);
}

/** 校验四文件版本一致（announcements[0].version == latestVersion 是 Actions 阻断项） */
function verifyConsistency(newVersion) {
  const v = readJson(VERSION_FILE);
  const n = readJson(NOTICE_FILE);
  const cfg = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const checks = [];
  checks.push(['version.json.latestVersion', v.latestVersion === newVersion]);
  checks.push(['notice.json.version', n.version === newVersion]);
  checks.push(['config.js app.version', new RegExp("version:\\s*'" + newVersion + "'").test(cfg)]);
  checks.push(['config.js announcements[0].version', new RegExp("announcements:\\s*\\[[\\s\\S]*?version:\\s*'" + newVersion + "'").test(cfg)]);
  checks.push(['sw.js CACHE_NAME', sw.includes('sdv-guide-v' + newVersion)]);
  const bad = checks.filter((c) => !c[1]);
  if (bad.length) {
    throw new Error('版本一致性校验失败：' + bad.map((b) => b[0]).join('、') + ' 未同步到 ' + newVersion);
  }
  console.log('四文件版本一致性校验通过：version.json / notice.json / config.js / sw.js 均为 v' + newVersion);
}

/** 自动提交并推送发版（release: vX.Y.Z 同步发版） */
function gitReleaseCommitPush(newVersion, desc) {
  git('add version.json notice.json js/config.js sw.js');
  const msg = 'release: v' + newVersion + ' 同步发版——' + String(desc || '更新').slice(0, 120);
  git('commit -m "' + msg.replace(/"/g, "'") + '"');
  console.log('已提交：' + msg);
  try {
    git('push origin main');
    console.log('已推送 origin main（推送即发版完成）');
  } catch (e) {
    console.log('⚠️ 推送失败（可能为网络问题或远端有新提交）：请手动执行 git push origin main。');
  }
}

/* ---------------- 主流程 ---------------- */

function main() {
  const args = process.argv.slice(2);
  const forced = args.find((a) => /^(--major|--minor|--patch)$/.test(a));
  const forcedType = forced ? forced.slice(2) : null;
  const isPushMode = args.includes('--push');
  const isReleaseMode = args.includes('--release'); // --release 隐含 --push：完整发版闭环

  // 读取旧版本号（以 version.json 为准）
  const versionData = readJson(VERSION_FILE);
  const oldVersion = String(versionData.latestVersion || '').trim();
  if (!oldVersion) throw new Error('version.json 缺少 latestVersion');

  // ① 读取改动清单（--push / --release：上次发版以来的全部提交；默认：最近一次提交）
  const range = (isPushMode || isReleaseMode) ? getReleaseRange() : null;
  const changeSet = getChangeSet(range);
  console.log('本次改动文件：' + (changeSet.files.length ? changeSet.files.map((f) => f.file).join('、') : '（无）'));
  console.log('提交信息：' + changeSet.message);
  if (isPushMode || isReleaseMode) {
    console.log('判定范围：' + (range || '(未提交改动)'));
    if (!isReleaseNeeded(changeSet.files)) {
      console.log('本次改动仅含文档/公告/测试/脚本类文件，无需发版。');
      return;
    }
  }

  // ② 类型判定
  let type, reason;
  if (forcedType) {
    type = forcedType;
    reason = '命令行显式指定 --' + type;
  } else {
    const judged = judgeType(changeSet);
    type = judged.type;
    reason = judged.reason;
  }
  const typeNames = { major: '主版本 MAJOR', minor: '次版本 MINOR', patch: '修订号 PATCH' };

  // ③ 递增
  const newVersion = bumpVersion(oldVersion, type);

  // ④ 公告摘要
  const items = buildSummaryItems(changeSet.message);
  const title = '星露谷攻略 v' + newVersion + ' 更新';
  const desc = items[0] || '本次更新内容';

  // ⑤ 写入 version.json
  versionData.latestVersion = newVersion;
  versionData.updateDesc = desc;
  writeJson(VERSION_FILE, versionData);

  // ⑥ 写入 notice.json（覆盖为本次版本公告）
  const noticeData = readJson(NOTICE_FILE);
  noticeData.version = newVersion;
  noticeData.title = title;
  noticeData.items = items;
  writeJson(NOTICE_FILE, noticeData);

  // ⑦ 输出结果
  const divider = '========================================';
  console.log('');
  console.log(divider);
  console.log('【改动类型判定】' + typeNames[type]);
  console.log('判定依据：' + reason);
  console.log('');
  console.log('【旧版号】' + oldVersion);
  console.log('【新版号】' + newVersion);
  console.log('');
  console.log('【更新公告】');
  console.log(newVersion);
  console.log(title);
  console.log(today());
  items.forEach((it) => console.log('- ' + it));
  console.log('');
  console.log('【提交备注建议】');
  console.log('release: v' + newVersion + ' 同步发版——' + desc);
  console.log(divider);
  console.log('');
  console.log('已更新：version.json（latestVersion=' + newVersion + '）、notice.json（公告同步为本次版本）');

  // ⑧ --release：推送即发版闭环（四文件同步 + 自动提交推送）
  if (isReleaseMode) {
    syncConfigJs(newVersion, items, today());
    syncSwJs(newVersion);
    verifyConsistency(newVersion);
    gitReleaseCommitPush(newVersion, desc);
    console.log('');
    console.log('✅ 推送即发版完成：v' + oldVersion + ' → v' + newVersion + '（四文件同步 + 公告 + 已推送）');
  } else {
    console.log('提示：发布前请同步 js/config.js 的 app.version 与 sw.js 的 CACHE_NAME 为 v' + newVersion + '（脚本不自动修改）。');
    console.log('脚本不执行 git 提交与推送，改动已留在工作区，由你确认后自行提交。');
  }
}

main();
