'use strict';

/**
 * ============================================================
 * 本地持久化层 —— 保证重启不丢失
 * 核心规则：所有配置改动「立即写透」到 localStorage，
 * 不做“退出时才保存”，因此重启电脑 / 手机 / 重开应用都不会重置。
 * 双端互通由后期云端数据同步承担（一期不做文件导入导出）。
 * ============================================================
 */
const Store = (() => {
  const KEY = SDV_CONFIG.storage.configKey;
  let data = null;

  /** 默认配置（首次启动 / 读取失败的基准） */
  function defaultConfig() {
    return {
      saveVersion: SDV_CONFIG.storage.saveVersion,
      theme: {
        followSystem: SDV_CONFIG.theme.followSystemDefault,
        manual: SDV_CONFIG.theme.manualDefault,
      },
      quickNav: {
        selected: SDV_CONFIG.quickNav.defaultSelected.slice(),
      },
      meta: {
        updatedAt: null, // 上次配置变更时间
      },
    };
  }

  /** 深合并：对象逐层合并，数组与标量直接替换 */
  function deepMerge(base, patch) {
    if (patch === undefined || patch === null) return base;
    if (Array.isArray(base) || Array.isArray(patch)) return patch;
    if (typeof base === 'object' && typeof patch === 'object') {
      const out = { ...base };
      Object.keys(patch).forEach((k) => {
        out[k] = deepMerge(base[k], patch[k]);
      });
      return out;
    }
    return patch;
  }

  /** 加载本地存档；首次启动立即落盘；读取失败回退默认 */
  function load() {
    data = defaultConfig();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          data = deepMerge(data, parsed);
        }
      }
    } catch (e) {
      console.warn('[Store] 读取本地存档失败，已使用默认配置', e);
    }
    save();
    return data;
  }

  /** 立即写透到 localStorage */
  function save() {
    data.meta.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[Store] 写入本地存档失败', e);
    }
  }

  /* ---------- 主题 ---------- */
  function getTheme() {
    return data.theme;
  }

  function setTheme(patch) {
    data.theme = deepMerge(data.theme, patch);
    save();
  }

  /* ---------- 快捷导航 ---------- */
  function getSelectedNav() {
    return data.quickNav.selected.slice();
  }

  /** 校验：仅保留已知模块 key，且最多 maxSelected 个 */
  function setSelectedNav(keys) {
    const validKeys = SDV_CONFIG.modules.map((m) => m.key);
    data.quickNav.selected = (Array.isArray(keys) ? keys : [])
      .filter((k) => validKeys.includes(k))
      .slice(0, SDV_CONFIG.quickNav.maxSelected);
    save();
  }

  return {
    load,
    save,
    getTheme,
    setTheme,
    getSelectedNav,
    setSelectedNav,
  };
})();
