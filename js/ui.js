'use strict';

/**
 * ============================================================
 * 通用 UI 组件：弹窗（Modal）与轻提示（Toast）
 * ============================================================
 */

const Modal = (() => {
  const root = () => document.getElementById('modal-root');

  /**
   * 展示弹窗
   * @param {object} opts { title, body(HTML), actions:[{label, cls, onClick}] }
   */
  function show(opts) {
    const o = opts || {};
    const actions = o.actions || [];
    const btns = actions.length
      ? actions.map((a, i) => '<button class="btn ' + (a.cls || '') + '" data-modal-action="' + i + '">' + esc(a.label) + '</button>').join('')
      : '<button class="btn btn-primary" data-modal-action="close">知道了</button>';

    const box = root();
    if (!box) return;
    box.innerHTML =
      '<div class="modal-mask" data-modal-mask>' +
        '<div class="modal" role="dialog" aria-modal="true">' +
          '<h3 class="modal-title">' + esc(o.title || '') + '</h3>' +
          '<div class="modal-body">' + (o.body || '') + '</div>' +
          '<div class="modal-actions">' + btns + '</div>' +
        '</div>' +
      '</div>';

    const mask = box.querySelector('.modal-mask');
    if (mask) {
      mask.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-modal-action]');
        if (btn) {
          const idx = btn.dataset.modalAction;
          if (idx !== 'close' && actions[+idx] && typeof actions[+idx].onClick === 'function') {
            actions[+idx].onClick();
          }
          close();
        } else if (e.target === mask) {
          close();
        }
      });
    }
  }

  function close() {
    const box = root();
    if (box) box.innerHTML = '';
  }

  return { show, close };
})();

const Toast = (() => {
  let timer = null;

  function show(msg) {
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      document.querySelectorAll('.toast').forEach((t) => t.remove());
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (el.remove) el.remove();
    }, 2200);
  }

  return { show };
})();
