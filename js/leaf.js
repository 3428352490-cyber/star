'use strict';
/**
 * ============================================================
 * 像素树叶飘落动画（纯新增模块，不影响任何原有页面结构、组件样式与业务逻辑）
 *
 * · 素材：canvas 程序化绘制 32x20 像素树叶（cos 圆润曲线轮廓，轮廓每行缓变、
 *   中部饱满两端圆尖，告别“方块感”）；三套造型随机出现：
 *   ① 单叶圆润  ② 双叶组合（左大右小月牙） ③ 长叶带柄
 * · 明暗层次：每片叶分三区 —— '1'=亮面（上半部）、'2'=暗面（下半部）、'3'=深色叶脉；
 *   季节色板每季 4 档明暗变体，飘落的叶子间明暗各异
 * · 颜色：跟随项目季节配置（月份判定，与 background.js 一致）——
 *   春 = 嫩绿、夏 = 深绿、秋 = 橙黄/橘红；冬 = 不加载（保留原有下雪等效果）
 * · 密度：中等密度（默认 22 片）；低性能设备自动减半（10 片）
 *   低性能判定：CPU 核数 ≤ 4 / 移动端 UA / 系统减弱动效偏好
 * · 动画：自上而下缓慢飘落 + 左右正弦摇摆 + 缓慢旋转；叶超出屏幕底部自动销毁并重建
 * · 层级：z-index 40（背景 -1、内容 1、板块卡片 5-6 之上，可覆盖板块内容；
 *   模态弹窗 100 / Toast 120 / 开发者面板 90 之下）；pointer-events:none 不拦截任何交互
 * · 性能：requestAnimationFrame 驱动 + 时间步长钳制；页面隐藏自动暂停；resize 自适应
 * · 开关：localStorage 'sdv-leaf-anim' = 'off' 关闭（默认开启；DevAdmin 面板开关联动，
 *   跨标签页 storage 事件即时同步）
 * ============================================================
 */
var LeafFX = (function () {
  var cv = null, ctx = null, leaves = [], rafId = 0, lastTs = 0, running = false;
  var BASE_COUNT = 22;   // 中等密度
  var LOW_COUNT = 10;    // 低性能设备减半

  /* ---------- 低性能设备判定 ---------- */
  var isLowPerf = (function () {
    try {
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return true;
      if (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '')) return true;
      if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    } catch (e) { /* 忽略 */ }
    return false;
  })();

  /* ---------- 季节判定（与 background.js 月份规则一致） ---------- */
  var season = (function () {
    var m = new Date().getMonth() + 1;
    if (m >= 3 && m <= 5) return 'spring';
    if (m >= 6 && m <= 8) return 'summer';
    if (m >= 9 && m <= 11) return 'autumn';
    return 'winter';
  })();

  /* ---------- 季节配色（每季 4 档明暗变体：亮 → 暗，飘落叶片间明暗有层次） ---------- */
  var COLORS = {
    spring: ['#9edb5c', '#8fd14f', '#74b83f', '#5e9e34'],   // 嫩绿
    summer: ['#55a85c', '#3f8f46', '#2f7537', '#25602c'],   // 深绿
    autumn: ['#f2b14a', '#e8a33d', '#d06a2c', '#b4531f'],   // 橙黄 / 橘红
  };

  /* ---------- 开关：localStorage 'sdv-leaf-anim'（默认开启；'off' 关闭） ---------- */
  function isEnabled() {
    try { return localStorage.getItem('sdv-leaf-anim') !== 'off'; } catch (e) { return true; }
  }
  function setEnabled(on) {
    try { localStorage.setItem('sdv-leaf-anim', on ? 'on' : 'off'); } catch (e) { /* 忽略 */ }
    if (on) start(); else stop();
  }

  /** 颜色明暗调节：factor<1 变暗、>1 变亮（保留色调），用于叶脉 / 暗面 / 明暗变体 */
  function shade(hex, factor) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
    var g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
    var b = Math.min(255, Math.round((n & 255) * factor));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  /* ---------- 圆润像素叶掩码（cos 曲线：中部饱满、两端圆尖，轮廓缓变不“方”） ----------
   * '1'=亮面（上半部）/ '2'=暗面（下半部）/ '3'=深色叶脉；三套造型 32x20 */
  var MASKS = (function () {
    var W = 32, H = 20;
    /** 按 cos 曲线绘制一片叶片：y 行半宽 = halfW·cos(dy·π/2)^0.72（dy=0 中部最宽，|dy|=1 收尖） */
    function gen(parts) {
      var rows = [];
      for (var y = 0; y < H; y++) rows.push(new Array(W).fill('0'));
      for (var p = 0; p < parts.length; p++) {
        var pt = parts[p];
        for (var y2 = 0; y2 < H; y2++) {
          var dy = (y2 - pt.midY) / pt.halfH;
          if (dy < -1 || dy > 1) continue;
          var hw = Math.round(pt.halfW * Math.pow(Math.cos(dy * Math.PI / 2), 0.72));
          var s = Math.max(0, pt.cx - hw), e = Math.min(W - 1, pt.cx + hw);
          if (pt.notch && y2 >= pt.notch[0] && y2 <= pt.notch[1]) e -= 2; // 月牙：右缘中部内凹
          for (var x = s; x <= e; x++) {
            if (x === pt.veinCx && y2 >= pt.midY + 3) rows[y2][x] = '3'; // 短柄脉：仅暗区底部，不劈开叶面
            else rows[y2][x] = (y2 <= pt.midY) ? '1' : '2';              // 上亮下暗
          }
        }
      }
      // 长叶柄：底部两行加柄（并入暗面区）
      for (var q = 0; q < parts.length; q++) {
        var st = parts[q].stem;
        if (st) for (var ys = st[0]; ys <= st[1]; ys++) { rows[ys][15] = '2'; rows[ys][16] = '2'; }
      }
      return rows.map(function (r) { return r.join(''); });
    }
    return [
      gen([{ cx: 16, halfW: 8, midY: 10, halfH: 8, veinCx: 16 }]),          // ① 单叶圆润
      gen([{ cx: 11, halfW: 6, midY: 9, halfH: 8, veinCx: 11, notch: [8, 11] },  // ② 双叶组合
            { cx: 25, halfW: 4, midY: 9, halfH: 6, veinCx: 25 }]),
      gen([{ cx: 16, halfW: 5, midY: 8, halfH: 8, veinCx: 16, stem: [17, 18] }]), // ③ 长叶带柄
    ];
  })();

  /** 预渲染像素树叶到离屏小画布（32x20，透明底；'1'亮面主色 / '2'暗面×0.78 / '3'深色叶脉×0.55） */
  function preRender(mask, color) {
    var c = document.createElement('canvas');
    c.width = 32; c.height = 20;
    var g = c.getContext('2d');
    var dark = shade(color, 0.78);
    var vein = shade(color, 0.55);
    for (var y = 0; y < 20; y++) {
      for (var x = 0; x < 32; x++) {
        var ch = mask[y].charAt(x);
        if (ch === '1' || ch === '2' || ch === '3') {
          g.fillStyle = (ch === '1') ? color : ((ch === '2') ? dark : vein);
          g.fillRect(x, y, 1, 1);
        }
      }
    }
    return c;
  }

  /** 生成一片树叶（随机造型 + 随机明暗色档 + 随机尺寸，含其预渲染图案缓存） */
  function makeLeaf() {
    var mask = MASKS[(Math.random() * MASKS.length) | 0];
    var color = COLORS[season][(Math.random() * COLORS[season].length) | 0];
    var size = 26 + Math.random() * 18;              // 适中尺寸：26~44px
    return {
      mask: mask, color: color, sprite: null,        // sprite 惰性预渲染
      size: size,
      x: Math.random() * cv.width,
      y: -(size + Math.random() * 60),               // 从顶部上方进入
      vy: 24 + Math.random() * 40,                   // 缓慢下落：24~64 px/s
      swayT: Math.random() * Math.PI * 2,
      swayF: 0.6 + Math.random() * 0.8,              // 摇摆频率
      swayA: 10 + Math.random() * 14,                // 摇摆幅度
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 1.2,               // 缓慢旋转
    };
  }

  function drawLeaf(L, x, y) {
    if (!L.sprite) L.sprite = preRender(L.mask, L.color); // 首帧惰性生成
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(L.rot);
    ctx.drawImage(L.sprite, -L.size / 2, -L.size / 2, L.size, L.size * 20 / 32); // 保持 32:20 画布比例
    ctx.restore();
  }

  /** 超出底部 → 销毁并重建为一片新叶（顶部重新进入） */
  function respawn(L) {
    var fresh = makeLeaf();
    for (var k in fresh) L[k] = fresh[k];
  }

  function tick(ts) {
    rafId = requestAnimationFrame(tick);
    if (!lastTs) lastTs = ts;
    var dt = Math.min((ts - lastTs) / 1000, 0.05); // 钳制长帧，防卡顿跳变
    lastTs = ts;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (var i = 0; i < leaves.length; i++) {
      var L = leaves[i];
      L.y += L.vy * dt;
      L.swayT += dt;
      L.rot += L.vr * dt;
      var x = L.x + Math.sin(L.swayT * L.swayF) * L.swayA; // 左右摇摆
      if (L.y > cv.height + L.size) respawn(L);            // 超出底部自动销毁重建
      drawLeaf(L, x, L.y);
    }
  }

  function resize() {
    if (!cv) return;
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
  }

  /* ---------- 启停 ---------- */
  function start() {
    if (running || season === 'winter') return; // 冬天不加载（保留下雪等原有效果）
    if (!cv) {
      try {
        cv = document.createElement('canvas');
        cv.id = 'leaf-canvas';
        resize();
        ctx = cv.getContext('2d');
        if (!ctx) { cv = null; return; } // 环境不支持 canvas 绘制时静默跳过（如无头测试环境）
        ctx.imageSmoothingEnabled = false; // 像素硬边
        document.body.appendChild(cv);
        window.addEventListener('resize', resize);
      } catch (e) { cv = null; return; }
    }
    leaves = [];
    var n = isLowPerf ? LOW_COUNT : BASE_COUNT;
    for (var i = 0; i < n; i++) leaves.push(makeLeaf());
    lastTs = 0;
    running = true;
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  /* ---------- 页面隐藏自动暂停（性能） ---------- */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (isEnabled() && season !== 'winter') start();
  });

  /* ---------- 跨标签页开关同步 ---------- */
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', function (e) {
      if (e.key === 'sdv-leaf-anim') {
        if (e.newValue === 'off') stop(); else start();
      }
    });
  }

  /* ---------- 启动 ---------- */
  if (isEnabled()) start();

  return { start: start, stop: stop, setEnabled: setEnabled, isEnabled: isEnabled };
})();

/* 双挂载：全局 var（测试/内部） + window（DevAdmin 面板开关等浏览器侧使用） */
if (typeof window !== 'undefined') window.LeafFX = LeafFX;
