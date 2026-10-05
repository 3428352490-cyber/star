'use strict';

/**
 * ============================================================
 * 搜索历史 + AI 推荐（搜索面板增强模块）
 *  · 搜索历史：localStorage 本地保存，上限 10 条，默认展示 5 条，
 *    展开后展示全部；支持单条删除与一键清空；清除浏览器缓存即清空。
 *  · AI 推荐：固定 6 条推荐词（用户历史 + 社区热点关键词），
 *    支持搜索框占位文字轮播（3 秒切换、聚焦停止）与独立推荐列表。
 *  · 交互：点击搜索框展开面板、点击空白处收起、输入时自动隐藏并显示结果、
 *    搜索成功后去重置顶写入历史。
 *  · 数据层：SearchAI.fetchRecommendations 为 Mock 数据请求函数，
 *    后续接入后端仅替换此函数，UI 与交互逻辑不变。
 * 依赖约定：js/config.js → util → api.js（社区热点词源）→ search-ui.js
 * ============================================================
 */
const SearchUI = (() => {
  const HISTORY_KEY = 'sdv-guide:search-history';
  const HISTORY_MAX = 10;      // 历史总数上限
  const HISTORY_SHOW = 5;      // 默认直接展示条数
  const RECOMMEND_COUNT = 6;   // 固定推荐词条数
  const CAROUSEL_MS = 3000;    // 占位轮播间隔

  /* ================= 搜索历史（本地存储） ================= */
  const SearchHistory = {
    KEY: HISTORY_KEY,
    MAX: HISTORY_MAX,
    SHOW: HISTORY_SHOW,

    /** 读取历史（损坏/越界数据自动兜底为 []） */
    get() {
      try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) return [];
        return arr.filter((s) => typeof s === 'string' && s.trim());
      } catch (e) {
        return [];
      }
    },

    /** 新增搜索词：去重置顶，上限 10 条 */
    add(word) {
      const w = String(word || '').trim();
      if (!w) return this.get();
      let list = this.get().filter((s) => s !== w);
      list.unshift(w);
      if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* 存储不可用时静默 */ }
      return list;
    },

    /** 删除单条历史 */
    remove(word) {
      const list = this.get().filter((s) => s !== word);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* 静默 */ }
      return list;
    },

    /** 清空全部历史 */
    clear() {
      try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* 静默 */ }
      return [];
    },
  };

  /* ================= AI 搜索推荐（Mock 数据层） ================= */
  const SearchAI = {
    /** 社区热点词库：来自社区帖子标题关键词 + 游戏常用词条 */
    HOT_WORDS: ['蓝莓', '温室', '钓鱼', '种子', '铁匠铺', '野花', '姜岛', '洒水器'],

    /**
     * 推荐数据请求函数（Mock）：
     * 结合用户过往搜索历史（最多占 3 条、置前）+ 社区热点词填充至 6 条。
     * 后续接入后端时仅替换此函数为 fetch 请求，UI/交互逻辑不变。
     */
    async fetchRecommendations(history) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const hist = (history || []).filter(Boolean).slice(0, 3);
      const recs = [];
      for (const w of hist) {
        if (recs.length >= RECOMMEND_COUNT) break;
        if (!recs.includes(w)) recs.push(w);
      }
      for (const w of this.HOT_WORDS) {
        if (recs.length >= RECOMMEND_COUNT) break;
        if (!recs.includes(w)) recs.push(w);
      }
      return recs.slice(0, RECOMMEND_COUNT);
    },
  };

  /* ================= 搜索面板（UI 与交互） ================= */
  let input = null;      // #search-input
  let panel = null;      // #search-panel
  let recs = [];         // 当前推荐词
  let visible = false;   // 面板展开态
  let expanded = false;  // 历史展开态（>5 条时）
  let carouselTimer = null;
  let bound = false;

  /** 挂载：绑定输入框与面板、渲染并启动轮播（每次进入搜索页调用） */
  function mount() {
    const el = document.getElementById('search-input');
    const p = document.getElementById('search-panel');
    input = el;
    panel = p;
    if (!el || !p) return;
    visible = false;
    expanded = false;
    if (!bound) bind();
    refreshRecommendations();
    refresh();
    show();      // 进入搜索页默认展示历史 + 推荐面板
    startCarousel();
  }

  /** 面板事件绑定（仅绑定一次；innerHTML 重渲染不丢失委托） */
  function bind() {
    bound = true;
    if (panel.addEventListener) {
      panel.addEventListener('click', onPanelClick);
    }
    if (input.addEventListener) {
      input.addEventListener('focus', () => { stopCarousel(); show(); });
      input.addEventListener('blur', () => { startCarousel(); });
      input.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.keyCode === 13) && input.value.trim()) {
          submitSearch(input.value);
        }
      });
      input.addEventListener('input', () => {
        if (input.value.trim()) hide(); // 开始输入：隐藏历史与推荐，切换为搜索结果
        else show();                     // 清空输入：恢复面板
      });
    }
    // 点击页面空白处收起面板
    document.addEventListener('click', (e) => {
      if (!visible) return;
      const t = e.target;
      if (t && typeof t.closest === 'function' && t.closest('.search-area')) return;
      hide();
    });
  }

  /** 面板内点击委托：词条 / 删除 / 清空 / 展开 */
  function onPanelClick(e) {
    const t = e.target;
    if (!t || typeof t.closest !== 'function' || !t.closest) return;
    const del = t.closest('[data-del]');
    if (del) {
      e.stopPropagation && e.stopPropagation();
      SearchHistory.remove(del.dataset.del);
      refresh();
      return;
    }
    const clearBtn = t.closest('[data-clear]');
    if (clearBtn) {
      e.stopPropagation && e.stopPropagation();
      SearchHistory.clear();
      refresh();
      return;
    }
    const exp = t.closest('[data-expand]');
    if (exp) {
      e.stopPropagation && e.stopPropagation();
      expanded = !expanded;
      refresh();
      return;
    }
    const wordEl = t.closest('[data-word]');
    if (wordEl) {
      e.stopPropagation && e.stopPropagation();
      submitSearch(wordEl.dataset.word);
    }
  }

  /** 展示面板并刷新（点击搜索框时） */
  function show() {
    visible = true;
    refresh();
    if (panel) panel.style.display = '';
  }

  /** 收起面板 */
  function hide() {
    visible = false;
    if (panel) panel.style.display = 'none';
  }

  /** 刷新面板内容（历史 + 推荐） */
  function refresh() {
    if (!panel) return;
    const history = SearchHistory.get();
    const showCount = expanded ? HISTORY_MAX : HISTORY_SHOW;
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
          (expanded ? '收起' : '展开全部（' + history.length + '）') + '</button>';
      }
    }

    const recoHtml = recs.length
      ? recs.map((w) => '<button type="button" class="search-reco-item" data-word="' + esc(w) + '">' + esc(w) + '</button>').join('')
      : '<p class="search-empty">推荐加载中…</p>';

    panel.innerHTML =
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

  /** 提交搜索：写入历史（去重置顶）、填入输入框、触发既有搜索逻辑、收起面板 */
  function submitSearch(word) {
    const w = String(word || '').trim();
    if (!w) return;
    SearchHistory.add(w);
    if (input) input.value = w;
    hide();
    if (input && typeof input.dispatchEvent === 'function') {
      const ev = new Event('input', { bubbles: true });
      input.dispatchEvent(ev);
    }
  }

  /** 拉取推荐数据（Mock；后续替换 fetchRecommendations 即可接入后端） */
  function refreshRecommendations() {
    SearchAI.fetchRecommendations(SearchHistory.get()).then((list) => {
      recs = Array.isArray(list) ? list.slice(0, RECOMMEND_COUNT) : [];
      refresh();
      startCarousel();
    }).catch(() => { /* 推荐失败静默，不影响搜索 */ });
  }

  /** 占位文字轮播：3 秒切换推荐词；聚焦/输入时停止 */
  function startCarousel() {
    stopCarousel();
    if (!input || !recs.length) return;
    let i = 0;
    input.placeholder = '搜索：' + recs[i];
    carouselTimer = setInterval(() => {
      if (!input) { stopCarousel(); return; }
      i = (i + 1) % recs.length;
      input.placeholder = '搜索：' + recs[i];
    }, CAROUSEL_MS);
  }

  function stopCarousel() {
    if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = null; }
  }

  /** 转义 HTML（依赖 util.js 的 esc；缺失时兜底） */
  function esc(s) {
    if (typeof globalThis.esc === 'function') return globalThis.esc(s);
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return {
    mount,
    show,
    hide,
    refresh,
    submitSearch,
    startCarousel,
    stopCarousel,
    SearchHistory,
    SearchAI,
    HISTORY_KEY,
    HISTORY_MAX,
    HISTORY_SHOW,
    RECOMMEND_COUNT,
    CAROUSEL_MS,
  };
})();
