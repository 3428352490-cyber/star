'use strict';

/**
 * ============================================================
 * 前端轻量安全防护模块（SecurityGuard）
 *
 * 能力（均为前端辅助，真实安全防护建议使用 Cloudflare WAF 等
 * 服务端/边缘防护，前端防护无法替代）：
 *   1. 爬虫 UA 识别：匹配常见爬虫/自动化工具 UA，仅控制台告警 +
 *      写入复盘日志，不阻断页面（前端无法真正阻止爬虫）。
 *   2. 用户交互行为检测：监听全局 click，检测异常高频点击/疑似
 *      自动化操作（自动化脚本通常表现为固定间隔无规律高频点击），
 *      仅控制台告警 + 日志，不打断正常用户。
 *   3. 前端请求限流：对版本检测等关键请求做窗口限流（同一时间
 *      窗口内超出阈值直接放行拦截结果，防止异常循环请求打爆
 *      静态资源服务），超限不报错、仅日志。
 * ============================================================
 */
const SecurityGuard = (() => {
  /* ---------- 1. 爬虫 / 自动化 UA 识别 ---------- */
  const CRAWLER_PATTERN = /bot|spider|crawler|curl|wget|python|httpclient|headless|phantomjs|selenium|playwright|puppeteer|scrapy|slurp|bingpreview|feedfetcher/i;

  function isCrawler(ua) {
    const u = String(ua || (typeof navigator !== 'undefined' ? navigator.userAgent : ''));
    return CRAWLER_PATTERN.test(u);
  }

  function checkUA() {
    if (isCrawler()) {
      /* eslint-disable no-console */
      console.warn('[SecurityGuard] 检测到疑似爬虫/自动化 UA（前端辅助识别，不影响页面运行）');
      /* eslint-enable no-console */
      if (typeof ReviewLog !== 'undefined') {
        ReviewLog.log('security', {
          status: 'fail',
          message: '检测到疑似爬虫/自动化 UA',
          extra: { ua: (typeof navigator !== 'undefined' ? navigator.userAgent : '') },
        });
      }
      return false;
    }
    return true;
  }

  /* ---------- 2. 用户交互行为检测（高频点击告警） ---------- */
  const CLICK_WINDOW_MS = 2000;   // 2 秒窗口
  const CLICK_LIMIT = 20;         // 2 秒内超过 20 次视为异常
  let clickTimes = [];
  let clickWarned = false;

  function trackClick() {
    const now = Date.now();
    clickTimes.push(now);
    clickTimes = clickTimes.filter((t) => now - t <= CLICK_WINDOW_MS);
    if (clickTimes.length > CLICK_LIMIT && !clickWarned) {
      clickWarned = true;
      /* eslint-disable no-console */
      console.warn('[SecurityGuard] 检测到异常高频点击（' + clickTimes.length + ' 次/' + (CLICK_WINDOW_MS / 1000) + ' 秒），疑似自动化脚本');
      /* eslint-enable no-console */
      if (typeof ReviewLog !== 'undefined') {
        ReviewLog.log('security', {
          status: 'fail',
          message: '异常高频点击，疑似自动化脚本',
          extra: { count: clickTimes.length, windowMs: CLICK_WINDOW_MS },
        });
      }
    }
    if (clickTimes.length === 0) clickWarned = false; // 窗口清空后允许再次告警
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', () => trackClick(), { passive: true });
  }

  /* ---------- 3. 前端请求限流 ---------- */
  const RATE_LIMIT = { windowMs: 5000, max: 3 }; // 5 秒窗口最多 3 次同类型请求
  const windows = {};

  /**
   * 检查请求是否允许发出（限流）
   * @param {string} key 请求类型（如 version-check）
   * @returns {boolean} true=允许；false=已超限（调用方应跳过本次请求）
   */
  function allowRequest(key) {
    const now = Date.now();
    const k = String(key || 'default');
    const w = windows[k] || { times: [] };
    w.times = w.times.filter((t) => now - t <= RATE_LIMIT.windowMs);
    if (w.times.length >= RATE_LIMIT.max) {
      if (typeof ReviewLog !== 'undefined') {
        ReviewLog.log('security', {
          status: 'fail',
          message: '请求限流触发（' + k + '）',
          extra: { windowMs: RATE_LIMIT.windowMs, max: RATE_LIMIT.max, count: w.times.length },
        });
      }
      return false;
    }
    w.times.push(now);
    windows[k] = w;
    return true;
  }

  /** 重置全部限流窗口计数（预留：测试环境/调试使用，页面正常流程不调用） */
  function resetLimits() {
    Object.keys(windows).forEach((k) => delete windows[k]);
  }

  return { isCrawler, checkUA, allowRequest, resetLimits };
})();
