'use strict';
/**
 * ============================================================
 * 像素树叶飘落动画（v2.5.7 纯新增模块）
 * 不影响任何原有页面结构、组件样式与业务逻辑。
 *
 * · 素材：canvas 程序化绘制 32x20 像素「两片组合叶片」（星露谷同款双叶造型，
 *   左大右小、像素方块阶梯边缘，硬边放大无抗锯齿）
 * · 颜色：跟随项目季节配置（月份判定，与 background.js 一致）——
 *   春 = 嫩绿、夏 = 深绿、秋 = 橙黄/橘红（双色混）；冬 = 不加载（保留原有下雪等效果）
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

  /* ---------- 季节配色：春嫩绿 / 夏深绿 / 秋橙黄·橘红 ---------- */
  var COLORS = {
    spring: ['#8fd14f', '#b5e76e'],   // 嫩绿
    summer: ['#3f8f46', '#5aa852'],   // 深绿
    autumn: ['#e8a33d', '#d06a2c'],   // 橙黄 / 橘红
  };

  /* ---------- 开关：localStorage 'sdv-leaf-anim'（默认开启；'off' 关闭） ---------- */
  function isEnabled() {
    try { return localStorage.getItem('sdv-leaf-anim') !== 'off'; } catch (e) { return true; }
  }
  function setEnabled(on) {
    try { localStorage.setItem('sdv-leaf-anim', on ? 'on' : 'off'); } catch (e) { /* 忽略 */ }
    if (on) start(); else stop();
  }

  /* ---------- 像素双叶组合模板（参考星露谷同款两片组合叶片：左大右小，
   * 像素方块阶梯边缘；两套造型 32x20） ---------- */
  var MASKS = [
    [ // 合叶：两片在底部交汇成柄（左片大、右片小，参考附图）
      '00000000000000000000000000000000',
      '00000000111110000000000000000000',
      '00000011111111000000000000000000',
      '00001111111111100000000111100000',
      '00011111111111110000001111110000',
      '00111111111111111000011111111000',
      '01111111111111111101111111111100',
      '11111111111111111111111111111100',
      '11111111111111111111111111111100',
      '11111111111111111111111111111100',
      '01111111111111111111111111111000',
      '01111111111111110001111111110000',
      '00111111111111100000111111100000',
      '00011111111111000000011111000000',
      '00001111111100000000001110000000',
      '00000111110000000000000000000000',
      '00000011100000000000000000000000',
      '00000001000000000000000000000000',
      '00000000000000000000000000000000',
      '00000000000000000000000000000000',
    ],
    [ // 双叶：两片独立椭圆并排，中部相接（左片大、右片小，参考附图）
      '00000000000000000000000000000000',
      '00000000111110000000000000000000',
      '00000011111111000000000000000000',
      '00001111111111100000011111000000',
      '00011111111111110001111111100000',
      '00111111111111110111111111110000',
      '01111111111111111111111111111000',
      '11111111111111111111111111111100',
      '11111111111111111111111111111100',
      '01111111111111111111111111111000',
      '00111111111111110111111111110000',
      '00111111111111100011111111100000',
      '00011111111110000001111111000000',
      '00001111111000000000111110000000',
      '00000111100000000000001100000000',
      '00000010000000000000000000000000',
      '00000000000000000000000000000000',
      '00000000000000000000000000000000',
      '00000000000000000000000000000000',
      '00000000000000000000000000000000',
    ],
  ];

  /** 预渲染像素树叶到离屏小画布（32x20，透明底） */
  function preRender(mask, color) {
    var c = document.createElement('canvas');
    c.width = 32; c.height = 20;
    var g = c.getContext('2d');
    for (var y = 0; y < 20; y++) {
      for (var x = 0; x < 32; x++) {
        if (mask[y].charAt(x) === '1') {
          g.fillStyle = color;
          g.fillRect(x, y, 1, 1);
        }
      }
    }
    return c;
  }

  /** 生成一片树叶（含其预渲染图案缓存） */
  function makeLeaf() {
    var mask = MASKS[(Math.random() * MASKS.length) | 0];
    var color = COLORS[season][(Math.random() * COLORS[season].length) | 0];
    var size = 34 + Math.random() * 16;              // 适中尺寸：34~50px（双叶横向造型）
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
    ctx.drawImage(L.sprite, -L.size / 2, -L.size / 2, L.size, L.size * 20 / 32); // 保持 32:20 双叶比例
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
