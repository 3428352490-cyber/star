'use strict';

/**
 * ============================================================
 * DevAdmin（v2.4.7 开发者管理系统，纯前端）
 *
 * 单一开发者账号（StarBOSS / 20261005），登录态独立于游客体系：
 * - 登录成功 → localStorage 保存 devLogin，开启 devMode
 *   · 每个页面右上角出现全局【编辑】按钮（未登录/游客完全隐藏）
 *   · 编辑模式：文字板块可点击选中 → 改文本 / 切像素字体模板 / 调字号；
 *     右上角【编辑】替换为【保存】【重置】
 *   · 保存：本次修改写入本地存储并实时预览；重置：放弃改动恢复原始
 *   · 解锁「我的」页开发者管理面板（一键上传GitHub + 背景锁定（本地））
 *   · 抛出 sdv-dev-state-change 事件通知 background.js 联动
 * - 登出 → 清除登录态，隐藏全部开发者入口/编辑控件/上传按钮，恢复访客状态
 *
 * 管理面板「一键上传GitHub」：
 * - Token 存 localStorage；把本地已保存的页面修改内容一次性提交到 main 分支（仅 page-content.json）
 * - 提交前弹确认弹窗展示本次修改摘要，防止误提交；不损坏仓库原有文件
 * - v2.5.2：背景锁定为本地功能，不再随页面上传（上传模块已删除）；
 *   网络无法直连 api.github.com 时可「导出JSON下载」→ GitHub 网页端手动上传覆盖
 *
 * 跨端同步：本地修改存 localStorage（sdv-guide:devadmin:page_edit），
 * 同一浏览器多标签页 / 重进页面 / H5 与 WebView 共 profile 时同步读取，
 * 并监听 storage 事件实现跨标签页即时同步。
 *
 * 事件约定：
 * - window 'sdv-dev-state-change'  { dev: boolean }   登录/登出后抛出
 * - window 'sdv-bg-lock-change'    { locked: boolean } background.js 写入锁定后抛出
 * - window 'sdv-page-edit-change'  { applied: boolean } 页面编辑保存/重置后抛出
 * ============================================================
 */
const DevAdmin = (() => {
  const NS = 'sdv-guide:devadmin:';
  const CRED = { user: 'StarBOSS', pass: '20261005' };

  /* ---------- 基础读写 ---------- */
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(NS + key, JSON.stringify(val)); } catch (e) {}
  }
  function remove(key) {
    try { localStorage.removeItem(NS + key); } catch (e) {}
  }

  /* ---------- 登录状态（鉴权逻辑保持不变） ---------- */
  function getDevLogin() { return read('login', null); }
  function isDev() { return !!getDevLogin(); }

  /** 登录校验：仅 StarBOSS / 20261005 一组；其余任意组合恒失败 */
  function login(user, pass) {
    if (user === CRED.user && pass === CRED.pass) {
      write('login', { user: CRED.user, loggedAt: Date.now() });
      dispatchDevChange(true);
      return true;
    }
    return false;
  }

  function logout() {
    remove('login');
    // 退出开发者模式：清除残留背景锁定与编辑模式，恢复访客状态
    try { localStorage.removeItem('sdv_bg_lock'); } catch (e) {}
    exitEditMode(true);
    dispatchDevChange(false);
  }

  function dispatchDevChange(dev) {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('sdv-dev-state-change', { detail: { dev: !!dev } }));
    }
  }

  /* ---------- GitHub Token ---------- */
  function getGitHubToken() { return read('github_token', ''); }
  function setGitHubToken(t) { write('github_token', String(t || '').trim()); }

  /* ---------- GitHub 仓库配置（可由管理员在面板内修改并保存） ---------- */
  function getGitHubRepo() {
    return read('github_repo', {
      owner: 'stardew-guide',
      repo: 'stardew-guide',
      branch: 'main',
      jsonPath: 'data/page-content.json',
    });
  }
  function setGitHubRepo(cfg) {
    write('github_repo', Object.assign(
      { owner: '', repo: '', branch: 'main', jsonPath: 'data/page-content.json' },
      cfg || {}
    ));
  }

  /** 无缓存请求头：绕过浏览器与 GitHub Pages CDN 缓存，确保读取 data/page-content.json 总是拿最新内容 */
  /** 无缓存请求头：绕过浏览器与 GitHub Pages CDN 缓存，确保读取 data/page-content.json 总是拿最新内容 */
  const NO_CACHE_HEADERS = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  };

  /**
   * 一键提交推送：把本地已保存的「网页文本类 JSON 数据」提交到 GitHub 仓库 main 分支。
   * @param {object} opts { note, payload }
   * @returns {Promise<{ok:boolean, message:string, raw?:string, commitUrl?:string}>}
   */
  async function pushToGitHub(opts) {
    const o = opts || {};
    // 网页上传 commit 描述强制带「网页提交」关键词，触发 .github/workflows 过滤规则：
    // Actions 检测到该关键词会跳过版本 bump，机器人不再自动递增、不生成 version.json 提交。
    const rawNote = String(o.note || '').trim();
    const note = rawNote
      ? ('网页提交: ' + rawNote)
      : 'chore(网页提交): auto update ' + new Date().toISOString();
    const token = getGitHubToken();
    if (!token) return { ok: false, message: '请先填写 GitHub Token' };

    const repo = getGitHubRepo();
    if (!repo.owner || !repo.repo || !repo.jsonPath) {
      return { ok: false, message: '请先配置 GitHub 仓库信息（owner / repo / jsonPath）' };
    }
    if (!o.payload || typeof o.payload !== 'object') {
      return { ok: false, message: '没有可提交的 JSON 数据' };
    }

    const base = 'https://api.github.com';
    // 校验 API 域名必须为 api.github.com，防止误请求到网页域名（github.com 等返回 HTML）
    if (!/^https:\/\/api\.github\.com$/.test(base)) {
      return { ok: false, message: 'GitHub API 域名异常，必须使用 api.github.com' };
    }
    const authHeaders = {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
    };

    try {
      // ① 读取远程页面内容 JSON：获取 sha 与合并基底（弱网/拦截自动重试）
      const remotePage = await readRemoteFile(repo.jsonPath, token, base, authHeaders);

      // ② 组装页面内容载荷（v2.5.2：背景锁定配置不再随页面上传，仅提交页面内容 JSON）
      const pagePayload = buildPageContentPayload(remotePage.base);

      // ③ 提交页面内容 JSON（PUT 幂等，同 sha 重试安全）
      const putPage = await putFileToGitHub(repo.jsonPath, pagePayload, note, remotePage.sha, token, base, authHeaders);
      if (!putPage.ok) return putPage;
      return {
        ok: true, message: '提交成功：' + note,
        commitUrl: putPage.commitUrl,
        files: [repo.jsonPath],
      };
    } catch (e) {
      // 兜底异常分类：网络拦截/域名错误(html)、Token权限不足(token)、本地JSON格式错误(json)、网络异常(net)
      return uploadErr(e);
    }
  }

  /**
   * 读取远程单文件（无认证优先 → 带 Token 回退；404 视为文件不存在直接创建）。
   * @returns {Promise<{sha:string, base:object|null}>}
   */
  async function readRemoteFile(path, token, base, authHeaders) {
    const repo = getGitHubRepo();
    const readUrl = base + '/repos/' + encodeURIComponent(repo.owner) + '/' +
      encodeURIComponent(repo.repo) + '/contents/' +
      encodeURIComponent(path) +
      '?ref=' + encodeURIComponent(repo.branch || 'main') + '&t=' + Date.now();
    // 0) 无认证优先读取（v2.4.16）：公开仓库无需 Token 即可读取 sha，
    //    可绕过部分网络/代理对「带认证请求」的路径级拦截规则；
    //    私有仓库或读取失败时自动回退到带 Token 流程。
    const anonRes = await fetchTimeout(
      readUrl,
      { headers: { 'Accept': 'application/vnd.github+json' }, redirect: 'manual' },
      15000
    );
    if (anonRes.ok) {
      try {
        const anonData = await safeJsonWithCheck(anonRes);
        if (anonData && anonData.sha) {
          return { sha: anonData.sha, base: parseRemoteContent(anonData) };
        }
      } catch (anonErr) {
        // 无认证读取异常（HTML 拦截 / JSON 异常）不阻塞，继续走带 Token 流程
        if (anonErr.__class !== 'html' && anonErr.__class !== 'json') throw anonErr;
      }
    }
    // 1) 带 Token 读取（私有仓库 / 文件不存在判断 / 无认证被拦）
    const got = await withRetry(function () {
      return fetchTimeout(
        readUrl,
        { headers: Object.assign({}, authHeaders, NO_CACHE_HEADERS), redirect: 'manual' },
        15000
      ).then(async function (fileRes) {
        if (fileRes.type === 'opaqueredirect' || fileRes.status === 301 || fileRes.status === 302 || fileRes.status === 307 || fileRes.status === 308) {
          throw apiErr('token', 'GitHub API 重定向（Token 失效或未授权）：请重新生成有 contents 权限的 Token 再试');
        }
        if (fileRes.status === 401 || fileRes.status === 403) {
          throw apiErr('token', 'Token 权限不足：请检查 GitHub Personal Access Token 是否有效且具备 contents 写权限');
        }
        if (fileRes.status === 404) return { sha: '', base: null }; // 文件不存在则直接创建
        if (fileRes.ok) {
          const got = await safeJsonWithCheck(fileRes);
          return { sha: (got && got.sha) || '', base: parseRemoteContent(got) };
        }
        throw apiErr('other', '获取文件失败（' + fileRes.status + '）：请检查 Token 权限与仓库配置');
      });
    }, 3);
    return got;
  }

  /**
   * 提交 / 创建单个远程文件（弱网/拦截自动重试；PUT 幂等，同 sha 重试安全）。
   * @param {string} path 远程文件路径（如 data/page-content.json）
   * @param {object} payload 载荷对象
   * @param {string} note commit 描述
   * @param {string} sha 远程文件现有 sha（新建文件传 ''）
   * @returns {Promise<{ok:boolean, message:string, commitUrl?:string, status?:number, raw?:string}>}
   */
  async function putFileToGitHub(path, payload, note, sha, token, base, authHeaders) {
    const repo = getGitHubRepo();
    const body = {
      message: note,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2)))),
      branch: repo.branch || 'main',
    };
    if (sha) body.sha = sha;
    try {
      const pr = await withRetry(function () {
        return fetchTimeout(
          base + '/repos/' + encodeURIComponent(repo.owner) + '/' +
          encodeURIComponent(repo.repo) + '/contents/' +
          encodeURIComponent(path),
          { method: 'PUT', headers: Object.assign({}, authHeaders, { 'Content-Type': 'application/json' }), body: JSON.stringify(body), redirect: 'manual' },
          15000
        ).then(async function (putRes) {
          if (putRes.type === 'opaqueredirect' || putRes.status === 301 || putRes.status === 302 || putRes.status === 307 || putRes.status === 308) {
            throw apiErr('token', 'GitHub API 重定向（Token 失效或未授权）：请重新生成有 contents 权限的 Token 再试');
          }
          if (putRes.status === 401 || putRes.status === 403) {
            throw apiErr('token', 'Token 权限不足：请检查 GitHub Personal Access Token 是否有效且具备 contents 写权限');
          }
          if (putRes.ok || putRes.status === 422 || putRes.status === 409) {
            let pd = {};
            try { pd = await safeJsonWithCheck(putRes); } catch (pe) { throw pe; }
            return { res: putRes, data: pd };
          }
          return { res: putRes, data: {} };
        });
      }, 3);
      if (pr.res.ok) {
        return { ok: true, message: '提交成功：' + path, commitUrl: pr.data.commit && pr.data.commit.url };
      }
      // ③ 区分错误类型（401/403 Token 权限不足已前置处理）
      if (pr.res.status === 409) {
        return { ok: false, message: '文件冲突：远程文件已被修改（' + path + '），请刷新后重试，不会损坏仓库原有文件', raw: JSON.stringify(pr.data) };
      }
      if (pr.res.status === 422) {
        return { ok: false, message: '提交内容无效（' + path + '）：' + ((pr.data && pr.data.message) || ''), raw: JSON.stringify(pr.data) };
      }
      return { ok: false, message: '提交失败（' + pr.res.status + '）：' + ((pr.data && pr.data.message) || '未知错误'), raw: JSON.stringify(pr.data) };
    } catch (pe) {
      return uploadErr(pe);
    }
  }

  async function safeJson(res) {
    try { return await res.json(); } catch (e) { return {}; }
  }

  /**
   * 备用上传通道 · 基础设施 1：带超时的 fetch（v2.4.15）。
   * AbortController 中断弱网下的挂起请求；超时视为网络异常（可自动重试）。
   * 说明：GitHub contents API 无官方备用域名，第三方 CORS 代理会泄露 Token，
   * 故以「超时 + 自动重试 + 连通自检」作为备用通道，不接入任何代理。
   */
  function fetchTimeout(url, opts, ms) {
    const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctl ? setTimeout(function () { try { ctl.abort(); } catch (e) {} }, ms || 15000) : null;
    const merged = ctl ? Object.assign({}, opts || {}, { signal: ctl.signal }) : (opts || {});
    return fetch(url, merged).then(function (res) {
      if (timer) clearTimeout(timer);
      return res;
    }, function (err) {
      if (timer) clearTimeout(timer);
      const e = new Error('网络超时或连接中断：' + ((err && err.name === 'AbortError') ? '请求超时' : '无法连接'));
      e.__class = 'net';
      throw e;
    });
  }

  /**
   * 备用上传通道 · 基础设施 2：通用自动重试（最多 attempts 次，间隔递增）。
   * 可重试错误：网络异常(net) / HTML 拦截(html) / JSON 格式错误(json)；
   * Token 失效(token) 与业务状态码错误不重试（避免无意义循环）。
   */
  async function withRetry(asyncFn, attempts) {
    let lastErr;
    const max = Math.max(1, attempts || 3);
    for (let i = 0; i < max; i++) {
      try {
        return await asyncFn(i);
      } catch (e) {
        lastErr = e;
        const cls = e && e.__class;
        if (cls !== 'net' && cls !== 'html' && cls !== 'json') throw e;
        if (i < max - 1) {
          await new Promise(function (r) { setTimeout(r, 600 * (i + 1)); });
        }
      }
    }
    throw lastErr;
  }

  /** 上传异常统一映射（v2.4.15）：网络异常/HTML拦截/Token/JSON格式/其他 → 失败结果（含诊断信息） */
  function uploadErr(e) {
    const cls = e && e.__class;
    if (cls === 'html') {
      return { ok: false, message: 'GitHub API 请求异常（网络拦截/域名错误）：返回 HTML 而非 JSON。请检查：① Token 是否有效且具备 contents 权限 ② 手机网络能否直连 api.github.com（VPN/代理可能拦截） ③ 是否触发 GitHub 限流（稍后再试）', diag: { kind: 'html', status: e.status || 0, snippet: e.snippet || '', tip: diagnoseHtml(e.snippet, e.status).tip } };
    }
    if (cls === 'token') return { ok: false, message: e.message };
    if (cls === 'json') return { ok: false, message: '本地 JSON 格式错误：' + (e.message || '响应无法解析') };
    if (cls === 'net') return { ok: false, message: '网络异常（网络拦截/域名错误）：无法连接 GitHub API，已自动重试，请检查网络或确认请求域名为 api.github.com' };
    return { ok: false, message: (e && e.message) || '上传失败' };
  }

  /**
   * 网络连通自检（v2.4.15 / 升级 v2.4.16）：两段检测，精准区分根因——
   * 段① api.github.com/rate_limit（无认证）判定「能否直连 GitHub API」；
   * 段② 仓库 contents 路径复现读取（无认证，公开仓库可读）判定「上传路径是否被网络/代理按规则拦截」。
   * 上传失败弹窗内点击「检测网络」按钮触发。
   */
  async function checkGitHubConnectivity() {
    const repo = getGitHubRepo();
    const rate = { ok: false, kind: 'err', status: 0 };
    const contents = { ok: false, kind: 'err', status: 0 };
    // 段① 连通性：rate_limit（无需 Token 即可获得 JSON 响应）
    try {
      const res = await fetchTimeout(
        'https://api.github.com/rate_limit',
        { headers: { 'Accept': 'application/vnd.github+json' }, redirect: 'manual' },
        10000
      );
      const ct = String((res.headers && res.headers.get && res.headers.get('Content-Type')) || '').toLowerCase();
      const text = String(await res.text() || '');
      const looksHtml = /<\s*!doctype|<\s*html/i.test(text);
      if (looksHtml || /html/.test(ct)) {
        rate.ok = false; rate.kind = 'html'; rate.status = res.status;
      } else {
        rate.ok = true; rate.kind = 'json'; rate.status = res.status;
      }
    } catch (e) {
      rate.ok = false; rate.kind = (e && e.__class === 'net') ? 'net' : 'err'; rate.status = 0;
    }
    // 段② 上传路径复现：仓库 contents 读取（无认证；公开仓库返回 JSON；被拦返回 HTML）
    if (repo && repo.owner && repo.repo && repo.jsonPath) {
      try {
        const res = await fetchTimeout(
          'https://api.github.com/repos/' + encodeURIComponent(repo.owner) + '/' +
          encodeURIComponent(repo.repo) + '/contents/' +
          encodeURIComponent(repo.jsonPath) +
          '?ref=' + encodeURIComponent(repo.branch || 'main') + '&t=' + Date.now(),
          { headers: { 'Accept': 'application/vnd.github+json' }, redirect: 'manual' },
        10000
        );
        const ct = String((res.headers && res.headers.get && res.headers.get('Content-Type')) || '').toLowerCase();
        const text = String(await res.text() || '');
        const looksHtml = /<\s*!doctype|<\s*html/i.test(text);
        if (looksHtml || /html/.test(ct)) {
          contents.ok = false; contents.kind = 'html'; contents.status = res.status;
        } else {
          contents.ok = true; contents.kind = 'json'; contents.status = res.status;
        }
      } catch (e) {
        contents.ok = false; contents.kind = (e && e.__class === 'net') ? 'net' : 'err'; contents.status = 0;
      }
    }
    // 汇总结论：三段判断
    if (rate.ok && contents.ok) {
      return { ok: true, kind: 'ok', status: rate.status };
    }
    if (rate.ok && !contents.ok) {
      // 连通但上传路径被拦：代理/网络按路径规则拦截 contents 请求
      return { ok: false, kind: 'path-blocked', status: contents.status };
    }
    if (!rate.ok) {
      return { ok: false, kind: rate.kind, status: rate.status };
    }
    return { ok: false, kind: 'err', status: 0 };
  }

  /** 失败弹窗「检测网络」按钮：执行自检并即时展示结果 */
  async function runNetCheck() {
    const btn = document.querySelector('[data-action="dev-net-check"]');
    const out = document.getElementById('dev-net-result');
    if (!out) return;
    if (btn) { btn.disabled = true; btn.textContent = '检测中…'; }
    out.textContent = '正在检测网络连通性…';
    out.className = 'dev-net-result';
    const r = await checkGitHubConnectivity();
    if (btn) { btn.disabled = false; btn.textContent = '检测网络'; }
    if (r.ok) {
      out.textContent = '✓ 可直连 api.github.com 且上传路径可达（返回 JSON），当前网络可上传，请直接重试';
      out.className = 'dev-net-result ok';
    } else if (r.kind === 'path-blocked') {
      out.textContent = '✗ 网络可直连，但仓库 contents 路径被拦截（返回 HTML）：疑似 VPN/代理/加速类应用的路径规则，请关闭后重试或切换网络';
      out.className = 'dev-net-result bad';
    } else if (r.kind === 'html') {
      out.textContent = '✗ 仍被拦截（返回 HTML）：当前网络无法直连 api.github.com，请切换网络（Wi-Fi / 手机流量 / 代理节点）后重试';
      out.className = 'dev-net-result bad';
    } else if (r.kind === 'net') {
      out.textContent = '✗ 网络不可达或请求超时：请检查网络连接后重试';
      out.className = 'dev-net-result bad';
    } else {
      out.textContent = '✗ 检测失败：' + ((r && r.message) || '未知错误');
      out.className = 'dev-net-result bad';
    }
  }

  /** 构造带异常分类标记的错误（供外层 try-catch 区分三类异常）
   * @param {string} cls 'html' = 网络拦截/域名错误(返回HTML)；'token' = Token权限不足；'json' = 本地JSON格式错误 */
  function apiErr(cls, msg, extra) {
    const e = new Error(msg);
    e.__class = cls;
    if (extra) Object.assign(e, extra);
    return e;
  }

  /**
   * HTML 响应根因诊断（v2.4.14）：按返回内容特征区分拦截页/登录页/限流页/404，
   * 给出针对性操作建议，帮助开发者一次性定位上传失败原因。
   * @param {string} snippet 返回内容片段
   * @param {number} status HTTP 状态码
   * @returns {{kind: string, tip: string}} 诊断结果
   */
  function diagnoseHtml(snippet, status) {
    const s = String(snippet || '').toLowerCase();
    const st = String(status || '');
    if (s.includes('sign in') || s.includes('log in') || s.includes('login')) {
      return { kind: 'token', tip: '返回的是 GitHub 登录页：Token 失效或未授权，请重新生成具备 contents 写权限的 Personal Access Token 后重试' };
    }
    if (s.includes('rate limit') || s.includes('api rate limit') || st === '429') {
      return { kind: 'limit', tip: '返回的是限流页：短时间请求过于频繁，请等待片刻后重试' };
    }
    if (st === '404') {
      return { kind: 'notfound', tip: '返回 404：请检查仓库名称 / 分支 / 文件路径（owner / repo / jsonPath）配置是否正确' };
    }
    return { kind: 'network', tip: '疑似网络拦截页：请切换网络（Wi-Fi / 手机流量 / 代理节点）重试，确认设备能直连 api.github.com' };
  }

  /**
   * 组装上传失败诊断区 HTML（状态码 + 返回内容片段 + 针对性建议），
   * 供失败弹窗展示；无诊断信息时返回空字符串。
   * @param {{message:string, diag?:{kind:string,status:number,snippet:string,tip:string}}} r 上传失败结果
   * @returns {string} 诊断区 HTML
   */
  function uploadFailDiagHtml(r) {
    const d = r && r.diag;
    if (!d) return '';
    // 内容片段去 HTML 标签压缩为纯文本（前 200 字符）；过短内容提示疑似空白拦截页
    const clean = String(d.snippet || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
    const shown = clean.length >= 5
      ? clean
      : (d.snippet ? '（返回内容过短，疑似空白拦截页）' : '（空）');
    return '<div class="dev-upload-diag">' +
      '<p><b>HTTP 状态</b>：' + esc(d.status || '-') + '</p>' +
      '<p><b>返回内容片段</b>：' + esc(shown) + '</p>' +
      '<p><b>建议</b>：' + esc(d.tip || '') + '</p>' +
      '</div>';
  }

  /**
   * 健壮响应解析（响应预处理）：先校验响应头 Content-Type。
   * - HTML 类型（如误请求到 github.com 网页域名、限流重定向页）：直接 throw apiErr('html')，
   *   不再执行 JSON 解析；
   * - JSON 类型：解析并返回对象；解析失败 throw apiErr('json')（本地 JSON 格式错误）；
   * - 其他状态码（401/403）由调用方根据 res.status 判定为 Token 权限不足，throw apiErr('token')。
   */
  async function safeJsonWithCheck(res) {
    const ct = String((res && res.headers && res.headers.get && res.headers.get('Content-Type')) || '').toLowerCase();
    let text = '';
    try { text = await res.text(); } catch (e) { text = ''; }
    const snippet = text.slice(0, 200);
    const looksHtml = /<\s*!doctype|<\s*html/i.test(snippet);
    if (looksHtml || /html/.test(ct)) {
      // HTML 响应：直接抛出，禁止走 JSON 解析（附带状态码与内容片段供诊断）
      throw apiErr('html', 'GitHub API 返回 HTML 而非 JSON（网络拦截或域名错误，请确认请求的是 api.github.com）', { snippet: snippet, contentType: ct, status: res ? res.status : 0 });
    }
    if (text) {
      try {
        return JSON.parse(text);
      } catch (e) {
        throw apiErr('json', '响应内容 JSON 格式错误，无法解析', { snippet: snippet, contentType: ct });
      }
    }
    return {};
  }

  /* ============================================================
   * UI 层：登录弹窗 / 登出 / 开发者面板渲染 / 背景锁定权限联动
   * ============================================================ */

  /** 弹窗：登录（星露谷像素卡片风格；文案不出现开发者字样） */
  function openLoginModal() {
    if (isDev()) { openAdminPanel(); return; }
    if (typeof Modal === 'undefined') return;
    Modal.show({
      title: '登录',
      body:
        '<div class="login-form dev-login-form">' +
          '<label class="form-label">账号</label>' +
          '<input id="dev-login-user" type="text" maxlength="20" placeholder="输入账号">' +
          '<label class="form-label">密码</label>' +
          '<input id="dev-login-pass" type="password" maxlength="32" placeholder="输入密码">' +
          '<p class="login-form-hint">输入账号与密码登录；如无需账号，可点击下方游客登录直接进入。</p>' +
        '</div>',
      actions: [
        { label: '登录', cls: 'btn-primary', onClick: submitDevLogin },
        { label: '游客登录', cls: 'btn-warn', onClick: submitGuestLogin },
        { label: '取消', cls: 'btn-text', onClick: function () {} },
      ],
    });
    setTimeout(function () {
      const el = document.getElementById('dev-login-user');
      if (el && el.focus) el.focus();
    }, 50);
  }

  /**
   * 游客登录：直接进入普通用户模式，不解锁任何开发者功能。
   * 使用 CommunityAPI.guestLogin()（与原有游客体系一致），关闭弹窗并刷新页面。
   */
  function submitGuestLogin() {
    if (typeof Modal !== 'undefined') Modal.close();
    if (typeof CommunityAPI !== 'undefined' && CommunityAPI.guestLogin) {
      CommunityAPI.guestLogin();
      if (typeof Toast !== 'undefined') Toast.show('已以游客身份登录');
      reRenderMinePage();
    }
  }

  /** 提交登录：仅校验唯一账号密码，成功 → 关弹窗 + 开开发者模式 + 刷新页面 */
  function submitDevLogin() {
    const u = ((document.getElementById('dev-login-user') || {}).value || '').trim();
    const p = ((document.getElementById('dev-login-pass') || {}).value || '').trim();
    if (!u || !p) {
      if (typeof Modal !== 'undefined') Modal.close();
      if (typeof Toast !== 'undefined') Toast.show('请输入账号和密码');
      openLoginModal();
      return;
    }
    if (login(u, p)) {
      if (typeof Modal !== 'undefined') Modal.close();
      if (typeof Toast !== 'undefined') Toast.show('登录成功');
      applyDevVisibility();
      reRenderMinePage();
    } else {
      if (typeof Modal !== 'undefined') Modal.close();
      if (typeof Toast !== 'undefined') Toast.show('账号或密码无效');
    }
  }

  /** 登出：清除登录态，恢复访客状态 */
  function doLogout() {
    if (typeof Modal === 'undefined') return;
    Modal.show({
      title: '退出开发者模式',
      body: '<p>确定退出？退出后管理面板、页面编辑入口与背景锁定将再次隐藏。</p>',
      actions: [
        { label: '取消', cls: 'btn-text', onClick: function () {} },
        { label: '退出', cls: 'btn-danger', onClick: function () {
          logout();
          if (typeof Modal !== 'undefined') Modal.close();
          if (typeof Toast !== 'undefined') Toast.show('已退出开发者模式');
          applyDevVisibility();
          reRenderMinePage();
        } },
      ],
    });
  }

  /** 按登录态刷新「我的」页（不整页重载，保留滚动位置） */
  function reRenderMinePage() {
    if (typeof App !== 'undefined' && App.render) App.render();
    else if (typeof Router !== 'undefined' && Router.handle) Router.handle();
  }

  /* ============================================================
   * 全局编辑工具条（每个页面右上角）+ 编辑模式（仅开发者可见）
   *
   * 非编辑态：右上角显示【编辑】按钮
   * 编辑态：  右上角显示【保存】【重置】，页面文字板块可点击选中编辑
   * 未登录/游客：工具条完全隐藏，页面保持原样
   * ============================================================ */
  /** 可编辑的页面文字板块选择器（纯文本展示元素，排除按钮/输入/图标） */
  const EDITABLE_SEL = [
    '.page-header h1', '.card-head h2', '.card-sub',
    'h1', 'h2', 'h3', 'h4',
    '.tile-label', '.notice-head h3', '.notice-date',
    '.post-nick', '.profile-name', '.profile-bio', '.stat-label', '.stat-num',
    '.setting-title', '.setting-desc', '.empty-sub', '.card-foot',
    '.conv-nick', '.msg-topbar h1', '.chat-nick',
  ].join(',');

  /** 编辑模式内存态 */
  let _editing = false;          // 是否处于编辑模式
  let _originalText = {};       // 进入编辑模式时的原始文本快照 { nodeKey: text }
  let _draftEdits = {};         // 本次未保存草稿 { nodeKey: { text, fontFamily, fontSize, weight } }
  let _activeNodeKey = null;    // 当前正在编辑的节点 key

  /** 当前页可编辑节点 key（基于当前 hash + 元素在 EDITABLE_SEL 中的序号，路由结构稳定时序号稳定） */
  function currentNodeKey() {
    const hash = (location.hash || '#/home').replace(/^#/, '');
    return hash;
  }
  function nodeKeyOf(el, idx) {
    return currentNodeKey() + '::' + idx;
  }

  /** 注入 / 更新全局编辑工具条（右上角固定） */
  function renderEditToolbar() {
    let bar = document.getElementById('dev-edit-toolbar');
    const dev = isDev();
    if (!dev) {
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      document.body.classList.remove('dev-editing');
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'dev-edit-toolbar';
      bar.className = 'dev-edit-toolbar';
      document.body.appendChild(bar);
    }
    if (_editing) {
      bar.innerHTML =
        '<button class="pixel-btn dev-edit-save" data-action="dev-edit-save" title="保存本次修改到本地">保存</button>' +
        '<button class="pixel-btn dev-edit-reset" data-action="dev-edit-reset" title="放弃改动，恢复原始">重置</button>';
      document.body.classList.add('dev-editing');
    } else {
      bar.innerHTML =
        '<button class="pixel-btn dev-edit-enter" data-action="dev-edit-enter" title="进入页面编辑模式">编辑</button>';
      document.body.classList.remove('dev-editing');
    }
  }

  /** 进入编辑模式：snapshot 原始文本，工具条切换为 保存/重置 */
  function enterEditMode() {
    if (!isDev()) { openLoginModal(); return; }
    if (_editing) return;
    _editing = true;
    _draftEdits = {};
    _originalText = {};
    // snapshot 当前页所有可编辑文本的原始内容
    const container = document.getElementById('page-container');
    if (container) {
      Array.prototype.forEach.call(container.querySelectorAll(EDITABLE_SEL), function (el, idx) {
        const key = nodeKeyOf(el, idx);
        _originalText[key] = el.textContent;
        el.setAttribute('data-dev-idx', String(idx));
        el.setAttribute('data-dev-key', key);
      });
    }
    renderEditToolbar();
    if (typeof Toast !== 'undefined') Toast.show('编辑模式：点击任意文字进行编辑');
  }

  /**
   * 退出编辑模式：
   * @param {boolean} commit  true=保存草稿到本地；false=放弃草稿（重置）
   */
  function exitEditMode(commit) {
    if (!_editing) { renderEditToolbar(); return; }
    if (commit) savePageEdits();
    else resetPageEdits();
    _editing = false;
    _draftEdits = {};
    _originalText = {};
    _activeNodeKey = null;
    // 清除节点标记
    const container = document.getElementById('page-container');
    if (container) {
      Array.prototype.forEach.call(container.querySelectorAll('[data-dev-key]'), function (el) {
        el.removeAttribute('data-dev-idx');
        el.removeAttribute('data-dev-key');
      });
    }
    renderEditToolbar();
  }

  /** 保存本次所有草稿修改：写入 localStorage 并实时应用预览 */
  function savePageEdits() {
    const stored = getPageEdit() || {};
    const applied = [];
    Object.keys(_draftEdits).forEach(function (key) {
      stored[key] = _draftEdits[key];
      applied.push(key);
    });
    setPageEdit(stored, true); // v2.4.22 保存草稿 → 标记未上传（_dirty），同步时本地优先
    applyPageEdits(); // 实时预览
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('sdv-page-edit-change', { detail: { applied: applied } }));
    }
    if (typeof Toast !== 'undefined') Toast.show('已保存 ' + applied.length + ' 处修改到本地');
  }

  /** 重置：放弃本次所有改动，恢复到进入编辑模式前原始内容（不写本地） */
  function resetPageEdits() {
    const container = document.getElementById('page-container');
    if (container) {
      Array.prototype.forEach.call(container.querySelectorAll('[data-dev-key]'), function (el) {
        const key = el.getAttribute('data-dev-key');
        if (key in _originalText) el.textContent = _originalText[key];
        // 移除开发者内联字体样式，恢复默认
        el.style.fontFamily = '';
        el.style.fontSize = '';
        el.style.fontWeight = '';
      });
    }
    _draftEdits = {};
    if (typeof Toast !== 'undefined') Toast.show('已重置，恢复原始内容');
  }

  /** 读取本地已保存的页面修改（跨端同步共用同一份 localStorage） */
  function getPageEdit() { return read('page_edit', null) || {}; }
  /** 写入本地页面修改缓存。
   * v2.4.22：dirty=true 表示「本地未上传修改」——sync 同步时以本地为准不被远程覆盖；
   * 上传成功 / 同步覆盖 / 重置后写入不含 _dirty 的新值，自动清除未上传标记，
   * 避免「旧同步残留缓存被误当未上传草稿保护，导致云端内容永远不覆盖页面」。 */
  function setPageEdit(v, dirty) {
    let val = v || {};
    if (dirty) {
      try { val = JSON.parse(JSON.stringify(val)); val._dirty = true; } catch (e) { /* 忽略 */ }
    }
    write('page_edit', val);
  }

  /** 把本地已保存的页面修改应用到当前渲染的页面（实时预览 / 重进页面时重放） */
  function applyPageEdits() {
    const stored = getPageEdit() || {};
    const container = document.getElementById('page-container');
    if (!container) return;
    Array.prototype.forEach.call(container.querySelectorAll(EDITABLE_SEL), function (el, idx) {
      const key = nodeKeyOf(el, idx);
      const rec = stored[key];
      if (rec) {
        if (typeof rec.text === 'string') el.textContent = rec.text;
        el.style.fontFamily = rec.fontFamily || '';
        el.style.fontSize = (rec.fontSize || '') ? rec.fontSize + 'px' : '';
        el.style.fontWeight = rec.weight || '';
      }
    });
  }

  /**
   * 编辑某节点文本：点击选中后打开编辑弹窗（修改文本 / 切像素字体模板 / 调字号，实时预览）
   * @param {Element} el 被点击的文本元素
   */
  function editNodeText(el) {
    if (!isDev()) { openLoginModal(); return; }
    if (!el || typeof Modal === 'undefined') return;
    const idxAttr = el.getAttribute('data-dev-idx');
    const idx = idxAttr !== null ? parseInt(idxAttr, 10) : (Array.prototype.indexOf.call(document.getElementById('page-container').querySelectorAll(EDITABLE_SEL), el));
    const key = nodeKeyOf(el, idx);
    const cur = _draftEdits[key] || {};
    const fc = getFontConfig();
    const curTplKey = cur.fontFamily
      ? (FONT_TEMPLATES.find(function (t) { return t.family === cur.fontFamily; }) || {}).key || fc.template
      : fc.template;

    const chipHtml = FONT_TEMPLATES.map(function (t) {
      return '<button class="chip' + (t.key === curTplKey ? ' active' : '') + '" data-editfont="' + t.key + '" style="font-family:' + t.family + '">' + t.name + '</button>';
    }).join('');

    Modal.show({
      title: '编辑文字',
      body:
        '<div class="dev-node-edit">' +
          '<label class="form-label">文本内容</label>' +
          '<input id="dev-node-text" type="text" maxlength="60" value="' + esc(cur.text !== undefined ? cur.text : (el.textContent || '')) + '">' +
          '<label class="form-label">像素字体模板</label>' +
          '<div class="chip-row" id="dev-node-font-chips">' + chipHtml + '</div>' +
          '<label class="form-label dev-font-size-label">字号（' + (cur.fontSize || fc.fontSize || 14) + 'px）</label>' +
          '<input id="dev-node-size" type="range" min="10" max="48" step="2" value="' + (cur.fontSize || fc.fontSize || 14) + '" class="dev-size-slider">' +
          '<div class="dev-node-preview" id="dev-node-preview" style="font-family:' +
            (cur.fontFamily || (FONT_TEMPLATES.find(function (t) { return t.key === curTplKey; }) || {}).family) +
            ';font-size:' + (cur.fontSize || fc.fontSize || 14) + 'px">' + esc(el.textContent || '') + '</div>' +
        '</div>',
      actions: [
        { label: '取消', cls: 'btn-text', onClick: function () {} },
        { label: '应用', cls: 'btn-primary', onClick: function () { applyNodeEdit(key, el); } },
      ],
    });

    // 实时预览：文本 / 字号 / 字体模板变化即时刷新预览区
    const mBody = document.querySelector('.modal-body');
    if (mBody) {
      const refresh = function () {
        const textEl = document.getElementById('dev-node-text');
        const sizeEl = document.getElementById('dev-node-size');
        const activeFont = mBody.querySelector('[data-editfont].active');
        const fkey = activeFont ? activeFont.dataset.editfont : curTplKey;
        const fdef = FONT_TEMPLATES.find(function (t) { return t.key === fkey; }) || FONT_TEMPLATES[0];
        const pv = document.getElementById('dev-node-preview');
        if (pv) {
          pv.textContent = textEl ? textEl.value : '';
          pv.style.fontFamily = fdef.family;
          pv.style.fontWeight = fdef.weight;
          pv.style.fontSize = (sizeEl ? parseInt(sizeEl.value, 10) : 14) + 'px';
        }
        const sizeLabel = mBody.querySelector('.dev-font-size-label');
        if (sizeLabel && sizeEl) sizeLabel.textContent = '字号（' + parseInt(sizeEl.value, 10) + 'px）';
      };
      mBody.addEventListener('input', refresh);
      mBody.addEventListener('click', function (ev) {
        const b = ev.target.closest('[data-editfont]');
        if (b) {
          mBody.querySelectorAll('[data-editfont]').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
          refresh();
        }
      });
      refresh();
    }
  }

  /** 应用某节点编辑到草稿并实时预览到页面 */
  function applyNodeEdit(key, el) {
    if (!el) return;
    const textEl = document.getElementById('dev-node-text');
    const sizeEl = document.getElementById('dev-node-size');
    const mBody = document.querySelector('.modal-body');
    const activeFont = mBody ? mBody.querySelector('[data-editfont].active') : null;
    const fkey = activeFont ? activeFont.dataset.editfont : getFontConfig().template;
    const fdef = FONT_TEMPLATES.find(function (t) { return t.key === fkey; }) || FONT_TEMPLATES[0];
    _draftEdits[key] = {
      text: textEl ? textEl.value : (el.textContent || ''),
      fontFamily: fdef.family,
      fontSize: sizeEl ? parseInt(sizeEl.value, 10) : 14,
      weight: fdef.weight,
    };
    // 实时预览到当前页面元素
    el.textContent = _draftEdits[key].text;
    el.style.fontFamily = fdef.family;
    el.style.fontWeight = fdef.weight;
    el.style.fontSize = _draftEdits[key].fontSize + 'px';
    _activeNodeKey = key;
    if (typeof Modal !== 'undefined') Modal.close();
    if (typeof Toast !== 'undefined') Toast.show('已修改，点「保存」写入本地');
  }

  /* ============================================================
   * 开发者管理面板（仅保留两大板块：一键上传GitHub + 背景锁定）
   * ============================================================ */
  function renderAdminPanelHtml() {
    const repo = getGitHubRepo();
    const token = getGitHubToken();
    const hasToken = !!token;
    return '<section class="card admin-panel" id="dev-admin-panel">' +
      '<div class="card-head">' +
        '<h2>开发者管理面板</h2>' +
        '<button class="pixel-btn dev-logout-inline" data-action="dev-logout" title="退出登录">登出</button>' +
      '</div>' +

      /* ---------- ① 一键上传GitHub：把所有本地已保存的页面修改内容一次性提交推送 ---------- */
      '<div class="admin-block" id="admin-block-github">' +
        '<h3>一键上传GitHub</h3>' +
        '<p class="setting-desc">把本地已保存的页面修改内容（文本 / 字体 / 公告缓存）提交到仓库 main 分支的页面内容 JSON（' + esc(repo.jsonPath || 'data/page-content.json') + '）。' +
          '提交前会弹窗确认本次修改内容，防止误提交。背景锁定为本地功能，不再随页面上传。</p>' +

        '<div class="admin-github-form">' +
          '<label class="form-label">仓库 Owner</label>' +
          '<input id="gh-owner" type="text" maxlength="40" value="' + esc(repo.owner || '') + '">' +
          '<label class="form-label">仓库名称</label>' +
          '<input id="gh-repo" type="text" maxlength="60" value="' + esc(repo.repo || '') + '">' +
          '<label class="form-label">分支</label>' +
          '<input id="gh-branch" type="text" maxlength="40" value="' + esc(repo.branch || 'main') + '">' +
          '<label class="form-label">JSON 文件路径（相对仓库根目录）</label>' +
          '<input id="gh-path" type="text" maxlength="120" value="' + esc(repo.jsonPath || '') + '">' +
          '<label class="form-label">GitHub 个人访问令牌（Token）</label>' +
          '<input id="gh-token" type="password" maxlength="120" placeholder="ghp_xxx / github_pat_xxx" value="' + esc(token) + '">' +
          '<label class="form-label">提交备注（可选，留空自动生成默认备注）</label>' +
          '<input id="gh-note" type="text" maxlength="120" placeholder="例如：同步页面修改 2026-10-07">' +
        '</div>' +

        '<div class="admin-row-actions">' +
          '<button class="btn" data-action="dev-save-github-config">保存仓库配置</button>' +
          '<button class="btn btn-primary btn-upload" data-action="dev-push-github">一键上传GitHub</button>' +
          '<button class="btn" data-action="dev-export-json" title="导出本地修改数据为 JSON 文件，供 GitHub 网页端手动上传覆盖">导出JSON下载</button>' +
        '</div>' +
        '<p class="admin-github-status" id="gh-status">当前 Token：' +
          (hasToken ? '已保存' : '未配置') + '（本地存储，仅用于 GitHub API）</p>' +
        '<p class="admin-github-hint">提示：仅支持页面内容 JSON（page-content.json）数据提交；图片资源请前往 GitHub 网页端手动上传，不会通过此功能写入仓库。</p>' +
        '<p class="admin-github-hint">导出用法：网络无法直连 api.github.com（一键上传被拦截）时，点击「导出JSON下载」得到 JSON 文件，' +
          '到 GitHub 网页 github.com/' + esc(repo.owner || '…') + '/' + esc(repo.repo || '…') + ' → data 目录 → 编辑/上传文件，覆盖 ' +
          esc(repo.jsonPath || 'data/page-content.json') + '，效果等同（文件以「网页提交」开头可被 Actions 过滤，不会乱升版本）。</p>' +
      '</div>' +

      /* ---------- ② 背景锁定板块设置（弹窗唤起，不再外露表格窗口） ---------- */
      '<div class="admin-block" id="admin-block-bglock">' +
        '<h3>背景锁定</h3>' +
        '<p class="setting-desc">锁定当前季节/时段背景，覆盖自动切换逻辑；点击「打开背景锁定窗口」弹窗操作，仅开发者可用。</p>' +
        '<div class="admin-row-actions">' +
          '<button class="btn" data-action="dev-open-bglock">打开背景锁定窗口</button>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /** 管理员面板内的交互处理 */
  function handleAction(action, target) {
    switch (action) {
      case 'dev-open-admin':
        openAdminPanel();
        break;
      case 'dev-logout':
        doLogout();
        break;
      case 'dev-open-bglock':
        openBgLockModal();
        break;
      case 'dev-save-github-config':
        saveGitHubConfig();
        break;
      case 'dev-push-github':
        pushGitHubWithConfirm();
        break;
      case 'dev-export-json':
        exportLocalData();
        break;
      case 'dev-sync-remote':
        syncRemoteContent(true); // v2.4.20 手动同步覆盖：拉取远程内容并覆盖到页面
        break;
      case 'dev-net-check':
        runNetCheck();
        break;
      /* ---------- 全局编辑工具条动作 ---------- */
      case 'dev-edit-enter':
        enterEditMode();
        break;
      case 'dev-edit-save':
        exitEditMode(true);   // 保存草稿并退出编辑模式
        break;
      case 'dev-edit-reset':
        exitEditMode(false);  // 放弃草稿并退出编辑模式
        break;
      default:
        return false; // 非本模块动作，交还 App.handleAction
    }
    return true;
  }

  function openAdminPanel() {
    if (!isDev()) { openLoginModal(); return; }
    const container = document.getElementById('page-container');
    if (!container) return;
    const existing = document.getElementById('dev-admin-panel');
    if (existing) existing.remove();
    const wrap = document.createElement('div');
    wrap.innerHTML = renderAdminPanelHtml();
    // 插入到第一个 .card.card-link（设置卡片）之前；找不到则追加到容器末尾
    const target = container.querySelector('.card.card-link');
    if (target && target.parentNode) target.parentNode.insertBefore(wrap.firstElementChild, target);
    else container.appendChild(wrap.firstElementChild);
    bindAdminPanelEvents();
  }

  /** 移除管理员面板 DOM（登出时调用） */
  function closeAdminPanel() {
    const el = document.getElementById('dev-admin-panel');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function bindAdminPanelEvents() {
    const tokenInput = document.getElementById('gh-token');
    if (tokenInput) {
      tokenInput.addEventListener('change', function () {
        setGitHubToken(tokenInput.value);
        updateTokenStatus();
      });
    }
  }

  function updateTokenStatus() {
    const el = document.getElementById('gh-status');
    if (!el) return;
    const has = !!getGitHubToken();
    el.textContent = '当前 Token：' + (has ? '已保存' : '未配置') + '（本地存储，仅用于 GitHub API）';
  }

  function saveGitHubConfig() {
    const owner = ((document.getElementById('gh-owner') || {}).value || '').trim();
    const repo = ((document.getElementById('gh-repo') || {}).value || '').trim();
    const branch = ((document.getElementById('gh-branch') || {}).value || '').trim() || 'main';
    const jsonPath = ((document.getElementById('gh-path') || {}).value || '').trim() || 'data/page-content.json';
    if (!owner || !repo) {
      if (typeof Toast !== 'undefined') Toast.show('请填写仓库 Owner 与名称');
      return;
    }
    // 背景锁定为本地功能，不再随页面上传（v2.5.2 删除背景锁定上传模块）
    setGitHubRepo({ owner: owner, repo: repo, branch: branch, jsonPath: jsonPath });
    if (typeof Toast !== 'undefined') Toast.show('仓库配置已保存');
  }

  /**
   * 一键上传GitHub：把本地已保存的全部页面修改内容一次性提交推送。
   * 提交前弹确认弹窗展示本次修改摘要，防止误提交。
   */
  function pushGitHubWithConfirm() {
    const noteEl = document.getElementById('gh-note');
    const prefNote = noteEl ? noteEl.value : '';
    if (typeof Modal === 'undefined') return;
    const repo = getGitHubRepo() || {};
    const payload = buildPageContentPayload();
    const summary = describePageContent(payload);
    Modal.show({
      title: '一键上传GitHub',
      body:
        '<p class="setting-desc">将把本地已保存的页面修改内容提交到仓库 main 分支的页面内容 JSON 文件。</p>' +
        '<div class="dev-upload-summary">' +
          '<p class="setting-desc"><b>本次提交文件</b></p>' +
          '<p class="setting-desc">① 页面内容 JSON：' + esc(repo.jsonPath || 'data/page-content.json') + '</p>' +
          '<p class="setting-desc"><b>本次修改内容</b></p>' +
          '<pre class="dev-upload-pre">' + esc(summary) + '</pre>' +
          '<p class="setting-desc"><b>仓库</b>：' + esc(repo.owner || '') + '/' + esc(repo.repo || '') +
          ' · 分支 ' + esc(repo.branch || 'main') + '</p>' +
          '<input id="gh-push-note" type="text" maxlength="120" value="' + esc(prefNote) + '" placeholder="提交备注（可选）">' +
        '</div>',
      actions: [
        { label: '取消', cls: 'btn-text', onClick: function () {} },
        { label: '确认上传', cls: 'btn-primary', onClick: function () {
          const note = ((document.getElementById('gh-push-note') || {}).value || '').trim();
          pushToGitHub({ note: note, payload: payload }).then(function (r) {
            if (typeof Modal !== 'undefined') Modal.close();
            if (!r.ok) {
              Modal.show({
                title: '上传失败',
                body:
                  '<p>' + esc(r.message) + '</p>' +
                  uploadFailDiagHtml(r) +
                  '<div class="dev-net-check-row">' +
                    '<button class="btn btn-primary dev-net-btn" data-action="dev-net-check">检测网络</button>' +
                    '<span id="dev-net-result" class="dev-net-result"></span>' +
                  '</div>' +
                  (r.commitUrl ? '<p class="setting-desc"><a href="' + esc(r.commitUrl) + '" target="_blank" rel="noopener">' + esc(r.commitUrl) + '</a></p>' : '') +
                  '<p class="setting-desc">上传失败不会损坏仓库原有文件。</p>',
                actions: [{ label: '知道了', cls: 'btn-primary' }],
              });
              return;
            }
            // 上传成功回调：清除本地业务缓存并重新 fetch 远程业务文件，刷新当前页面数据源
            refreshPageContentFromRemote().then(function (rr) {
              // 触发页面版本检测：拉取远程最新 json 数据，页面内容自动同步更新
              // （版本一致时静默；云端更高时走既有自动刷新流程）
              if (rr && rr.ok && typeof Updater !== 'undefined' && Updater.checkUpdate) {
                Updater.checkUpdate(false);
              }
              Modal.show({
                title: '上传成功',
                body:
                  '<p>' + esc(r.message) + '</p>' +
                  (r.commitUrl ? '<p class="setting-desc"><a href="' + esc(r.commitUrl) + '" target="_blank" rel="noopener">' + esc(r.commitUrl) + '</a></p>' : '') +
                  '<p class="setting-desc">' + esc(rr.message || '已提交业务数据到远程仓库') + '</p>' +
                  uploadFailDiagHtml(rr),
                actions: [{ label: '知道了', cls: 'btn-primary' }],
              });
            }).catch(function () {
              Modal.show({
                title: '上传成功',
                body:
                  '<p>' + esc(r.message) + '</p>' +
                  (r.commitUrl ? '<p class="setting-desc"><a href="' + esc(r.commitUrl) + '" target="_blank" rel="noopener">' + esc(r.commitUrl) + '</a></p>' : '') +
                  '<p class="setting-desc">刷新远程业务数据失败，请稍后手动检查更新。</p>' +
                  uploadFailDiagHtml(r),
                actions: [{ label: '知道了', cls: 'btn-primary' }],
              });
            });
          });
        } },
      ],
    });
  }

  /**
   * 组装「本地已保存的页面修改内容」：页面文本/字体编辑 + 公告 + 背景锁定（提交到 jsonPath）。
   * 网页端一键上传只提交业务 JSON 数据，不携带、不递增、不写入任何版本相关字段
   * （版本升级仅由电脑本地 Git 推送流程处理，网页上传完全跳过）。
   * v2.4.13：一键上传只读取「本地 storage 内缓存的待修改数据」——
   * 不再从页面原始配置（SDV_CONFIG）读取公告，避免把旧原始数据覆盖到远程最新公告。
   */
  /**
   * 解码 GitHub contents API 返回的 base64 内容并解析为 JSON（v2.4.18）。
   * 用于上传前读取远程现有 page-content.json 作为合并基底。
   * @param {object|null} data contents API 响应（含 content base64）
   * @returns {object|null} 解析后的 JSON；无内容/解析失败返回 null
   */
  function parseRemoteContent(data) {
    let content = '';
    if (data && data.content) {
      try { content = decodeURIComponent(escape(atob(String(data.content).replace(/\n/g, '')))); } catch (e) { content = ''; }
    }
    if (!content) return null;
    try { return JSON.parse(content); } catch (e) { return null; }
  }

  /**
   * 生成本次上传的 page-content.json 载荷（v2.4.18 增量合并版）：
   * 以远程现有内容为基底，仅用本地缓存覆盖「确有修改」的字段；
   * 无本地修改的字段保留远程原值——修复此前「本地缓存缺失字段 → PUT 全量覆盖 → 远程公告等数据被删」的问题。
   * v2.5.2：背景锁定为本地功能，不再随页面上传（上传模块已删除），本载荷始终不含背景锁定相关字段。
   * @param {object|null} remote 远程现有 JSON（读取失败/首次上传时传 null 或 {}）
   */
  function buildPageContentPayload(remote) {
    const base = (remote && typeof remote === 'object') ? remote : {};
    const payload = { generatedAt: new Date().toISOString() };
    const edit = read('page_edit', null);
    const font = read('font_cfg', null);
    const notice = read('notice_edit', null);
    // 本地有缓存 → 覆盖（剥离未上传标记 _dirty，避免污染远程数据）；无缓存 → 保留远程原值（未修改字段不丢失）
    if (edit !== null) {
      const pe = JSON.parse(JSON.stringify(edit));
      delete pe._dirty; // v2.4.22 上传载荷不含未上传标记
      payload.pageEdit = pe;
    }
    else if (base.pageEdit !== undefined) payload.pageEdit = base.pageEdit;
    if (font !== null) payload.fontConfig = font;
    else if (base.fontConfig !== undefined) payload.fontConfig = base.fontConfig;
    if (notice !== null) payload.announcements = notice;
    else if (base.announcements !== undefined) payload.announcements = base.announcements;
    return payload;
  }

  /** 生成「本地已保存的页面修改内容」摘要（确认弹窗展示，防止误提交；不含版本信息） */
  function describePageContent(payload) {
    try {
      const lines = [];
      lines.push('生成时间：' + payload.generatedAt);
      const editKeys = Object.keys(payload.pageEdit || {});
      lines.push('页面文本/字体修改：' + (editKeys.length ? editKeys.length + ' 处' : '无'));
      editKeys.slice(0, 20).forEach(function (k) {
        const r = payload.pageEdit[k];
        lines.push('  · ' + k + ' → 「' + String(r.text || '').slice(0, 20) + '」 ' +
          (r.fontFamily ? ('[' + r.fontFamily.split(',')[0].replace(/"/g, '') + '] ') : '') +
          (r.fontSize ? (r.fontSize + 'px') : ''));
      });
      if (editKeys.length > 20) lines.push('  … 其余 ' + (editKeys.length - 20) + ' 处省略');
      lines.push('默认字体：' + ((payload.fontConfig || {}).template || '-') + ' / ' + ((payload.fontConfig || {}).fontSize || 14) + 'px');
      lines.push('公告：' + ((payload.announcements || []).length) + ' 条');
      return lines.join('\n');
    } catch (e) {
      return JSON.stringify(payload, null, 2);
    }
  }

  /**
   * 导出本地修改数据为 JSON（page-content.json）——v2.5.2 兜底通道：
   * 网络无法直连 api.github.com（一键上传被拦）时，下载到本地后前往 GitHub 网页端手动上传覆盖，
   * 走 github.com 域名（不受 api.github.com 拦截影响），效果与一键上传等同。
   * 载荷构建逻辑与一键上传完全一致（buildPageContentPayload），
   * 不携带版本字段（网页端过滤规则：提交备注以「网页提交」开头不会被 Actions 升版）。
   * @returns {Array<{name:string, data:object}>} 待下载文件清单
   */
  function buildExportFiles() {
    return [
      { name: 'page-content.json', data: buildPageContentPayload(null) },
    ];
  }

  /** 触发下载（逐个 Blob 下载，移动端 a.download 兼容） */
  function exportLocalData() {
    const files = buildExportFiles();
    files.forEach(function (f) {
      try {
        const blob = new Blob([JSON.stringify(f.data, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 2000);
      } catch (e) {
        if (typeof Toast !== 'undefined') Toast.show('导出 ' + f.name + ' 失败：' + (e && e.message ? e.message : e));
      }
    });
    if (typeof Toast !== 'undefined') Toast.show('已导出 ' + files.length + ' 个 JSON 文件，请前往 GitHub 网页端手动上传覆盖');
    return { ok: true, files: files.map(function (f) { return f.name; }) };
  }

  /**
   * 提交成功后刷新业务数据源：清除本地业务缓存并重新 fetch 远程 jsonPath，
   * 让当前页面立刻加载远程最新业务内容（修复"仅本地内存保存、其他浏览器看不到"BUG）。
   * 只处理业务 JSON 文件，绝不触碰 version.json 或任何版本变量。
   * @returns {Promise<{ok:boolean, message:string}>}
   */
  async function refreshPageContentFromRemote() {
    const repo = getGitHubRepo();
    const token = getGitHubToken();
    if (!repo || !repo.owner || !repo.repo || !repo.jsonPath) {
      return { ok: false, message: '仓库配置缺失，无法刷新远程业务数据' };
    }
    const base = 'https://api.github.com';
    if (!/^https:\/\/api\.github\.com$/.test(base)) {
      return { ok: false, message: 'GitHub API 域名异常，必须使用 api.github.com' };
    }
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    // v2.4.19：拉取前先快照本地业务缓存——刷新失败时回滚快照，本地修改不丢失（此前先清缓存再拉取，
    // 拉取失败会把本地修改清空、页面恢复默认，且再次上传时 payload 读空缓存会误覆盖远程修改）
    const _refreshKeys = [NS + 'page_edit', NS + 'font_cfg', 'sdv_bg_lock', NS + 'notice_edit'];
    const snapshot = {};
    try {
      _refreshKeys.forEach(function (k) { snapshot[k] = localStorage.getItem(k); });
    } catch (e) { /* 忽略 */ }
    /** 刷新失败出口：回滚本地缓存快照并返回失败信息（本地修改保留，可稍后重试） */
    function refreshFail(msg, extra) {
      try {
        _refreshKeys.forEach(function (k) {
          const raw = snapshot[k];
          if (raw !== null) localStorage.setItem(k, raw); else localStorage.removeItem(k);
        });
      } catch (e) { /* 忽略 */ }
      return Object.assign({ ok: false, message: msg }, extra || {});
    }
    try {
      // ① 清空当前页面该 json 的本地缓存（页面文本/字体编辑 + 字体配置 + 背景锁定 + 公告缓存）
      try {
        localStorage.removeItem(NS + 'page_edit');
        localStorage.removeItem(NS + 'font_cfg');
        localStorage.removeItem('sdv_bg_lock');
        localStorage.removeItem(NS + 'notice_edit');
      } catch (e) { /* 忽略 */ }

      // ② 重新 fetch 远程 jsonPath，拉取最新业务内容
      //    （v2.4.17 对齐上传流程：无认证优先读取绕过路径拦截 + 超时 + 自动重试）
      const readUrl = base + '/repos/' + encodeURIComponent(repo.owner) + '/' +
        encodeURIComponent(repo.repo) + '/contents/' +
        encodeURIComponent(repo.jsonPath) +
        '?ref=' + encodeURIComponent(repo.branch || 'main') +
        '&t=' + Date.now();
      let remote = {};
      // v2.4.21 raw 通道优先（raw.githubusercontent.com 普通 HTTPS，绕过 api.github.com 路径级拦截）
      try {
        const rawUrl = 'https://raw.githubusercontent.com/' + encodeURIComponent(repo.owner) + '/' +
          encodeURIComponent(repo.repo) + '/' + encodeURIComponent(repo.branch || 'main') + '/' +
          String(repo.jsonPath || '').split('/').map(encodeURIComponent).join('/') + '?t=' + Date.now();
        const rawRes = await fetchTimeout(rawUrl, { redirect: 'follow' }, 15000);
        if (rawRes && rawRes.ok) {
          const rawText = await rawRes.text();
          if (rawText && rawText.trim().charAt(0) === '{') {
            try { remote = JSON.parse(rawText); } catch (e) { remote = {}; }
          }
        }
      } catch (e) { /* raw 失败继续走同源通道 */ }
      // v2.4.23 同源相对路径（应用自身源站：GitHub Pages 部署文件；手机端必通兜底）
      if (!Object.keys(remote).length) {
        try {
          const sameRes = await fetchTimeout('data/page-content.json?t=' + Date.now(), { cache: 'no-store' }, 15000);
          if (sameRes && sameRes.ok) {
            const sameText = await sameRes.text();
            if (sameText && sameText.trim().charAt(0) === '{') {
              try { remote = JSON.parse(sameText); } catch (e) { remote = {}; }
            }
          }
        } catch (e) { /* 同源失败继续走 api 通道 */ }
      }
      try {
        // 0) 无认证优先读取（公开仓库可直接读最新内容）
        const anonRes = await fetchTimeout(
          readUrl,
          { headers: { 'Accept': 'application/vnd.github+json' }, redirect: 'manual' },
          15000
        );
        if (anonRes.ok) {
          try {
            const anonData = await safeJsonWithCheck(anonRes);
            if (anonData && anonData.content) {
              const content = decodeURIComponent(escape(atob(anonData.content.replace(/\n/g, ''))));
              if (content) { try { remote = JSON.parse(content); } catch (e) { remote = {}; } }
            }
          } catch (anonErr) {
            if (anonErr.__class !== 'html' && anonErr.__class !== 'json') throw anonErr;
          }
        }
        // 1) 未取到则带 Token 重试（私有仓库 / 无认证被拦 / 文件不存在判断）
        if (!Object.keys(remote).length) {
          const got = await withRetry(function () {
            return fetchTimeout(
              readUrl,
              { headers: Object.assign({}, headers, NO_CACHE_HEADERS), redirect: 'manual' },
              15000
            ).then(async function (res) {
              if (res.type === 'opaqueredirect' || res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
                throw apiErr('token', 'GitHub API 重定向（Token 失效或未授权）：请重新生成有 contents 权限的 Token 再试');
              }
              if (res.status === 401 || res.status === 403) {
                throw apiErr('token', 'Token 权限不足：请检查 GitHub Personal Access Token 是否有效');
              }
              if (!res.ok) {
                const err = await safeJson(res);
                throw apiErr('other', '刷新远程业务数据失败（' + res.status + '）：' + ((err && err.message) || '请检查 Token 权限'));
              }
              const data = await safeJsonWithCheck(res);
              let content = '';
              if (data && data.content) {
                try { content = decodeURIComponent(escape(atob(data.content.replace(/\n/g, '')))); } catch (e) { content = ''; }
              }
              let parsed = {};
              if (content) { try { parsed = JSON.parse(content); } catch (e) { parsed = {}; } }
              return parsed;
            });
          }, 3);
          remote = got;
        }
      } catch (re) {
        if (re && re.__class === 'html') return refreshFail('GitHub API 请求异常（网络拦截/域名错误）：返回 HTML 而非 JSON。请检查：① Token 是否有效且具备 contents 权限 ② 手机网络能否直连 api.github.com（VPN/代理可能拦截） ③ 是否触发 GitHub 限流（稍后再试）。本地修改已保留，可稍后重试', { diag: { kind: 'html', status: re.status || 0, snippet: re.snippet || '', tip: diagnoseHtml(re.snippet, re.status).tip } });
        if (re && re.__class === 'token') return refreshFail(re.message);
        if (re && re.__class === 'json') return refreshFail('刷新远程业务数据失败：本地 JSON 格式错误，无法解析响应内容。本地修改已保留，可稍后重试');
        if (re && re.__class === 'net') return refreshFail('网络异常（网络拦截/域名错误）：无法连接 GitHub API 刷新远程数据。本地修改已保留，请检查网络后重试');
        return refreshFail('刷新远程业务数据失败：' + ((re && re.message) || '未知错误') + '。本地修改已保留，可稍后重试');
      }

      // ③ 用远程业务数据回写本地缓存并即时重放页面（刷新页面数据源 + UI 渲染）
      if (remote.pageEdit) setPageEdit(remote.pageEdit);
      if (remote.fontConfig) setFontConfig(remote.fontConfig);
      // 远程公告数据若存在，同步进页面数据源（SDV_CONFIG.announcements），供公告页重渲染
      if (remote.announcements && Array.isArray(remote.announcements) && typeof SDV_CONFIG !== 'undefined') {
        SDV_CONFIG.announcements = remote.announcements;
      }
      if (typeof applyPageEdits === 'function') applyPageEdits();
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('sdv-page-edit-change', { detail: { applied: ['refresh-from-remote'] } }));
        // 通知公告/页面渲染层重新拉取数据源并刷新 UI
        window.dispatchEvent(new CustomEvent('sdv-content-refresh', { detail: { source: 'page-content.json' } }));
        // v2.4.17 触发路由重渲染（hashchange 事件 → 当前页面重新渲染），
        // 使公告/页面内容立即显示最新远程数据（仅派发自定义事件无监听方，页面不会刷新）
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
      return { ok: true, message: '已刷新远程业务数据，页面已加载最新内容' };
    } catch (e) {
      // 三类异常分类：网络拦截/域名错误(html)、Token权限不足(token)、本地JSON格式错误(json)
      if (e && e.__class === 'html') return refreshFail('网络拦截/域名错误：GitHub API 返回 HTML 而非 JSON，请确认请求 api.github.com 且网络可用。本地修改已保留，可稍后重试', { diag: { kind: 'html', status: e.status || 0, snippet: e.snippet || '', tip: diagnoseHtml(e.snippet, e.status).tip } });
      if (e && e.__class === 'token') return refreshFail('Token 权限不足：请检查 GitHub Personal Access Token。本地修改已保留');
      if (e && e.__class === 'json') return refreshFail('本地 JSON 格式错误：' + (e.message || '响应无法解析') + '。本地修改已保留');
      return refreshFail('网络异常（网络拦截/域名错误）：无法连接 GitHub API，请检查网络或确认请求域名为 api.github.com。本地修改已保留');
    }
  }

  /**
   * v2.4.20 同步覆盖：拉取远程 page-content.json 并应用到本地页面（跨设备内容同步）。
   *  - 本地已有「未上传」的页面修改缓存 → 以本地为准（同步不覆盖未上传修改，避免丢失）；
   *  - 本地无缓存 → 用远程内容覆盖（pageEdit/字体配置/公告）并重渲染页面；
   *  - 静默失败：网络被拦/超时不影响页面正常使用（自动同步场景）；手动触发时 Toast 提示结果。
   * @param {boolean} manual 手动触发（管理面板「同步覆盖」按钮）时为 true，成功/失败均提示
   */
  /**
   * v2.4.21 多通道拉取远程 page-content.json（v2.4.23 增补同源通道）：
   * ① raw.githubusercontent.com 优先——普通 HTTPS CDN 路径，可绕过 api.github.com 的路径级拦截
   *   （部分网络/代理只拦 api.github.com 的 /repos/.../contents/ 路径，raw 域名通常放行）；
   * ② 应用自身源站同源路径 ./data/page-content.json（GitHub Pages 项目部署文件；
   *   应用能打开必能拉到同源数据，绕过一切跨域/路径拦截——手机端最可靠兜底）；
   * ③ api.github.com 无认证（公开仓库）；④ api.github.com 带 Token（私有仓库/回退）。
   * @param {object} repo 仓库配置 { owner, repo, branch, jsonPath }
   * @param {string} token GitHub Token（可为空）
   * @returns {Promise<{remote: object, via: string}>} remote 为空表示全部通道失败
   */
  async function fetchRemoteContentMulti(repo, token) {
    const branch = encodeURIComponent(repo.branch || 'main');
    const pathParts = String(repo.jsonPath || '').split('/').map(encodeURIComponent).join('/');
    const apiUrl = 'https://api.github.com/repos/' + encodeURIComponent(repo.owner) + '/' +
      encodeURIComponent(repo.repo) + '/contents/' + pathParts +
      '?ref=' + branch + '&t=' + Date.now();
    // ① raw 通道（无需认证；绕过 api.github.com 路径级拦截）
    try {
      const rawUrl = 'https://raw.githubusercontent.com/' + encodeURIComponent(repo.owner) + '/' +
        encodeURIComponent(repo.repo) + '/' + branch + '/' + pathParts +
        '?t=' + Date.now();
      const rawRes = await fetchTimeout(rawUrl, { redirect: 'follow' }, 10000);
      if (rawRes && rawRes.ok) {
        const text = await rawRes.text();
        if (text && text.trim().charAt(0) === '{') {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { remote: parsed, via: 'raw' };
          }
        }
      }
    } catch (e) { /* raw 失败继续走同源通道 */ }
    // ② 同源相对路径（应用自身源站：GitHub Pages 部署文件；手机端必通兜底）
    try {
      const sameRes = await fetchTimeout('data/page-content.json?t=' + Date.now(), { cache: 'no-store' }, 10000);
      if (sameRes && sameRes.ok) {
        const text = await sameRes.text();
        if (text && text.trim().charAt(0) === '{') {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { remote: parsed, via: 'same-origin' };
          }
        }
      }
    } catch (e) { /* 同源失败继续走 api 通道 */ }
    // ③ api 无认证（公开仓库）
    try {
      const anonRes = await fetchTimeout(
        apiUrl,
        { headers: { 'Accept': 'application/vnd.github+json' }, redirect: 'manual' },
        10000
      );
      if (anonRes.ok) {
        try {
          const anonData = await safeJsonWithCheck(anonRes);
          const parsed = parseRemoteContent(anonData);
          if (parsed) return { remote: parsed, via: 'api-anon' };
        } catch (anonErr) {
          if (anonErr.__class !== 'html' && anonErr.__class !== 'json') throw anonErr;
        }
      }
    } catch (e) { /* 忽略继续 */ }
    // ④ api 带 Token（私有仓库 / 无认证被拦回退）
    if (token) {
      try {
        const got = await withRetry(function () {
          return fetchTimeout(
            apiUrl,
            { headers: Object.assign({ Authorization: 'Bearer ' + token }, NO_CACHE_HEADERS), redirect: 'manual' },
            10000
          ).then(async function (res) {
            if (!res.ok) throw apiErr('other', '读取远程内容失败（' + res.status + '）');
            const d = await safeJsonWithCheck(res);
            return parseRemoteContent(d) || {};
          });
        }, 2);
        if (Object.keys(got).length) return { remote: got, via: 'api-token' };
      } catch (e) { /* 忽略 */ }
    }
    return { remote: {}, via: '' };
  }

  async function syncRemoteContent(manual) {
    const repo = getGitHubRepo();
    if (!repo || !repo.owner || !repo.repo || !repo.jsonPath) {
      if (manual && typeof Toast !== 'undefined') Toast.show('仓库配置缺失，无法同步远程内容');
      return { ok: false, message: '仓库配置缺失' };
    }
    const base = 'https://api.github.com';
    if (!/^https:\/\/api\.github\.com$/.test(base)) {
      if (manual && typeof Toast !== 'undefined') Toast.show('GitHub API 域名异常，必须使用 api.github.com');
      return { ok: false, message: 'GitHub API 域名异常，必须使用 api.github.com' };
    }
    // v2.4.22 本地未上传标记（_dirty）→ 同步时本地优先；旧同步残留缓存（无 _dirty）会被远程覆盖
    const localPageEdit = read('page_edit', null);
    const localDirty = localPageEdit !== null && localPageEdit._dirty === true;
    const token = getGitHubToken();
    try {
      // v2.4.21 多通道拉取：raw → api 无认证 → api 带 Token（绕过 api.github.com 路径级拦截）
      const { remote, via } = await fetchRemoteContentMulti(repo, token);
      if (!Object.keys(remote).length) {
        if (manual && typeof Toast !== 'undefined') Toast.show('未能获取远程内容（网络/拦截），已保留本地内容');
        return { ok: false, message: '拉取远程内容失败' };
      }
      // 应用远程内容：本地存在「未上传修改」（_dirty）时以本地为准；否则远程覆盖并清除未上传标记
      if (!localDirty && remote.pageEdit) setPageEdit(remote.pageEdit);
      if (remote.fontConfig) setFontConfig(remote.fontConfig);
      if (remote.announcements && Array.isArray(remote.announcements) && typeof SDV_CONFIG !== 'undefined') {
        SDV_CONFIG.announcements = remote.announcements;
      }
      if (typeof applyPageEdits === 'function') applyPageEdits();
      if (window && window.dispatchEvent) window.dispatchEvent(new HashChangeEvent('hashchange'));
      if (manual && typeof Toast !== 'undefined') Toast.show('已同步远程内容并覆盖到页面');
      return { ok: true, message: '已同步远程内容并覆盖到页面' };
    } catch (e) {
      if (manual && typeof Toast !== 'undefined') Toast.show('同步失败：' + ((e && e.message) || '网络异常') + '。已保留本地内容');
      return { ok: false, message: '同步失败：' + ((e && e.message) || '网络异常') };
    }
  }

  /* ---------- 字体模板 / 字号配置（页面默认字体，编辑弹窗内切换） ---------- */
  /** 内置多套像素字体模板（沿用 Press Start 2P + 系统等宽像素风） */
  const FONT_TEMPLATES = [
    { key: 'px-retro', name: '复古像素', family: '"Press Start 2P", monospace', weight: 400 },
    { key: 'px-mono',  name: '等宽像素', family: 'monospace', weight: 400 },
    { key: 'px-round', name: '圆体像素', family: '"Microsoft YaHei", system-ui', weight: 700 },
    { key: 'px-serif', name: '衬线像素', family: '"PingFang SC", "Noto Sans SC", serif', weight: 400 },
  ];
  function getFontConfig() {
    return read('font_cfg', null) || { template: 'px-retro', fontSize: 14, weight: 400 };
  }
  function setFontConfig(c) { write('font_cfg', c || {}); }

  /* ============================================================
   * 背景锁定窗口（方案A：仅开发者登录后可见可用；弹窗唤起，不外露表格）
   * ============================================================ */
  function openBgLockModal() {
    if (!isDev()) { openLoginModal(); return; }
    if (typeof Modal === 'undefined') return;
    const lock = readLockNow();
    const seasons = [['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬']];
    const periods = [['morning', '清晨'], ['day', '白天'], ['dusk', '黄昏'], ['night', '夜晚']];
    const curSeason = (lock && lock.season) ? lock.season : currentAutoSeason();
    const curPeriod = (lock && lock.period) ? lock.period : currentAutoPeriod();

    Modal.show({
      title: '背景锁定窗口',
      body:
        '<div class="bg-lock-form">' +
          '<p class="setting-desc">' +
            (lock ? '当前已锁定：' + seasonLabel(seasons, curSeason) + ' · ' + periodLabel(periods, curPeriod)
                 : '当前为自动模式，按系统日期/时间自动切换背景') +
          '</p>' +
          '<label class="form-label">季节</label>' +
          '<div class="chip-row">' + seasons.map(function (s) {
            return '<button class="chip' + (curSeason === s[0] ? ' active' : '') + '" data-bglock-season="' + s[0] + '">' + s[1] + '</button>';
          }).join('') + '</div>' +
          '<label class="form-label">时段</label>' +
          '<div class="chip-row">' + periods.map(function (p) {
            return '<button class="chip' + (curPeriod === p[0] ? ' active' : '') + '" data-bglock-period="' + p[0] + '">' + p[1] + '</button>';
          }).join('') + '</div>' +
        '</div>',
      actions: [
        { label: '取消', cls: 'btn-text', onClick: function () {} },
        { label: '锁定当前', cls: 'btn-primary', onClick: function () {} },
        { label: '恢复自动', cls: 'btn-warn', onClick: function () { applyBgLock(null, null, false); Modal.close(); } },
      ],
    });

    const modalBody = document.querySelector('.modal-body');
    if (modalBody) {
      let selSeason = curSeason, selPeriod = curPeriod;
      modalBody.addEventListener('click', function (ev) {
        const sBtn = ev.target.closest('[data-bglock-season]');
        const pBtn = ev.target.closest('[data-bglock-period]');
        if (sBtn) {
          selSeason = sBtn.dataset.bglockSeason;
          modalBody.querySelectorAll('[data-bglock-season]').forEach(function (b) { b.classList.remove('active'); });
          sBtn.classList.add('active');
        }
        if (pBtn) {
          selPeriod = pBtn.dataset.bglockPeriod;
          modalBody.querySelectorAll('[data-bglock-period]').forEach(function (b) { b.classList.remove('active'); });
          pBtn.classList.add('active');
        }
      });
      const actionsEl = document.querySelector('.modal-actions');
      if (actionsEl) {
        const lockBtn = Array.from(actionsEl.children).find(function (b) {
          return b.textContent.indexOf('锁定') >= 0;
        });
        if (lockBtn) {
          lockBtn.onclick = function () {
            applyBgLock(selSeason, selPeriod, true);
            Modal.close();
          };
        }
      }
    }
  }

  function seasonLabel(arr, key) { const x = arr.find(function (i) { return i[0] === key; }); return x ? x[1] : key; }
  function periodLabel(arr, key) { const x = arr.find(function (i) { return i[0] === key; }); return x ? x[1] : key; }

  function readLockNow() {
    try {
      const raw = localStorage.getItem('sdv_bg_lock');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function currentAutoSeason() {
    const m = new Date().getMonth() + 1;
    if (m >= 3 && m <= 5) return 'spring';
    if (m >= 6 && m <= 8) return 'summer';
    if (m >= 9 && m <= 11) return 'autumn';
    return 'winter';
  }
  function currentAutoPeriod() {
    const h = new Date().getHours();
    if (h >= 5 && h < 8) return 'morning';
    if (h >= 8 && h < 17) return 'day';
    if (h >= 17 && h < 19) return 'dusk';
    return 'night';
  }

  /** 应用背景锁定：写入 localStorage，并通知 background.js 模块刷新 */
  function applyBgLock(season, period, locked) {
    let val = null;
    if (locked) val = { locked: true, season: season, period: period };
    try {
      if (val) localStorage.setItem('sdv_bg_lock', JSON.stringify(val));
      else localStorage.removeItem('sdv_bg_lock');
    } catch (e) { /* 忽略 */ }
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('sdv-bg-lock-change', { detail: { locked: !!locked } }));
    }
    if (typeof Toast !== 'undefined') Toast.show(locked ? '已锁定背景' : '已恢复自动切换');
  }

  /* ============================================================
   * 权限联动：控制「编辑工具条」「管理员面板」「背景锁定」可见性
   * ============================================================ */
  function applyDevVisibility() {
    const dev = isDev();
    // ① 全局编辑工具条（每个页面右上角）：仅开发者显示；登出移除
    renderEditToolbar();
    if (!dev) document.body.classList.remove('dev-editing');

    // ② 管理员面板（仅「我的」页渲染）
    if (dev) {
      const container = document.getElementById('page-container');
      if (container && (location.hash || '').indexOf('#/mine') === 0 && !document.getElementById('dev-admin-panel')) {
        openAdminPanel();
      }
    } else {
      closeAdminPanel();
    }

    // ③ 背景锁定：外显表格窗口已移除，登出时清除残留锁定恢复自动切换
    if (!dev) {
      try { localStorage.removeItem('sdv_bg_lock'); } catch (e) {}
    }
    // 标记 body，供 CSS 兜底隐藏所有开发者入口/编辑控件/上传按钮
    document.body.classList.toggle('dev-mode', dev);
  }

  /* ---------- 启动 ---------- */
  function init() {
    applyDevVisibility();

    // 全局点击委托补一层 DevAdmin 动作（不改动 App.handleAction 原实现）
    document.addEventListener('click', function (e) {
      const t = e.target;
      if (!t || typeof t.closest !== 'function') return;
      // ① 编辑模式：点击文字板块 → 打开节点编辑弹窗
      if (_editing && isDev()) {
        const node = t.closest('#page-container ' + EDITABLE_SEL);
        if (node && t.closest('#dev-edit-toolbar') === null && t.closest('.modal-mask') === null) {
          editNodeText(node);
          return;
        }
      }
      // ② dev-* 动作
      const actionEl = t.closest('[data-action]');
      if (!actionEl) return;
      const act = actionEl.dataset.action;
      if (act && act.indexOf('dev-') === 0) {
        e.stopPropagation();
        handleAction(act, t);
      }
    }, true); // capture 阶段优先消费

    // 路由渲染后：进入「我的」页补渲染管理员面板；重放本地已保存的页面修改；刷新工具条
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', function () {
        setTimeout(function () {
          applyDevVisibility();
          applyPageEdits(); // 重进页面时重放本地已保存修改（跨端同步读取）
        }, 0);
      });
      // 跨标签页 / 多端同步：localStorage 变更即时重放页面修改
      window.addEventListener('storage', function (ev) {
        if (ev.key === NS + 'page_edit' || ev.key === 'sdv_bg_lock') {
          applyPageEdits();
        }
      });
    }
    // 首屏重放本地已保存的页面修改
    setTimeout(function () { applyPageEdits(); }, 0);
    // v2.4.20 页面加载后静默同步远程内容（跨设备覆盖：其他端上传的修改自动生效）。
    // 本地有未上传修改时以本地为准，不被覆盖；网络被拦/超时静默跳过，不影响正常使用。
    setTimeout(function () {
      if (typeof syncRemoteContent === 'function') {
        syncRemoteContent(false).catch(function () { /* 静默 */ });
      }
    }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    login, logout, getDevLogin, isDev,
    getGitHubToken, setGitHubToken, getGitHubRepo, setGitHubRepo,
    pushToGitHub, buildPageContentPayload, buildExportFiles, exportLocalData, refreshPageContentFromRemote, syncRemoteContent, fetchRemoteContentMulti,
    openLoginModal, openAdminPanel, openBgLockModal, doLogout,
    enterEditMode, exitEditMode, savePageEdits, resetPageEdits, applyPageEdits,
    getPageEdit, setPageEdit, getFontConfig, setFontConfig,
    FONT_TEMPLATES,
    applyDevVisibility, init,
  };
})();
