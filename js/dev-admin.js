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
 *   · 解锁「我的」页开发者管理面板（仅两块：一键上传GitHub + 背景锁定）
 *   · 抛出 sdv-dev-state-change 事件通知 background.js 联动
 * - 登出 → 清除登录态，隐藏全部开发者入口/编辑控件/上传按钮，恢复访客状态
 *
 * 管理面板「一键上传GitHub」：
 * - Token 存 localStorage；把本地已保存的页面修改内容一次性提交到 main 分支
 * - 提交前弹确认弹窗展示本次修改摘要，防止误提交；不损坏仓库原有文件
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
      // ① 读取当前文件内容（获取 sha）
      let sha = '';
      const fileRes = await fetch(
        base + '/repos/' + encodeURIComponent(repo.owner) + '/' +
        encodeURIComponent(repo.repo) + '/contents/' +
        encodeURIComponent(repo.jsonPath) +
        '?ref=' + encodeURIComponent(repo.branch || 'main') +
        '&t=' + Date.now(),
        { headers: Object.assign({}, authHeaders, NO_CACHE_HEADERS) }
      );
      if (fileRes.ok) {
        try {
          const got = await safeJsonWithCheck(fileRes);
          sha = (got && got.sha) || '';
        } catch (ge) {
          if (ge.__class === 'html') return { ok: false, message: 'GitHub API 请求异常（网络拦截/域名错误）：返回 HTML 而非 JSON，请确认请求域名为 api.github.com 且网络可用' };
          if (ge.__class === 'json') return { ok: false, message: '获取文件失败：本地 JSON 格式错误，无法解析响应内容' };
          throw ge;
        }
      } else if (fileRes.status === 401 || fileRes.status === 403) {
        return { ok: false, message: 'Token 权限不足：请检查 GitHub Personal Access Token 是否有效且具备 contents 写权限' };
      } else if (fileRes.status === 404) {
        sha = ''; // 文件不存在则直接创建
      } else {
        return { ok: false, message: '获取文件失败（' + fileRes.status + '）：请检查 Token 权限与仓库配置' };
      }

      // ② 提交 / 创建文件
      const body = {
        message: note,
        content: btoa(unescape(encodeURIComponent(JSON.stringify(o.payload, null, 2)))),
        branch: repo.branch || 'main',
      };
      if (sha) body.sha = sha;
      const putRes = await fetch(
        base + '/repos/' + encodeURIComponent(repo.owner) + '/' +
        encodeURIComponent(repo.repo) + '/contents/' +
        encodeURIComponent(repo.jsonPath),
        { method: 'PUT', headers: Object.assign({}, authHeaders, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) }
      );
      let putData = {};
      if (putRes.status === 401 || putRes.status === 403) {
        return { ok: false, message: 'Token 权限不足：请检查 GitHub Personal Access Token 是否有效且具备 contents 写权限' };
      }
      if (putRes.ok || putRes.status === 422 || putRes.status === 409) {
        try {
          putData = await safeJsonWithCheck(putRes);
        } catch (pe) {
          if (pe.__class === 'html') return { ok: false, message: 'GitHub API 请求异常（网络拦截/域名错误）：返回 HTML 而非 JSON，请确认请求域名为 api.github.com 且网络可用' };
          if (pe.__class === 'json') return { ok: false, message: '提交失败：本地 JSON 格式错误，无法解析响应内容' };
          throw pe;
        }
      }
      if (putRes.ok) {
        return { ok: true, message: '提交成功：' + note, commitUrl: putData.commit && putData.commit.url };
      }
      // ③ 区分错误类型（401/403 Token 权限不足已前置处理）
      if (putRes.status === 409) {
        return { ok: false, message: '文件冲突：远程文件已被修改，请刷新后重试，不会损坏仓库原有文件', raw: JSON.stringify(putData) };
      }
      if (putRes.status === 422) {
        return { ok: false, message: '提交内容无效（' + (putData.message || '') + '）', raw: JSON.stringify(putData) };
      }
      return { ok: false, message: '提交失败（' + putRes.status + '）：' + (putData.message || '未知错误'), raw: JSON.stringify(putData) };
    } catch (e) {
      // 三类异常分类提示：网络拦截/域名错误(html)、Token权限不足(token)、本地JSON格式错误(json)
      if (e && e.__class === 'html') return { ok: false, message: '网络拦截/域名错误：GitHub API 返回 HTML 而非 JSON，请确认请求 api.github.com 且网络可用' };
      if (e && e.__class === 'token') return { ok: false, message: 'Token 权限不足：请检查 GitHub Personal Access Token' };
      if (e && e.__class === 'json') return { ok: false, message: '本地 JSON 格式错误：' + (e.message || '响应无法解析') };
      // 原生 fetch 网络异常（TypeError: Failed to fetch / NetworkError）：归入「网络拦截/域名错误」类
      return { ok: false, message: '网络异常（网络拦截/域名错误）：无法连接 GitHub API，请检查网络或确认请求域名为 api.github.com' };
    }
  }

  async function safeJson(res) {
    try { return await res.json(); } catch (e) { return {}; }
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
      // HTML 响应：直接抛出，禁止走 JSON 解析
      throw apiErr('html', 'GitHub API 返回 HTML 而非 JSON（网络拦截或域名错误，请确认请求的是 api.github.com）', { snippet: snippet, contentType: ct });
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
    setPageEdit(stored);
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
  function setPageEdit(v) { write('page_edit', v || {}); }

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
        '<p class="setting-desc">把本地已保存的全部页面修改内容（文本 / 字体 / 背景锁定 / 公告）一次性提交推送到仓库 main 分支。' +
          '提交前会弹窗确认本次修改内容，防止误提交。</p>' +

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
        '</div>' +
        '<p class="admin-github-status" id="gh-status">当前 Token：' +
          (hasToken ? '已保存' : '未配置') + '（本地存储，仅用于 GitHub API）</p>' +
        '<p class="admin-github-hint">提示：仅支持文本类 JSON 数据提交；图片资源请前往 GitHub 网页端手动上传，不会通过此功能写入仓库。</p>' +
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
    const payload = buildPageContentPayload();
    const summary = describePageContent(payload);
    Modal.show({
      title: '一键上传GitHub',
      body:
        '<p class="setting-desc">将把本地已保存的全部页面修改内容提交到仓库 main 分支。</p>' +
        '<div class="dev-upload-summary">' +
          '<p class="setting-desc"><b>本次修改内容</b></p>' +
          '<pre class="dev-upload-pre">' + esc(summary) + '</pre>' +
          '<p class="setting-desc"><b>仓库</b>：' + esc((getGitHubRepo() || {}).owner || '') + '/' + esc((getGitHubRepo() || {}).repo || '') +
          ' · 分支 ' + esc(((getGitHubRepo() || {}).branch) || 'main') + ' · 文件 ' + esc(((getGitHubRepo() || {}).jsonPath) || '') + '</p>' +
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
                body: '<p>' + esc(r.message) + '</p>' +
                  (r.commitUrl ? '<p class="setting-desc"><a href="' + esc(r.commitUrl) + '" target="_blank" rel="noopener">' + esc(r.commitUrl) + '</a></p>' : '') +
                  '<p class="setting-desc">上传失败不会损坏仓库原有文件。</p>',
                actions: [{ label: '知道了', cls: 'btn-primary' }],
              });
              return;
            }
            // 上传成功回调：清除本地业务缓存并重新 fetch 远程业务文件，刷新当前页面数据源
            refreshPageContentFromRemote().then(function (rr) {
              Modal.show({
                title: '上传成功',
                body:
                  '<p>' + esc(r.message) + '</p>' +
                  (r.commitUrl ? '<p class="setting-desc"><a href="' + esc(r.commitUrl) + '" target="_blank" rel="noopener">' + esc(r.commitUrl) + '</a></p>' : '') +
                  '<p class="setting-desc">' + esc(rr.message || '已提交业务数据到远程仓库') + '</p>',
                actions: [{ label: '知道了', cls: 'btn-primary' }],
              });
            }).catch(function () {
              Modal.show({
                title: '上传成功',
                body:
                  '<p>' + esc(r.message) + '</p>' +
                  (r.commitUrl ? '<p class="setting-desc"><a href="' + esc(r.commitUrl) + '" target="_blank" rel="noopener">' + esc(r.commitUrl) + '</a></p>' : '') +
                  '<p class="setting-desc">刷新远程业务数据失败，请稍后手动检查更新。</p>',
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
   */
  function buildPageContentPayload() {
    const cfg = (typeof SDV_CONFIG !== 'undefined') ? SDV_CONFIG : {};
    return {
      generatedAt: new Date().toISOString(),
      announcements: cfg.announcements || [],
      pageEdit: getPageEdit(),      // 本地已保存的页面文本/字体修改
      fontConfig: getFontConfig(),
      backgroundLock: readLockNow(),
    };
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
      lines.push('背景锁定：' + ((payload.backgroundLock && payload.backgroundLock.locked)
        ? ((payload.backgroundLock.season || '') + '/' + (payload.backgroundLock.period || '')) : '自动'));
      lines.push('公告：' + ((payload.announcements || []).length) + ' 条');
      return lines.join('\n');
    } catch (e) {
      return JSON.stringify(payload, null, 2);
    }
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
    try {
      // ① 清空当前页面该 json 的本地缓存（页面文本/字体编辑 + 字体配置 + 背景锁定）
      try {
        localStorage.removeItem(NS + 'page_edit');
        localStorage.removeItem(NS + 'font_cfg');
        localStorage.removeItem('sdv_bg_lock');
      } catch (e) { /* 忽略 */ }

      // ② 重新 fetch 远程 jsonPath，拉取最新业务内容
      const res = await fetch(
        base + '/repos/' + encodeURIComponent(repo.owner) + '/' +
        encodeURIComponent(repo.repo) + '/contents/' +
        encodeURIComponent(repo.jsonPath) +
        '?ref=' + encodeURIComponent(repo.branch || 'main') +
        '&t=' + Date.now(),
        { headers: Object.assign({}, headers, NO_CACHE_HEADERS) }
      );
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: 'Token 权限不足：请检查 GitHub Personal Access Token 是否有效' };
      }
      if (!res.ok) {
        const err = await safeJson(res);
        return { ok: false, message: '刷新远程业务数据失败（' + res.status + '）：' + ((err && err.message) || '请检查 Token 权限') };
      }
      let data;
      try {
        data = await safeJsonWithCheck(res);
      } catch (re) {
        if (re.__class === 'html') return { ok: false, message: 'GitHub API 请求异常（网络拦截/域名错误）：返回 HTML 而非 JSON，请确认请求域名为 api.github.com 且网络可用' };
        if (re.__class === 'json') return { ok: false, message: '刷新远程业务数据失败：本地 JSON 格式错误，无法解析响应内容' };
        throw re;
      }
      // 解码 base64 内容
      let content = '';
      if (data && data.content) {
        try {
          content = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
        } catch (e) { content = ''; }
      }
      let remote = {};
      if (content) {
        try { remote = JSON.parse(content); } catch (e) { remote = {}; }
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
      }
      return { ok: true, message: '已刷新远程业务数据，页面已加载最新内容' };
    } catch (e) {
      // 三类异常分类：网络拦截/域名错误(html)、Token权限不足(token)、本地JSON格式错误(json)
      if (e && e.__class === 'html') return { ok: false, message: '网络拦截/域名错误：GitHub API 返回 HTML 而非 JSON，请确认请求 api.github.com 且网络可用' };
      if (e && e.__class === 'token') return { ok: false, message: 'Token 权限不足：请检查 GitHub Personal Access Token' };
      if (e && e.__class === 'json') return { ok: false, message: '本地 JSON 格式错误：' + (e.message || '响应无法解析') };
      return { ok: false, message: '网络异常（网络拦截/域名错误）：无法连接 GitHub API，请检查网络或确认请求域名为 api.github.com' };
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    login, logout, getDevLogin, isDev,
    getGitHubToken, setGitHubToken, getGitHubRepo, setGitHubRepo,
    pushToGitHub, buildPageContentPayload, refreshPageContentFromRemote,
    openLoginModal, openAdminPanel, openBgLockModal, doLogout,
    enterEditMode, exitEditMode, savePageEdits, resetPageEdits, applyPageEdits,
    getPageEdit, setPageEdit, getFontConfig, setFontConfig,
    FONT_TEMPLATES,
    applyDevVisibility, init,
  };
})();
