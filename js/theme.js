'use strict';

/**
 * ============================================================
 * 深浅色主题系统（一期完整实现）
 * - 「跟随系统主题」开启：自动同步设备系统深浅模式（实时监听变化）
 * - 「跟随系统主题」关闭：锁定手动选定主题
 * - 手动切换深浅色时，自动关闭「跟随系统主题」开关
 * - 关闭跟随前，把当前生效主题写入手动值，防止界面跳变
 * ============================================================
 */
const Theme = (() => {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');

  function systemDark() {
    return mql.matches;
  }

  /** 当前生效主题：跟随系统 or 手动锁定 */
  function effective() {
    const t = Store.getTheme();
    return t.followSystem ? (systemDark() ? 'dark' : 'light') : t.manual;
  }

  /** 应用主题到页面（data-theme 属性 + 浏览器主题色） */
  function apply() {
    const mode = effective();
    document.documentElement.dataset.theme = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && typeof meta.setAttribute === 'function') {
      meta.setAttribute('content', mode === 'dark' ? '#14151a' : '#f2edd9');
    }
  }

  /** 手动切换主题（自动关闭「跟随系统」开关） */
  function setManual(mode) {
    Store.setTheme({ followSystem: false, manual: mode === 'dark' ? 'dark' : 'light' });
    apply();
  }

  /** 设置「跟随系统主题」开关 */
  function setFollowSystem(on) {
    if (!on) {
      // 关闭跟随前，把当前生效主题写入手动值，避免界面跳变
      Store.setTheme({ followSystem: false, manual: effective() });
    } else {
      Store.setTheme({ followSystem: true });
    }
    apply();
  }

  // 跟随系统开启时，监听系统深浅模式实时变化
  if (mql.addEventListener) {
    mql.addEventListener('change', () => {
      if (Store.getTheme().followSystem) apply();
    });
  }

  return { apply, setManual, setFollowSystem, effective };
})();
