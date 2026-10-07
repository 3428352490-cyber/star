'use strict';
/**
 * ============================================================
 * 版本号自动判定与更新脚本（仅处理版本号逻辑，不改动网站 UI / 页面功能）
 *
 * ⚠️ 完整规则文档：项目根目录 VERSION-RULES.md（后续 AI / 开发者必须先读该文档）
 *    本文件头部注释为本脚本自包含说明，规则以 VERSION-RULES.md 为权威。
 *
 * 语义化版本号 MAJOR.MINOR.PATCH（主版本.次版本.修订号）
 * 规则：
 *   1. PATCH（第三位 +0.0.1）：小改动 / bug 修复 / 素材微调 / 文案修改
 *      例：1.0.9 → 1.0.10
 *   2. MINOR（第二位 +0.1.0）：新增页面 / 新增独立模块（向下兼容），修订号归零
 *      例：1.0.10 → 1.1.0
 *   3. MAJOR（第一位 +1.0.0）：颠覆性重构 / 不兼容旧数据 / 底层架构大规模改动，其余归零
 *      例：1.1.0 → 2.0.0
 *
 * 执行逻辑：
 *   ① 读取本次提交的改动清单（git diff），判断改动类型；
 *   ② 按改动类型自动选择版本号递增规则；
 *   ③ 自动更新 version.json 内版本号 + config.js / sw.js 版本 + 本次更新公告
 *      （config.js announcements 头部 + notice.json）；
 *   ④ 输出【改动类型判定】【旧版号】【新版号】【更新公告】，用于 GitHub 提交备注。
 *
 * 约束：
 *   - 仅做版本判断、更新版本文件、生成公告摘要；不自动执行 git 推送；
 *   - 严格区分改动等级，禁止乱跳版本号（可 --type 显式指定覆盖自动判定）；
 *   - 不添加浏览器自动化 / 页面渲染测试代码。
 *
 * 用法：
 *   node scripts/version-bump.js [--type=auto|patch|minor|major] [--note="摘要"]
 *                                 [--scope=worktree|pushed] [--dry-run]
 *   --type    auto=启发式自动判定（默认）；patch/minor/major=强制指定类型
 *   --note    本次更新摘要（用于公告；缺省自动按类型生成）
 *   --scope   worktree=未提交工作区改动（git diff HEAD，默认）；
 *             pushed=未推送提交（git diff origin/main..HEAD）
 *   --dry-run 仅输出判定结果，不写任何文件
 * ============================================================
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

/* ---------- 版本文件路径 ---------- */
const FILES = {
  configJs: path.join(ROOT, 'js', 'config.js'),
  swJs: path.join(ROOT, 'sw.js'),
  versionJson: path.join(ROOT, 'version.json'),
  noticeJson: path.join(ROOT, 'notice.json'),
};

/* ---------- 工具：执行 git 并解析输出 ---------- */
function git(args) {
  try {
    return execFileSync('git', ['-C', ROOT].concat(args), { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    throw new Error('git 执行失败：git ' + args.join(' ') + '\n' + (e.stderr || e.message));
  }
}

/** 读取当前版本号（version.json latestVersion 为权威，与 config.js 交叉校验） */
function readCurrentVersion() {
  const verJson = JSON.parse(fs.readFileSync(FILES.versionJson, 'utf8'));
  const latest = String(verJson.latestVersion || '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(latest)) throw new Error('version.json latestVersion 非法：' + latest);
  const cfgSrc = fs.readFileSync(FILES.configJs, 'utf8');
  const cfgVer = (cfgSrc.match(/name: '星露谷攻略',\s*\n\s*version: '([\d.]+)'/) || [])[1];
  if (cfgVer && cfgVer !== latest) {
    throw new Error('版本不一致：config.js=' + cfgVer + ' version.json=' + latest + '，请先人工核对');
  }
  return latest;
}

/* ---------- ① 读取本次提交的改动清单 ---------- */
/**
 * 解析 `git diff --numstat` 输出 → 结构化改动清单
 * 每行：added\tdeleted\tpath（新增文件 added 为行数；删除文件 deleted 为行数；二进制为 -）
 */
function parseNumstat(text) {
  const files = [];
  let totalAdded = 0;
  let totalDeleted = 0;
  text.split('\n').forEach((line) => {
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!m) return;
    const added = m[1] === '-' ? 0 : parseInt(m[1], 10);
    const deleted = m[2] === '-' ? 0 : parseInt(m[2], 10);
    files.push({ name: m[3], added, deleted });
    totalAdded += added;
    totalDeleted += deleted;
  });
  return { files, totalAdded, totalDeleted };
}

/** 收集新增/删除文件清单（供类型判定：新增独立模块 / 大规模删除） */
function collectStatusFiles() {
  const added = git(['diff', 'HEAD', '--diff-filter=A', '--name-only']).split('\n').filter(Boolean);
  const deleted = git(['diff', 'HEAD', '--diff-filter=D', '--name-only']).split('\n').filter(Boolean);
  return { added, deleted };
}

/** 读取本次改动清单（scope 决定 git diff 范围） */
function collectChanges(scope) {
  let numstatText;
  if (scope === 'pushed') {
    // 未推送提交：相对远程 main（要求本地已 fetch；无远程时回退 worktree）
    try {
      git(['rev-parse', '--verify', 'origin/main']);
      numstatText = git(['diff', 'origin/main..HEAD', '--numstat']);
    } catch (e) {
      console.warn('[提示] 无 origin/main 引用，回退读取工作区改动（git diff HEAD）');
      numstatText = git(['diff', 'HEAD', '--numstat']);
    }
  } else {
    numstatText = git(['diff', 'HEAD', '--numstat']);
  }
  const changes = parseNumstat(numstatText);
  const status = collectStatusFiles();
  changes.addedFiles = status.added;
  changes.deletedFiles = status.deleted;
  return changes;
}

/* ---------- ② 改动类型判定（严格分级，防乱跳版本） ---------- */
/**
 * 启发式判定：优先级 MAJOR > MINOR > PATCH（PATCH 为默认兜底）
 * 依据：提交说明关键词（--note / 最近提交信息）→ 文件结构（新增独立脚本/目录）→ 改动规模阈值
 * @param {object} changes 改动清单 { files, totalAdded, totalDeleted, addedFiles, deletedFiles }
 * @param {object} opts { note, commitHint } commitHint=最近提交说明（可选）
 * @returns {{ type: 'patch'|'minor'|'major', reasons: string[] }}
 */
function classifyChanges(changes, opts) {
  opts = opts || {};
  const note = String(opts.note || opts.commitHint || '');
  const reasons = [];

  /* MAJOR 线索：颠覆性重构 / 不兼容 / 底层大规模改动 */
  if (/(重构|重写|颠覆|不兼容|breaking|架构|大规模|migration|rewrite)/i.test(note)) {
    reasons.push('提交说明含重构/不兼容关键词');
  }
  const total = changes.totalAdded + changes.totalDeleted;
  if (total >= 3000 && changes.files.length >= 5) {
    reasons.push('改动规模大（约 ' + total + ' 行，' + changes.files.length + ' 个文件），疑似大规模重构');
  }
  if (changes.deletedFiles.length >= 5) {
    reasons.push('删除文件 ' + changes.deletedFiles.length + ' 个，涉及旧结构移除');
  }
  const hasMajor = reasons.length > 0;

  /* MINOR 线索：新增独立模块 / 新增页面（向下兼容） */
  const minorReasons = [];
  /* 新增独立脚本：仅统计业务代码新增（js/ 下），开发工具（scripts/）与测试（tests/）不算新功能模块 */
  const addedJs = changes.files.filter((f) =>
    /\.js$/.test(f.name) && !/^(scripts|tests|helpers)\//.test(f.name) && f.added >= 150
  );
  if (addedJs.length > 0) {
    minorReasons.push('新增独立脚本文件 ' + addedJs.length + ' 个（新模块/新页面逻辑）');
  }
  /* 新增目录线索：仅统计项目已知顶层目录之外的全新目录（tests/ scripts/ 等常规目录不算） */
  const KNOWN_TOP_DIRS = ['tests', 'scripts', 'assets', 'css', 'js', 'data'];
  const addedNewDirs = changes.addedFiles
    .map((f) => f.split('/')[0])
    .filter((seg, i, arr) => arr.indexOf(seg) === i)
    .filter((seg) => KNOWN_TOP_DIRS.indexOf(seg) === -1);
  if (addedNewDirs.length > 0) {
    minorReasons.push('新增目录：' + addedNewDirs.join(' / '));
  }
  if (!hasMajor && total >= 800) {
    minorReasons.push('改动规模中等（约 ' + total + ' 行）');
  }
  /* note 关键词仅作弱线索：需配合真实新模块文件或中等规模才触发 MINOR（防误判工具/文案改动） */
  const noteHasFeature = /(新增|新页面|新模块|新功能|独立模块|feature)/i.test(note);
  if (noteHasFeature && (addedJs.length > 0 || total >= 800)) {
    minorReasons.push('提交说明含新增功能关键词，且检测到独立模块/中等规模改动');
  }

  /* 判定：MAJOR 权重最高 → MINOR → PATCH 兜底 */
  let type = 'patch';
  if (hasMajor) {
    type = 'major';
  } else if (minorReasons.length > 0) {
    type = 'minor';
  } else if (total > 0) {
    reasons.push('小改动 / bug 修复 / 文案或素材微调（约 ' + total + ' 行，' + changes.files.length + ' 个文件）');
    if (noteHasFeature) {
      reasons.push('提示：提交说明含「新增」关键词但未检测到独立模块文件/中等规模改动，如需 MINOR 请用 --type=minor 指定');
    }
  } else {
    reasons.push('未检测到改动（清单为空），默认按 PATCH 处理');
  }
  return { type, reasons: hasMajor ? reasons : minorReasons.concat(reasons) };
}

/* ---------- 版本号递增算法 ---------- */
/**
 * 语义化版本递增：PATCH +0.0.1 / MINOR +0.1.0（修订归零）/ MAJOR +1.0.0（其余归零）
 * @param {string} cur 当前版本号（如 '2.4.24'）
 * @param {'patch'|'minor'|'major'} type 递增类型
 * @returns {string} 新版本号
 */
function bumpVersion(cur, type) {
  const parts = cur.split('.').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error('版本号非法（需 MAJOR.MINOR.PATCH）：' + cur);
  }
  const [major, minor, patch] = parts;
  switch (type) {
    case 'patch': return major + '.' + minor + '.' + (patch + 1);
    case 'minor': return major + '.' + (minor + 1) + '.0';
    case 'major': return (major + 1) + '.0.0';
    default: throw new Error('未知递增类型：' + type);
  }
}

/* ---------- ③ 更新公告 / 版本文件 ---------- */
const TYPE_TITLE = {
  major: { title: '重大版本更新', desc: '本次为底层重大更新，可能存在不兼容旧数据的情况' },
  minor: { title: '功能更新', desc: '新增页面 / 独立模块，功能与内容更新' },
  patch: { title: '补丁更新', desc: '小改动与问题修复，优化使用体验' },
};

/** 生成更新公告（标题 + 摘要条目） */
function buildAnnouncement(type, oldVer, newVer, note) {
  const info = TYPE_TITLE[type] || TYPE_TITLE.patch;
  const items = [];
  if (note) {
    items.push(String(note).trim());
    items.push(info.desc);
  } else {
    items.push(info.desc);
    items.push('版本号自动递增：v' + oldVer + ' → v' + newVer + '（' + info.title + '）');
  }
  return {
    version: newVer,
    title: info.title,
    updateDesc: items[0],
    items,
  };
}

/** 更新 version.json（latestVersion / updateDesc；保留 downloadUrl） */
function writeVersionJson(ann) {
  const json = JSON.parse(fs.readFileSync(FILES.versionJson, 'utf8'));
  json.latestVersion = ann.version;
  json.updateDesc = ann.updateDesc;
  fs.writeFileSync(FILES.versionJson, JSON.stringify(json, null, 2) + '\n', 'utf8');
}

/** 更新 notice.json（version / title / items） */
function writeNoticeJson(ann) {
  const notice = {
    version: ann.version,
    title: '星露谷攻略 v' + ann.version + ' 更新',
    items: ann.items,
  };
  fs.writeFileSync(FILES.noticeJson, JSON.stringify(notice, null, 2) + '\n', 'utf8');
}

/** 更新 js/config.js：app.version + announcements 头部追加本次公告条目 */
function writeConfigJs(ann) {
  let src = fs.readFileSync(FILES.configJs, 'utf8');
  // ① app.version
  const verRe = /(app: \{\s*\n\s*name: '星露谷攻略',\s*\n\s*version: ')[\d.]+(')/;
  if (!verRe.test(src)) throw new Error('config.js 未找到 app.version（发布结构变化，请人工核对）');
  src = src.replace(verRe, '$1' + ann.version + '$2');
  // ② announcements 头部插入本次公告条目
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const notesStr = ann.items.map((it) => "        '" + it.replace(/'/g, "\\'") + "',").join('\n');
  const entry = '    {\n' +
    "      version: '" + ann.version + "',\n" +
    "      date: '" + yyyy + '-' + mm + '-' + dd + "',\n" +
    "      title: '" + ann.title + "',\n" +
    '      notes: [\n' + notesStr + '\n      ],\n' +
    '    },\n';
  const annRe = /(announcements: \[\r?\n)/; // 兼容 LF / CRLF 行尾
  if (!annRe.test(src)) throw new Error('config.js 未找到 announcements 数组（结构变化，请人工核对）');
  src = src.replace(annRe, '$1' + entry);
  fs.writeFileSync(FILES.configJs, src, 'utf8');
}

/** 更新 sw.js：CACHE_NAME 版本（缓存版本必须与代码版本一致） */
function writeSwJs(ver) {
  let src = fs.readFileSync(FILES.swJs, 'utf8');
  const re = /(CACHE_NAME = 'sdv-guide-v)[\d.]+(')/;
  if (!re.test(src)) throw new Error('sw.js 未找到 CACHE_NAME（结构变化，请人工核对）');
  fs.writeFileSync(FILES.swJs, src.replace(re, '$1' + ver + '$2'), 'utf8');
}

/* ---------- ④ 输出 ---------- */
/** 输出四段结果：改动类型判定 / 旧版号 / 新版号 / 更新公告 */
function printResult(type, reasons, oldVer, newVer, ann) {
  const line = '='.repeat(52);
  console.log('\n' + line);
  console.log('【改动类型判定】' + TYPE_TITLE[type].title + '（' + type.toUpperCase() + '）');
  reasons.forEach((r) => console.log('  - ' + r));
  console.log(line);
  console.log('【旧版号】v' + oldVer);
  console.log('【新版号】v' + newVer);
  console.log(line);
  console.log('【更新公告】' + ann.title + ' v' + newVer);
  ann.items.forEach((it) => console.log('  · ' + it));
  console.log(line);
}

/* ---------- CLI 入口 ---------- */
function parseArgs(argv) {
  const opts = { type: 'auto', scope: 'worktree', note: '', dryRun: false };
  argv.forEach((a) => {
    if (a === '--dry-run') { opts.dryRun = true; return; } // 纯 flag（无 = 值）
    const m = a.match(/^--([\w-]+)=(.*)$/);
    if (!m) return;
    const key = m[1];
    const val = m[2];
    if (key === 'type') opts.type = val;
    else if (key === 'scope') opts.scope = val;
    else if (key === 'note') opts.note = val;
  });
  if (!['auto', 'patch', 'minor', 'major'].includes(opts.type)) {
    throw new Error('--type 仅支持 auto | patch | minor | major');
  }
  if (!['worktree', 'pushed'].includes(opts.scope)) {
    throw new Error('--scope 仅支持 worktree | pushed');
  }
  return opts;
}

/** 主流程（CLI 调用；require 时不执行） */
function run(argv) {
  const opts = parseArgs(argv);
  const oldVer = readCurrentVersion();
  const changes = collectChanges(opts.scope);

  let type = opts.type;
  let reasons = [];
  if (opts.type === 'auto') {
    const classified = classifyChanges(changes, { note: opts.note });
    type = classified.type;
    reasons = classified.reasons;
  } else {
    reasons = ['--type 显式指定为 ' + type.toUpperCase()];
  }

  const newVer = bumpVersion(oldVer, type);
  const ann = buildAnnouncement(type, oldVer, newVer, opts.note);
  printResult(type, reasons, oldVer, newVer, ann);

  if (opts.dryRun) {
    console.log('[dry-run] 未写入任何文件；如需生效请去掉 --dry-run 重新执行');
    return { oldVer, newVer, type, ann, written: [] };
  }

  writeVersionJson(ann);
  writeNoticeJson(ann);
  writeConfigJs(ann);
  writeSwJs(newVer);
  console.log('已更新文件：js/config.js（app.version + 公告头部） / sw.js（CACHE_NAME） / version.json / notice.json');
  console.log('建议提交备注：release: v' + newVer + ' ' + ann.title + '——' + ann.updateDesc);
  return { oldVer, newVer, type, ann, written: [FILES.configJs, FILES.swJs, FILES.versionJson, FILES.noticeJson] };
}

/* 模块导出（供测试 / 其他流程复用） */
module.exports = {
  ROOT,
  parseVersion: (v) => v.split('.').map((x) => parseInt(x, 10)),
  bumpVersion,
  classifyChanges,
  buildAnnouncement,
  parseNumstat,
  readCurrentVersion,
  run,
};

/* CLI 执行入口：仅直接运行时执行（require 不触发） */
if (require.main === module) {
  try {
    run(process.argv.slice(2));
  } catch (e) {
    console.error('[version-bump] 执行失败：' + (e && e.message ? e.message : e));
    process.exit(1);
  }
}
