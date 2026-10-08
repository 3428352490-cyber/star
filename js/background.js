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
 * ============================================================
 */
(function () {
  'use strict';

  var BG = {
    checkIntervalMs: 10 * 60 * 1000, // 每 10 分钟检测一次
    fadeMs: 800,
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

  /* ---------------- 背景层 ---------------- */

  /**
   * 采样背景图片底边主色调（canvas 取底部 15% 区域的平均色），
   * 写入 CSS 变量 --bg-edge-color / --bg-edge-soft 供渐变起点使用，
   * 让渐变起点色与图片底边真实颜色一致，消除生硬分界线。
   * 取色失败时静默返回，CSS 回退近似色，不影响任何轮换/容错逻辑。
   */
  function sampleEdgeColor(img) {
    try {
      var c = document.createElement('canvas');
      var w = 16, h = 2;
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      // 取原图底部 15% 区域缩放到 16x2，第 2 行即底边主色
      var sh = Math.max(1, Math.floor(img.height * 0.15));
      ctx.drawImage(img, 0, img.height - sh, img.width, sh, 0, 0, w, h);
      var d = ctx.getImageData(0, 1, w, 1).data;
      var r = 0, g = 0, b = 0;
      for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      r = Math.round(r / w); g = Math.round(g / w); b = Math.round(b / w);
      document.documentElement.style.setProperty('--bg-edge-color', 'rgb(' + r + ',' + g + ',' + b + ')');
      // 中间过渡色：图底色与米白底色的柔和混合（约 45% 图色 + 55% 米白）
      var mix = function (a, m) { return Math.round(a * 0.45 + m * 0.55); };
      document.documentElement.style.setProperty('--bg-edge-soft', 'rgb(' +
        mix(r, 242) + ',' + mix(g, 237) + ',' + mix(b, 217) + ')');
    } catch (e) { /* 取色失败：CSS 使用近似色回退，不影响功能 */ }
  }

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
      // 新背景成功渲染：标记生效，CSS 据此隐藏旧版顶部背景大图，避免两图重叠
      document.body.classList.add('bg-live');
      // 采样当前背景图底边主色，写入 CSS 变量供渐变起点使用（失败静默回退近似色）
      sampleEdgeColor(img);
    };
    img.onerror = function () {
      // 兜底：加载失败 → 背景层保持透明，沿用原本背景样式，页面不崩坏
      if (typeof console !== 'undefined') {
        console.warn('[bg] 背景加载失败，沿用原背景：' + url);
      }
      // 新背景不可用：恢复旧版顶部背景大图作为回退
      document.body.classList.remove('bg-live');
      layer.dataset.url = url; // 标记，避免反复尝试同一失败图
    };
    img.src = url;
  }

  /* ---------------- 检测与切换 ---------------- */

  function check() {
    var d = new Date();
    var season = seasonOf(d.getMonth() + 1);
    var period = periodOf(d.getHours());
    applyBg(buildUrl(season, period));
  }

  /* ---------------- 启动 ---------------- */

  function start() {
    ensureLayer();
    check();                    // 页面打开立即执行一次背景判断
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
