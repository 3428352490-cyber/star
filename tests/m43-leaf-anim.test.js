'use strict';
/* M43 阶段测试：v2.5.7 全局像素树叶飘落动画（纯新增模块，不影响任何原有页面/业务）——
   ① index.html 引入 leaf.css / leaf.js（背景脚本之后）；
   ② leaf.css 层级与交互：fixed、z-index:0（背景 -1 之上、内容 1 之下）、pointer-events:none、像素硬边；
   ③ 季节配色：春嫩绿 / 夏深绿 / 秋橙黄·橘红；冬季不加载（保留下雪等原有效果）；
   ④ 中等密度 + 低性能降量：BASE_COUNT=22 / LOW_COUNT=10，CPU≤4核/移动端/减弱动效自动减半；
   ⑤ 动画要素：缓慢下落 vy、正弦左右摇摆 sway、缓慢旋转 rot、超出底部自动销毁重建 respawn；
   ⑥ 开发者开关：localStorage 'sdv-leaf-anim'='off' 关闭（默认开启）；DevAdmin 面板含 data-leaf-anim-switch；
   ⑦ LeafFX 暴露 start/stop/setEnabled/isEnabled API。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();

test('M43-1 index.html 引入 leaf.css 与 leaf.js（位于背景脚本之后）', () => {
  const html = readAppFile('index.html');
  assert.ok(html.includes('css/leaf.css'), '未引入 leaf.css');
  assert.ok(html.includes('js/leaf.js'), '未引入 leaf.js');
  const iLeaf = html.indexOf('js/leaf.js');
  const iBg = html.indexOf('js/background.js');
  assert.ok(iLeaf > iBg, 'leaf.js 应在 background.js 之后加载（可读取 DevAdmin 开关状态）');
});

test('M43-2 leaf.css 层级与交互：覆盖板块内容、不拦截点击、像素硬边', () => {
  const css = readAppFile('css/leaf.css');
  assert.ok(css.includes('z-index: 40'), '树叶层应覆盖板块/卡片（内容1之上）且低于模态弹窗');
  assert.ok(css.includes('pointer-events: none'), '应不拦截任何点击/触摸（透过树叶可正常操作）');
  assert.ok(css.includes('position: fixed'), '应为固定定位');
  assert.ok(css.includes('pixelated'), '应为像素硬边渲染');
});

test('M43-3 leaf.js 圆润像素叶（cos 曲线三套造型：单叶/双叶组合/长叶带柄）+ 三区明暗渐变 + 季节配色与冬季不加载', () => {
  const src = readAppFile('js/leaf.js');
  assert.ok(src.includes('c.width = 32; c.height = 20;'), '树叶掩码应为 32x20 像素');
  assert.ok(src.includes('MASKS = (function'), '树叶掩码模板缺失');
  assert.ok(src.includes("'1'=亮面"), '亮面区缺失（明暗渐变）');
  assert.ok(src.includes("'2'=暗面"), '暗面区缺失（明暗渐变）');
  assert.ok(src.includes("'3'=深色叶脉"), '深色叶脉区缺失');
  assert.ok(src.includes('function shade'), '明暗调节函数缺失');
  assert.ok(src.includes('Math.cos'), 'cos 圆润曲线轮廓缺失（消除方块感）');
  assert.ok(src.includes('单叶圆润'), '第一套造型（单叶圆润）缺失');
  assert.ok(src.includes('双叶组合'), '第二套造型（双叶组合）缺失');
  assert.ok(src.includes('长叶带柄'), '第三套造型（长叶带柄）缺失');
  assert.ok(src.includes("season === 'winter'"), '冬季应不加载树叶');
  assert.ok(src.includes('COLORS = {'), '季节配色表缺失');
  assert.ok(src.includes("spring: ['#9edb5c'"), '春季嫩绿配色缺失');
  assert.ok(src.includes("summer: ['#55a85c'"), '夏季深绿配色缺失');
  assert.ok(src.includes("autumn: ['#f2b14a'"), '秋季橙黄/橘红配色缺失');
});

test('M43-4 中等密度 + 低性能降量 + 连续飘落（首轮全屏分布/顶部重生）', () => {
  const src = readAppFile('js/leaf.js');
  assert.ok(src.includes('BASE_COUNT = 26'), '中等密度基数缺失');
  assert.ok(src.includes('LOW_COUNT = 12'), '低性能降量基数缺失');
  assert.ok(src.includes('hardwareConcurrency'), 'CPU 核数判定缺失');
  assert.ok(src.includes('prefers-reduced-motion'), '减弱动效偏好判定缺失');
  assert.ok(src.includes('makeLeaf(true)'), '首轮全屏均匀分布缺失');
  assert.ok(src.includes('makeLeaf(false)'), '重生自顶部进入缺失');
});

test('M43-5 动画要素：缓慢下落 + 左右摇摆 + 旋转 + 超出底部销毁重建', () => {
  const src = readAppFile('js/leaf.js');
  assert.ok(src.includes('vy'), '下落速度参数缺失');
  assert.ok(src.includes('swayF') && src.includes('swayA'), '左右摇摆参数缺失');
  assert.ok(src.includes('L.rot'), '旋转参数缺失');
  assert.ok(src.includes('respawn'), '超出底部销毁重建函数缺失');
  assert.ok(src.includes('requestAnimationFrame'), 'rAF 驱动缺失');
});

test('M43-6 开发者开关：localStorage 控制 + DevAdmin 面板开关', () => {
  const src = readAppFile('js/leaf.js');
  assert.ok(src.includes("localStorage.getItem('sdv-leaf-anim')"), 'leaf.js 未读取开关键');
  const da = readAppFile('js/dev-admin.js');
  assert.ok(da.includes('data-leaf-anim-switch'), '开发者面板缺少树叶动画开关');
  assert.ok(da.includes('sdv-leaf-anim'), '开发者面板开关未联动 localStorage');
});

test('M43-7 LeafFX 暴露启停/开关 API（默认开启）', () => {
  const LeafFX = ref('LeafFX');
  assert.ok(LeafFX, 'LeafFX 全局对象缺失');
  assert.equal(typeof LeafFX.start, 'function', '缺少 start');
  assert.equal(typeof LeafFX.stop, 'function', '缺少 stop');
  assert.equal(typeof LeafFX.setEnabled, 'function', '缺少 setEnabled');
  assert.equal(typeof LeafFX.isEnabled, 'function', '缺少 isEnabled');
});
