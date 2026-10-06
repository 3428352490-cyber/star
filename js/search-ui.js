'use strict';

/**
 * ============================================================
 * 搜索模块（搜索历史 + AI 推荐 + 占位轮播 + 生命周期管理）
 *  · 所有内部变量统一 search_ 前缀，避免与全局变量冲突
 *  · initSearchPanel()：渲染前先销毁页面内已存在的搜索组件 DOM、
 *    清除 search_placeholderTimer 定时器，杜绝多次切换叠加多套组件
 *  · destroySearchPanel()：离开搜索页时销毁组件引用并清除定时器
 *  · 底部 Tab 规则：当前已是搜索页时重复点击搜索 Tab 不做任何
 *    面板显隐操作；切到其他 Tab 由 hashchange 监听销毁搜索组件
 *  · 占位轮播：3 秒向上滑动切换推荐词；聚焦停止、失焦且空输入恢复；
 *    输入有内容停止、清空输入恢复
 *  · 空输入点击搜索：读取当前轮播词 search_placeholderCurrentWord 执行搜索
 *  · AI 推荐词条点击：填入关键词 → 立即 runSearch() → 自动写入历史（去重置顶）
 *  · 搜索历史 localStorage 持久化：上限 10 条、默认显 5 条、展开、单删、清空
 *  · 控制台日志：DOM 销毁 / 定时器启停 / Tab 切换 / 搜索执行
 *  · 数据层：search_fetchRecommendations 为 Mock 请求函数，
 *    后续接入后端仅替换此函数，UI 与交互逻辑不变
 * 依赖约定：js/config.js → util → api.js → search-ui.js
 * ============================================================
 */
const SearchUI = (() => {
  /* ---- 常量 ---- */
  const HISTORY_KEY = 'sdv-guide:search-history';
  const HISTORY_MAX = 10;      // 历史总数上限
  const HISTORY_SHOW = 5;      // 默认直接展示条数
  const RECOMMEND_COUNT = 6;   // 固定推荐词条数
  const CAROUSEL_MS = 3000;    // 占位轮播间隔

  /* ---- 搜索模块状态（统一 search_ 前缀） ---- */
  let search_inputEl = null;             // #search-input
  let search_panelEl = null;             // #search-panel
  let search_carouselEl = null;          // #search-carousel（占位文字轮播层）
  let search_btnEl = null;               // #search-btn
  let search_recs = [];                  // 当前推荐词
  let search_placeholderTimer = null;    // 占位轮播定时器
  let search_placeholderCurrentWord = ''; // 当前轮播展示的关键词（空输入点击搜索时使用）
  let search_placeholderIndex = 0;       // 轮播下标
  let search_panelVisible = false;       // 面板展开态
  let search_panelExpanded = false;      // 历史展开态（>5 条时）
  let search_focused = false;            // 搜索框聚焦标记
  let search_bound = false;              // 事件是否已绑定（仅一次）

  const log = (msg) => {
    try {
      // 测试环境（harness 注入 __testEls）不打印日志，避免污染 node --test 的 TAP 输出流
      if (typeof globalThis.__testEls !== 'undefined') return;
      console.log('[搜索] ' + msg);
    } catch (e) { /* 日志失败不影响功能 */ }
  };

  /* ================= 搜索历史（localStorage） ================= */
  function search_historyGet() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.filter((s) => typeof s === 'string' && s.trim());
    } catch (e) {
      return [];
    }
  }

  /** 新增搜索词：去重置顶，上限 10 条 */
  function search_historyAdd(word) {
    const w = String(word || '').trim();
    if (!w) return search_historyGet();
    let list = search_historyGet().filter((s) => s !== w);
    list.unshift(w);
    if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* 存储不可用时静默 */ }
    return list;
  }

  /** 删除单条历史 */
  function search_historyRemove(word) {
    const list = search_historyGet().filter((s) => s !== word);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* 静默 */ }
    return list;
  }

  /** 清空全部历史 */
  function search_historyClear() {
    try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* 静默 */ }
    return [];
  }

  /* ================= AI 搜索推荐（Mock 数据层） ================= */
  const HOT_WORDS = ['蓝莓', '温室', '钓鱼', '种子', '铁匠铺', '野花', '姜岛', '洒水器'];

  /**
   * 推荐数据请求函数（Mock）：历史词最多占 3 条置前 + 热点词填充至 6 条。
   * 后续接入后端时仅替换此函数为 fetch 请求，UI/交互逻辑不变。
   */
  async function search_fetchRecommendations(history) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const hist = (history || []).filter(Boolean).slice(0, 3);
    const recs = [];
    for (const w of hist) {
      if (recs.length >= RECOMMEND_COUNT) break;
      if (!recs.includes(w)) recs.push(w);
    }
    for (const w of HOT_WORDS) {
      if (recs.length >= RECOMMEND_COUNT) break;
      if (!recs.includes(w)) recs.push(w);
    }
    return recs.slice(0, RECOMMEND_COUNT);
  }

  /* ================= 占位轮播 ================= */

  /** 渲染单条轮播词条：旧条向上滑出（carousel-out），新条自下方滑入（carousel-in） */
  function search_renderCarouselItem(i, initial) {
    if (!search_carouselEl) return;
    const w = search_recs[i % search_recs.length];
    search_placeholderCurrentWord = w; // 维护当前轮播词（空输入点击搜索时使用）
    const cur = search_carouselEl.querySelector('.search-carousel-item');
    const item = document.createElement('span');
    item.className = 'search-carousel-item';
    item.textContent = '搜索：' + w;
    search_carouselEl.appendChild(item);
    if (initial) {
      item.classList.add('carousel-in-place'); // 首条直接就位（无滑动）
      return;
    }
    if (cur) cur.classList.add('carousel-out'); // 旧条向上滑出
    if (item.offsetHeight !== undefined) void item.offsetHeight; // 强制 reflow 后启动过渡（兼容无 rAF 环境）
    item.classList.add('carousel-in'); // 新条自下方滑入
    if (cur) setTimeout(() => { if (cur.parentNode) cur.parentNode.removeChild(cur); }, 340);
  }

  /** 启动占位轮播：3 秒向上滑动切换推荐词；聚焦/输入中不启动 */
  function search_startPlaceholderTimer() {
    search_stopPlaceholderTimer();
    if (!search_inputEl || !search_carouselEl || !search_recs.length) return;
    if (search_focused || search_inputEl.value.trim()) return; // 聚焦/输入中不轮播
    log('启动占位轮播');
    search_carouselEl.innerHTML = '';
    search_placeholderIndex = 0;
    search_renderCarouselItem(0, true); // 首条直接就位
    search_placeholderTimer = setInterval(() => {
      if (!search_carouselEl) { search_stopPlaceholderTimer(); return; }
      search_placeholderIndex = (search_placeholderIndex + 1) % search_recs.length;
      search_renderCarouselItem(search_placeholderIndex, false); // 后续条：向上滑动进入
    }, CAROUSEL_MS);
  }

  /** 停止占位轮播定时器 */
  function search_stopPlaceholderTimer() {
    if (search_placeholderTimer) {
      clearInterval(search_placeholderTimer);
      search_placeholderTimer = null;
      log('停止占位轮播');
    }
  }

  /** 轮播层可见性同步：输入有内容或聚焦时隐藏并暂停，否则显示并轮播 */
  function search_syncCarousel() {
    if (!search_carouselEl) return;
    const busy = !!search_inputEl.value.trim();
    search_carouselEl.style.display = busy ? 'none' : '';
    if (busy || search_focused) search_stopPlaceholderTimer();
    else search_startPlaceholderTimer();
  }

  /* ================= 搜索面板（UI 与交互） ================= */

  /** 展示面板并刷新（点击搜索框时） */
  function search_showPanel() {
    search_panelVisible = true;
    search_renderPanel();
    if (search_panelEl) search_panelEl.style.display = '';
  }

  /** 收起面板 */
  function search_hidePanel() {
    search_panelVisible = false;
    if (search_panelEl) search_panelEl.style.display = 'none';
  }

  /** 刷新面板内容（历史 + 推荐） */
  function search_renderPanel() {
    if (!search_panelEl) return;
    const history = search_historyGet();
    const showCount = search_panelExpanded ? HISTORY_MAX : HISTORY_SHOW;
    const shown = history.slice(0, showCount);
    const hasMore = history.length > HISTORY_SHOW;

    let historyHtml;
    if (!history.length) {
      historyHtml = '<p class="search-empty">暂无搜索历史</p>';
    } else {
      historyHtml = shown.map((w) =>
        '<div class="search-history-item">' +
          '<button type="button" class="search-history-word" data-word="' + esc(w) + '">' + esc(w) + '</button>' +
          '<button type="button" class="search-history-del" data-del="' + esc(w) + '" aria-label="删除 ' + esc(w + '') + '">×</button>' +
        '</div>'
      ).join('');
      if (hasMore) {
        historyHtml += '<button type="button" class="search-expand-btn" data-expand>' +
          (search_panelExpanded ? '收起' : '展开全部（' + history.length + '）') + '</button>';
      }
    }

    const recoHtml = search_recs.length
      ? search_recs.map((w) => '<button type="button" class="search-reco-item" data-word="' + esc(w) + '">' + esc(w) + '</button>').join('')
      : '<p class="search-empty">推荐加载中…</p>';

    search_panelEl.innerHTML =
      '<div class="search-block search-block-history">' +
        '<div class="search-block-head">' +
          '<span class="search-block-title">搜索历史</span>' +
          (history.length ? '<button type="button" class="search-clear-btn" data-clear>清空</button>' : '') +
        '</div>' +
        '<div class="search-history-list">' + historyHtml + '</div>' +
      '</div>' +
      '<div class="search-block search-block-reco">' +
        '<div class="search-block-head"><span class="search-block-title">AI 搜索推荐</span></div>' +
        '<div class="search-reco-list">' + recoHtml + '</div>' +
      '</div>';
  }

  /* ================= 搜索执行 ================= */

  /**
   * 执行搜索：
   *  - 传入词为空时，读取当前轮播展示的关键词 search_placeholderCurrentWord
   *  - 写入历史（去重置顶）→ 填入输入框 → 触发 app 既有搜索逻辑 → 收起面板
   */
  function runSearch(word) {
    const w = String(word == null ? '' : word).trim();
    const finalWord = w || search_placeholderCurrentWord; // 空输入 → 当前轮播词
    if (!finalWord) {
      log('搜索词为空，忽略');
      return;
    }
    search_historyAdd(finalWord); // 去重置顶写入历史（自动去重、重复置顶）
    if (search_inputEl) search_inputEl.value = finalWord;
    search_hidePanel();
    search_syncCarousel(); // 有输入内容时隐藏轮播层
    log('执行搜索：' + finalWord);
    if (search_inputEl && typeof search_inputEl.dispatchEvent === 'function') {
      const ev = new Event('input', { bubbles: true });
      search_inputEl.dispatchEvent(ev); // 触发 app 既有搜索逻辑（handleSearch）
    }
  }

  /* ================= 生命周期（销毁 / 初始化） ================= */

  /**
   * 销毁搜索组件：清除轮播定时器、清空轮播词与 DOM 引用。
   * 每次切换页面时调用，防止旧 DOM / 定时器残留叠加。
   */
  function destroySearchPanel() {
    search_stopPlaceholderTimer();
    search_placeholderCurrentWord = '';
    search_placeholderIndex = 0;
    search_recs = [];
    search_inputEl = null;
    search_panelEl = null;
    search_carouselEl = null;
    search_btnEl = null;
    search_panelVisible = false;
    search_panelExpanded = false;
    search_focused = false;
    log('销毁旧搜索组件 DOM 并清除轮播定时器');
  }

  /**
   * 初始化搜索面板：渲染前先销毁已存在的搜索组件（DOM + 定时器），
   * 避免重复生成多套搜索组件；再重新获取 DOM、渲染并启动轮播。
   */
  function initSearchPanel() {
    log('初始化搜索面板');
    destroySearchPanel(); // ① 渲染前销毁旧组件，杜绝叠加
    const el = document.getElementById('search-input');
    const p = document.getElementById('search-panel');
    const c = document.getElementById('search-carousel');
    const btn = document.getElementById('search-btn');
    search_inputEl = el;
    search_panelEl = p;
    search_carouselEl = c;
    search_btnEl = btn;
    if (!el || !p) {
      log('未找到搜索组件，跳过初始化');
      return;
    }
    if (!search_bound) search_bindEvents();
    // 重置轮播层可见性（无输入无聚焦时显示轮播层）
    if (search_carouselEl) search_carouselEl.style.display = '';
    search_fetchRecommendations(search_historyGet()).then((list) => {
      search_recs = Array.isArray(list) ? list.slice(0, RECOMMEND_COUNT) : [];
      search_renderPanel();
      search_startPlaceholderTimer();
    }).catch(() => { /* 推荐失败静默，不影响搜索 */ });
    search_renderPanel();
    search_showPanel(); // 进入搜索页默认展示历史 + 推荐面板
    search_startPlaceholderTimer();
  }

  /** 面板事件绑定（仅绑定一次；innerHTML 重渲染不丢失委托） */
  function search_bindEvents() {
    search_bound = true;
    if (search_panelEl && search_panelEl.addEventListener) {
      search_panelEl.addEventListener('click', search_onPanelClick);
    }
    if (search_inputEl && search_inputEl.addEventListener) {
      search_inputEl.addEventListener('focus', () => {
        search_focused = true; // 聚焦：暂停轮播并隐藏轮播层（原生占位已空，输入区干净）
        search_stopPlaceholderTimer();
        if (search_carouselEl) search_carouselEl.style.display = 'none';
        search_showPanel();
      });
      search_inputEl.addEventListener('blur', () => {
        search_focused = false;
        search_syncCarousel(); // 失焦且无输入：恢复轮播层
      });
      search_inputEl.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.keyCode === 13) && search_inputEl.value.trim()) {
          runSearch(search_inputEl.value);
        }
      });
      search_inputEl.addEventListener('input', () => {
        search_syncCarousel(); // 开始输入：隐藏轮播层与历史推荐；清空输入：恢复
        if (search_inputEl.value.trim()) search_hidePanel();
        else search_showPanel();
      });
    }
    // 搜索按钮：点击执行搜索；空输入时用当前轮播词
    if (search_btnEl && search_btnEl.addEventListener) {
      search_btnEl.addEventListener('click', () => {
        log('点击搜索按钮');
        runSearch(search_inputEl ? search_inputEl.value : '');
      });
    }
    // 点击页面空白处收起面板
    document.addEventListener('click', search_onDocClick);
    // Tab 切换：离开搜索页时销毁搜索组件（当前已是搜索页重复点击不做任何显隐操作）
    window.addEventListener('hashchange', search_onHashChange);
    log('绑定搜索面板事件');
  }

  /** Tab 切换处理：离开搜索页销毁组件；停留在搜索页不做任何面板显隐操作 */
  function search_onHashChange() {
    if (location.hash.indexOf('#/search') !== 0) {
      log('切出搜索页，销毁搜索组件');
      destroySearchPanel();
    }
  }

  /** 点击页面空白处收起面板；点击搜索区/导航与路由元素不收起（避免"再次点击搜索图标面板消失"） */
  function search_onDocClick(e) {
    if (!search_panelVisible || !search_panelEl) return;
    const t = e.target;
    if (t && typeof t.closest === 'function') {
      if (t.closest('.search-area') || t.closest('[data-route]')) return;
    }
    search_hidePanel();
  }

  /** 面板内点击委托：词条 / 删除 / 清空 / 展开 */
  function search_onPanelClick(e) {
    const t = e.target;
    if (!t || typeof t.closest !== 'function' || !t.closest) return;
    const del = t.closest('[data-del]');
    if (del) {
      e.stopPropagation && e.stopPropagation();
      search_historyRemove(del.dataset.del);
      search_renderPanel();
      return;
    }
    const clearBtn = t.closest('[data-clear]');
    if (clearBtn) {
      e.stopPropagation && e.stopPropagation();
      search_historyClear();
      search_renderPanel();
      return;
    }
    const exp = t.closest('[data-expand]');
    if (exp) {
      e.stopPropagation && e.stopPropagation();
      search_panelExpanded = !search_panelExpanded;
      search_renderPanel();
      return;
    }
    const wordEl = t.closest('[data-word]');
    if (wordEl) {
      e.stopPropagation && e.stopPropagation();
      runSearch(wordEl.dataset.word); // 点击词条：填入并立即搜索，自动写入历史
    }
  }

  /** 转义 HTML（依赖 util.js 的 esc；缺失时兜底） */
  function esc(s) {
    if (typeof globalThis.esc === 'function') return globalThis.esc(s);
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return {
    /* 生命周期 */
    initSearchPanel,
    destroySearchPanel,
    mount: initSearchPanel, // 兼容既有挂载调用
    /* 交互 */
    runSearch,
    submitSearch: runSearch,
    show: search_showPanel,
    hide: search_hidePanel,
    refresh: search_renderPanel,
    startCarousel: search_startPlaceholderTimer,
    stopCarousel: search_stopPlaceholderTimer,
    /* 数据层 */
    SearchHistory: {
      KEY: HISTORY_KEY, MAX: HISTORY_MAX, SHOW: HISTORY_SHOW,
      get: search_historyGet, add: search_historyAdd,
      remove: search_historyRemove, clear: search_historyClear,
    },
    SearchAI: { HOT_WORDS, fetchRecommendations: search_fetchRecommendations },
    /* 常量 */
    HISTORY_KEY, HISTORY_MAX, HISTORY_SHOW, RECOMMEND_COUNT, CAROUSEL_MS,
  };
})();
