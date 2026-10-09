'use strict';
/* M44 阶段测试：v2.7.0 图鉴首页分类卡片像素木质相框重构 + 图标导入能力
   ① 图鉴页结构：顶部工具栏（导入图标入口）+ 每张分类卡片 = 相框方框（.tile-frame，框内仅图标）+ 框外下方文字（.tile-label）；
   ② 相框样式：正方形、外粗深棕/中橘棕/内浅橙多层像素边框、浅米色内底、四角浅灰像素块装饰；
   ③ 图标容器：占满相框内部、透明底，图标自动居中/等比例缩放适配（object-fit contain + pixelated 硬边），不溢出不遮挡相框外框；
   ④ 图标导入：选图 → 等比例缩放（canvas ≤128px）→ Modal 选择目标分类 → localStorage 'sdv-codex-icons' 存储；
   ⑤ 渲染优先：mountIcons 优先使用导入图标，其次 assets/icons/{key}.png，最后首字占位；
   ⑥ 兼容：原 38 分类瓦片计数与分组结构不变，其他页面 tile() 不受影响。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();
const Pages = ref('Pages');

function count(str, sub) {
  return str.split(sub).length - 1;
}

test('M44-1 图鉴页：工具栏导入入口 + 相框内图标/框外文字结构（38 分类不变）', () => {
  const html = Pages.codex();
  assert.equal(count(html, 'class="tile tile-codex"'), 38, '分类瓦片仍应为 38');
  assert.ok(html.includes('data-action="codex-import-icon"'), '缺少「导入图标」入口按钮');
  assert.ok(html.includes('class="codex-toolbar"'), '缺少图鉴顶部工具栏');
  assert.ok(html.includes('<span class="tile-frame">'), '分类卡片缺少像素相框容器');
  // 框内仅图标：tile-frame 内部直接是 tile-icon，文字标签在 frame 闭合之后
  const frameIdx = html.indexOf('<span class="tile-frame">');
  const frameEnd = html.indexOf('</span>', frameIdx);
  assert.ok(html.slice(frameIdx, frameEnd).includes('tile-icon'), '相框内应包含图标容器');
  const afterFrame = html.slice(frameEnd, frameEnd + 400);
  assert.ok(afterFrame.includes('tile-label'), '文字应位于相框外侧下方（图标与文字相互独立）');
  assert.ok(html.includes('生产') && html.includes('工艺') && html.includes('收集'), '三大板块保留');
});

test('M44-2 其他 tile 调用方不受影响（tile() 原结构无相框）', () => {
  const src = readAppFile('js/pages.js');
  const tileStart = src.indexOf('function tile(');
  const tileBody = src.slice(tileStart, src.indexOf('\n  }', tileStart)); // tile() 自身函数体（不含后续注释）
  assert.ok(!tileBody.includes('tile-frame'), '通用 tile() 不应引入相框结构');
  assert.ok(tileBody.includes('tile-icon'), '通用 tile() 图标容器保持原样');
  const tileCodexFn = src.slice(src.indexOf('function tileCodex('));
  assert.ok(tileCodexFn.includes('tile-frame'), 'tileCodex() 应包含相框结构');
});

test('M44-3 相框 CSS：正方形多层像素边框 + 四角装饰 + 图标适配不溢出', () => {
  const comp = readAppFile('css/components.css');
  assert.ok(comp.includes('.tile-codex .tile-frame'), '缺少相框布局容器');
  assert.ok(comp.includes('.tile-codex .tile-icon') && comp.includes('aspect-ratio: 1 / 1'), '相框本体应为正方形');
  assert.ok(comp.includes('border: 4px solid #4A2F1D'), '缺少外粗深棕相框边');
  assert.ok(comp.includes('#8A5A33') && comp.includes('#D9A86C'), '缺少中橘棕/内浅橙木纹层');
  assert.ok(comp.includes('#F6EBCF'), '缺少浅米色内底');
  assert.ok(comp.includes('.tile-codex .tile-icon::before') && comp.includes('.tile-codex .tile-icon::after'), '缺少四角像素块装饰');
  assert.ok(comp.includes('object-fit: contain'), '图标应等比例缩放适配（不溢出）');
  assert.ok(comp.includes('.tile-codex .tile-img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }'), '导入图标应像素硬边且适配相框');
  assert.ok(comp.includes('.tile-codex .tile-label'), '框外文字样式缺失');
  assert.ok(comp.includes('.codex-toolbar') && comp.includes('.icon-target-select'), '工具栏/分类选择下拉样式缺失');
});

test('M44-4 图标导入逻辑：选图缩放 + 分类选择 + localStorage 存储 + 渲染优先', () => {
  const src = readAppFile('js/app.js');
  assert.ok(src.includes("localStorage.getItem('sdv-codex-icons')"), '导入图标存储键缺失');
  assert.ok(src.includes('function pickIconFile'), '缺少文件选择函数');
  assert.ok(src.includes("inp.accept = 'image/*'"), '应仅接受图片文件');
  assert.ok(src.includes('function processIconImage'), '缺少图片缩放函数');
  assert.ok(src.includes('imageSmoothingEnabled = false'), '缩放应保持像素硬边');
  assert.ok(src.includes('Math.min(1, max /'), '应等比例缩放（最长边 ≤128px）');
  assert.ok(src.includes('codex-icon-target'), '缺少目标分类选择控件');
  assert.ok(src.includes("case 'codex-import-icon'"), '缺少导入入口动作分发');
  assert.ok(src.includes('store[key] = dataURL'), '导入图标应写入本地存储');
  // 渲染优先：导入图 → assets 同名图 → 首字
  const mountFn = src.slice(src.indexOf('function mountIcons'));
  assert.ok(mountFn.includes('imported[key]'), '渲染应优先使用导入图标');
  assert.ok(mountFn.includes("'assets/icons/' + key + '.png'"), '内置图标通道保留');
});

test('M44-5 路由跳转保留：整卡（相框+文字）点击仍进入对应模块页', () => {
  const html = Pages.codex();
  assert.ok(html.includes('data-route="#/module/crops"'), '作物分类跳转路由缺失');
  assert.ok(html.includes('data-route="#/module/achievements"'), '成就分类跳转路由缺失');
  assert.ok(html.includes('data-route="#/module/wallet"'), '其他分组分类跳转路由缺失');
});
