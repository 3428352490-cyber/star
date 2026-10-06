'use strict';

/* ===== 通用工具函数 ===== */

/** HTML 转义，防止动态内容注入（如云端版本说明） */
function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/** 当前日期戳：20261005 */
function dateStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
}

/**
 * v2.4.2 输入设备检测：区分电脑端 / 手机端。
 * 电脑端（hover + 精确指针）：输入框回车触发提交；手机端回车不提交（仅换行/无操作）。
 * 无 matchMedia 的环境（Node 测试等）默认按电脑端处理。
 */
function isDesktopInput() {
  try {
    if (typeof window !== 'undefined' && window.matchMedia && typeof window.matchMedia === 'function') {
      return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }
  } catch (e) { /* 忽略检测异常，回退默认 */ }
  return true;
}
