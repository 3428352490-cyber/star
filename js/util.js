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
