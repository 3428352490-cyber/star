'use strict';

/**
 * ============================================================
 * 前端复盘日志系统（ReviewLog）
 *
 * 存储位置：localStorage，键名 page_review_logs
 * 单条日志字段：
 *   timestamp — 时间戳（ms）
 *   timeStr   — 可读时间（YYYY-MM-DD HH:mm:ss）
 *   eventType — 事件类型（page-init / self-check / version-fetch /
 *               version-compare / fetch-error / security / modal-open / modal-close）
 *   status    — success | fail
 *   message   — 描述
 *   extra     — 可选附加数据（对象）
 *
 * 自动清理（每次写入新日志时执行）：
 *   a) 超过 7 天的日志自动删除；
 *   b) 总条数上限 100 条，超出自动删除最旧日志。
 *
 * 日志访问：仅在浏览器控制台提供 showLogs() 查看全部日志、
 * clearLogs() 一键清空；普通用户页面无任何日志 UI。
 * ============================================================
 */
const ReviewLog = (() => {
  const KEY = 'page_review_logs';
  const MAX_ITEMS = 100;
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

  function readAll() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function writeAll(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      /* 存储满/不可用时静默，不干扰业务 */
    }
  }

  /** 清理：超过 7 天删除；超过 100 条删最旧（在每次写入时自动执行） */
  function cleanup(list) {
    const now = Date.now();
    let out = list.filter((item) => item && typeof item.timestamp === 'number' && now - item.timestamp <= MAX_AGE_MS);
    if (out.length > MAX_ITEMS) out = out.slice(out.length - MAX_ITEMS);
    return out;
  }

  function formatTime(ts) {
    try {
      const d = new Date(ts);
      const pad = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
        pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    } catch (e) {
      return String(ts);
    }
  }

  /**
   * 写入一条日志（写入后自动清理）
   * @param {string} eventType 事件类型
   * @param {object} [opt] { status, message, extra }
   */
  function log(eventType, opt) {
    const o = opt || {};
    const entry = {
      timestamp: Date.now(),
      timeStr: formatTime(Date.now()),
      eventType: String(eventType || 'unknown'),
      status: o.status === 'fail' ? 'fail' : 'success',
      message: String(o.message || ''),
      extra: o.extra !== undefined ? o.extra : undefined,
    };
    const list = readAll();
    list.push(entry);
    writeAll(cleanup(list));
    return entry;
  }

  /** 查看全部日志（浏览器控制台函数，普通页面无 UI） */
  function showLogs() {
    const list = readAll();
    /* eslint-disable no-console */
    if (!list.length) {
      console.log('[ReviewLog] 暂无日志');
      return;
    }
    console.log('[ReviewLog] 共 ' + list.length + ' 条日志（7 天 / 最多 100 条）:');
    list.forEach((e, i) => {
      console.log(
        '  #' + (i + 1) + ' [' + e.timeStr + '] ' + e.eventType +
        ' → ' + e.status + (e.message ? ' | ' + e.message : '') +
        (e.extra !== undefined ? ' | ' + JSON.stringify(e.extra) : '')
      );
    });
    /* eslint-enable no-console */
    return list;
  }

  /** 一键清空全部日志（浏览器控制台函数） */
  function clearLogs() {
    try {
      localStorage.removeItem(KEY);
      /* eslint-disable no-console */
      console.log('[ReviewLog] 日志已清空');
      /* eslint-enable no-console */
    } catch (e) {
      /* eslint-disable no-console */
      console.warn('[ReviewLog] 清空日志失败', e);
      /* eslint-enable no-console */
    }
  }

  /* 控制台全局函数（普通用户页面无 UI，仅供开发者调试） */
  if (typeof window !== 'undefined') {
    window.showLogs = showLogs;
    window.clearLogs = clearLogs;
  }

  return { log, showLogs, clearLogs, readAll, cleanup, MAX_ITEMS, MAX_AGE_MS };
})();
