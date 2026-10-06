/**
 * ============================================================
 * 背景随时间 / 季节自动切换（纯新增模块）
 *
 * · 素材：assets/bg/{season}-{period}.png 共 16 张
 *   季节：spring / summer / autumn / winter
 *   时段：morning（清晨5-8）day（白天8-17）dusk（黄昏17-19）night（夜晚19-次日5）
 * · 季节判定：春3-5月、夏6-8月、秋9-11月、冬12/1/2月
 * · 兜底：图片加载失败 → 背景层保持透明，沿用原本背景样式，页面不崩坏
 * · 过渡：双图层交叉淡入淡出 0.8s
 * · 刷新：打开立即检测一次；每 10 分钟检测一次；切回前台立即检测
 * · 手动调试开关：仅 localhost/127.0.0.1 可见，锁定季节/时段覆盖自动判定；
 *   线上普通用户不可见，只能使用自动模式
 * ============================================================
 */
(function () {
  'use strict';

  var BG = {
    checkIntervalMs: 10 * 60 * 1000, // 每 10 分钟检测一次
    fadeMs: 800,
    lockKey: 'sdv_bg_lock',          // 手动锁定值（localStorage，仅本机调试生效）
    isLocal: typeof location !== 'undefined' &&
      (location.hostname === 'localhost' || location.hostname === '127.0.0.1'),
  };

  /** 月份(1-12) → 季节 */
  function seasonOf(month01) {
    if (month01 >= 3 && month01 <= 5) return 'spring';
    if (month01 >= 6 && month01 <= 8) return 'summer';
    if (month01 >= 9 && month01 <= 11) return 'autumn';
    return 'winter';
  }

  /** 小时(0-23) → 时段：清晨5-8 / 白天8-17 / 黄昏17-19 / 夜晚19-次日5 */
  function periodOf(hour) {
    if (hour >= 5 && hour < 8) return 'morning';
    if (hour >= 8 && hour < 17) return 'day';
    if (hour >= 17 && hour < 19) return 'dusk';
    return 'night';
  }

  function buildUrl(season, period) {
    return 'assets/bg/' + season + '-' + period + '.png';
  }

  function readLock() {
    if (!BG.isLocal) return null;
    try {
      var raw = localStorage.getItem(BG.lockKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeLock(lock) {
    if (!BG.isLocal) return;
    try { localStorage.setItem(BG.lockKey, JSON.stringify(lock)); } catch (e) { /* 忽略 */ }
  }

  /* ---------------- 背景层 ---------------- */

  function ensureLayer() {
    var layer = document.getElementById('bg-timelayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'bg-timelayer';
    layer.className = 'bg-timelayer';
    layer.innerHTML =
      '<div class="bg-img bg-current" aria-hidden="true"></div>' +
      '<div class="bg-img bg-next" aria-hidden="true"></div>';
    // 插到 body 最前，保证位于页面最底层
    document.body.insertBefore(layer, document.body.firstChild);
    return layer;
  }

  /** 应用背景：新图预加载成功后淡入、旧图淡出；失败则保持透明沿用原背景 */
  function applyBg(url) {
    var layer = ensureLayer();
    if (layer.dataset.url === url) return; // 相同背景不重复切换
    var img = new Image();
    img.onload = function () {
      var cur = layer.querySelector('.bg-current');
      var next = layer.querySelector('.bg-next');
      next.style.backgroundImage = 'url("' + url + '")';
      // 淡入淡出：新图 0→1，旧图 1→0（CSS 过渡 0.8s）
      next.style.opacity = '1';
      cur.style.opacity = '0';
      next.classList.remove('bg-next');
      next.classList.add('bg-current');
      cur.classList.remove('bg-current');
      cur.classList.add('bg-next');
      cur.style.backgroundImage = 'none';
      layer.dataset.url = url;
    };
    img.onerror = function () {
      // 兜底：加载失败 → 背景层保持透明，沿用原本背景样式，页面不崩坏
      if (typeof console !== 'undefined') {
        console.warn('[bg] 背景加载失败，沿用原背景：' + url);
      }
      layer.dataset.url = url; // 标记，避免反复尝试同一失败图
    };
    img.src = url;
  }

  /* ---------------- 检测与切换 ---------------- */

  function check() {
    var season, period;
    var lock = readLock();
    if (lock && lock.locked && lock.season && lock.period) {
      season = lock.season; // 手动锁定（仅本机调试）
      period = lock.period;
    } else {
      var d = new Date();
      season = seasonOf(d.getMonth() + 1);
      period = periodOf(d.getHours());
    }
    applyBg(buildUrl(season, period));
  }

  /* ---------------- 调试面板（仅 localhost 可见） ---------------- */

  function buildDebugPanel() {
    if (!BG.isLocal) return; // 线上普通用户看不到开关，只能自动模式
    if (document.getElementById('bg-debug-panel')) return;
    var panel = document.createElement('div');
    panel.id = 'bg-debug-panel';
    panel.className = 'bg-debug-panel';
    panel.innerHTML =
      '<h4>背景调试</h4>' +
      '<label>季节 <select id="bg-season">' +
      '<option value="spring">春</option><option value="summer">夏</option>' +
      '<option value="autumn">秋</option><option value="winter">冬</option>' +
      '</select></label>' +
      '<label>时段 <select id="bg-period">' +
      '<option value="morning">清晨</option><option value="day">白天</option>' +
      '<option value="dusk">黄昏</option><option value="night">夜晚</option>' +
      '</select></label>' +
      '<button type="button" id="bg-lock-btn">锁定当前</button>' +
      '<button type="button" id="bg-auto-btn">恢复自动</button>';
    document.body.appendChild(panel);

    var seasonSel = document.getElementById('bg-season');
    var periodSel = document.getElementById('bg-period');
    var lock = readLock();
    if (lock && lock.locked) {
      seasonSel.value = lock.season;
      periodSel.value = lock.period;
    }
    var applyLock = function () {
      writeLock({ locked: true, season: seasonSel.value, period: periodSel.value });
      check();
    };
    document.getElementById('bg-lock-btn').addEventListener('click', applyLock);
    document.getElementById('bg-auto-btn').addEventListener('click', function () {
      writeLock({ locked: false });
      check();
    });
    seasonSel.addEventListener('change', applyLock);
    periodSel.addEventListener('change', applyLock);
  }

  /* ---------------- 启动 ---------------- */

  function start() {
    ensureLayer();
    check();                    // 页面打开立即执行一次背景判断
    buildDebugPanel();
    setInterval(check, BG.checkIntervalMs); // 每 10 分钟自动检测
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) check(); // 切回前台立即刷新
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
