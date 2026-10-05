'use strict';

/**
 * ============================================================
 * 页面简易 bug 自检模块（SelfCheck）
 *
 * 触发时机：页面加载完成时、每次版本轮询前自动执行。
 * 自检项（轻量、同步、幂等）：
 *   - 关键全局依赖是否存在（SDV_CONFIG / Store / Theme / Modal /
 *     Toast / Pages / Router / App / Updater / ReviewLog 等）
 *   - localStorage 是否可读写
 *   - fetch 是否可用
 *   - 本地版本号格式是否合法（x.y.z 语义化版本）
 *   - 弹窗组件 Modal.show 是否可调用
 * 异常信息仅输出控制台（console.warn / console.error），不打扰普通用户；
 * 每次自检结果写入前端复盘日志（ReviewLog，eventType=self-check）。
 * ============================================================
 */
const SelfCheck = (() => {
  /** 关键全局依赖清单（页面正常运行所需） */
  const REQUIRED_GLOBALS = [
    'SDV_CONFIG', 'Store', 'Theme', 'Modal', 'Toast', 'Pages',
    'Router', 'App', 'Updater', 'ReviewLog',
  ];
  /** 可选全局依赖（缺失仅告警，不阻断） */
  const OPTIONAL_GLOBALS = ['CommunityAPI', 'Community', 'SecurityGuard'];

  function hasGlobal(name) {
    // 顶层 const/let 声明不挂载在 window/globalThis 上，需经全局词法作用域判断；
    // 优先 globalThis 属性探测，兜底用 Function 构造器（与 vm/浏览器全局词法作用域一致）
    try {
      if (typeof globalThis[name] !== 'undefined') return true;
    } catch (e) {}
    try {
      /* eslint-disable no-new-func */
      return !!new Function('return typeof ' + name + ' !== "undefined"')();
      /* eslint-enable no-new-func */
    } catch (e) {
      return false;
    }
  }

  function checkLocalStorage() {
    const errors = [];
    try {
      const probe = '__sdv_selfcheck_probe__';
      localStorage.setItem(probe, '1');
      const back = localStorage.getItem(probe);
      localStorage.removeItem(probe);
      if (back !== '1') errors.push('localStorage 读写异常（读取值与写入值不一致）');
    } catch (e) {
      errors.push('localStorage 不可用：' + (e && e.message ? e.message : e));
    }
    return errors;
  }

  function checkFetch() {
    return typeof fetch === 'function' ? [] : ['fetch 不可用（页面无法请求云端版本）'];
  }

  function checkLocalVersion() {
    const errors = [];
    try {
      if (typeof SDV_CONFIG === 'undefined') return ['SDV_CONFIG 缺失，无法校验版本号'];
      const ver = String(SDV_CONFIG.app.version || '');
      if (!/^\d+\.\d+\.\d+$/.test(ver)) errors.push('本地版本号格式非法：' + ver);
    } catch (e) {
      errors.push('本地版本号读取异常：' + (e && e.message ? e.message : e));
    }
    return errors;
  }

  function checkModal() {
    try {
      if (typeof Modal === 'undefined' || typeof Modal.show !== 'function') {
        return ['Modal.show 不可用（弹窗组件缺失）'];
      }
      return [];
    } catch (e) {
      return ['Modal 检查异常：' + (e && e.message ? e.message : e)];
    }
  }

  /**
   * 执行自检（页面加载 / 每次版本轮询前调用）
   * @returns {{ok: boolean, errors: string[], warnings: string[]}}
   */
  function run() {
    const errors = [];
    const warnings = [];

    // 必选依赖缺失 → 错误
    REQUIRED_GLOBALS.forEach((name) => {
      if (!hasGlobal(name)) errors.push('关键全局缺失：' + name);
    });
    // 可选依赖缺失 → 仅告警
    OPTIONAL_GLOBALS.forEach((name) => {
      if (!hasGlobal(name)) warnings.push('可选全局缺失：' + name);
    });

    errors.push.apply(errors, checkLocalStorage());
    errors.push.apply(errors, checkFetch());
    errors.push.apply(errors, checkLocalVersion());
    errors.push.apply(errors, checkModal());

    const ok = errors.length === 0;
    if (ok && warnings.length) {
      /* eslint-disable no-console */
      console.warn('[SelfCheck] 自检通过，但有告警：', warnings);
      /* eslint-enable no-console */
    } else if (!ok) {
      /* eslint-disable no-console */
      console.warn('[SelfCheck] 自检发现问题（不影响页面继续运行）：');
      errors.forEach((e) => console.warn('  - ' + e));
      /* eslint-enable no-console */
    }
    // 自检结果写入复盘日志（仅控制台可见，不打扰用户）
    if (typeof ReviewLog !== 'undefined') {
      ReviewLog.log('self-check', {
        status: ok ? 'success' : 'fail',
        message: ok ? '自检通过' : '自检发现问题 ' + errors.length + ' 项',
        extra: { errors, warnings },
      });
    }
    return { ok, errors, warnings };
  }

  return { run, REQUIRED_GLOBALS };
})();
