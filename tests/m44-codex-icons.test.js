'use strict';
/* M44 阶段测试：图鉴首页分类卡片像素木质相框重构 + 导入图标渲染通道
   ① 图鉴页结构：每张分类卡片 = 相框方框（.tile-frame，框内仅图标）+ 框外下方文字（.tile-label）；
   ② 相框样式：正方形、外粗深棕/中橘棕/内浅橙多层像素边框、浅米色内底、四角浅灰像素块装饰；
   ③ 图标容器：占满相框内部、透明底，图标自动居中/等比例缩放适配（object-fit contain + pixelated 硬边），不溢出不遮挡相框外框；
   ④ 渲染优先：mountIcons 优先使用本地导入图标（localStorage 'sdv-codex-icons'），其次 assets/icons/{key}.png，最后首字占位；
   ⑤ 兼容：原 38 分类瓦片计数与分组结构不变，其他页面 tile() 不受影响，无导入入口按钮。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, ref, readAppFile } = require('./helpers/harness.js');

loadApp();
const Pages = ref('Pages');

function count(str, sub) {
  return str.split(sub).length - 1;
}

test('M44-1 图鉴页：相框内图标/框外文字结构（38 分类不变、无导入入口）', () => {
  const html = Pages.codex();
  assert.equal(count(html, 'class="tile tile-codex"'), 38, '分类瓦片仍应为 38');
  assert.ok(!html.includes('codex-import-icon'), '导入图标入口已移除');
  assert.ok(!html.includes('codex-toolbar'), '导入工具栏已移除');
  assert.ok(html.includes('<span class="tile-frame">'), '分类卡片缺少像素相框容器');
  // 框内仅图标：tile-frame 内部直接是 tile-icon，文字标签在 frame 闭合之后
  const frameIdx = html.indexOf('<span class="tile-frame">');
  const frameEnd = html.indexOf('</span>', frameIdx);
  assert.ok(html.slice(frameIdx, frameEnd).includes('tile-icon'), '相框内应包含图标容器');
  const afterFrame = html.slice(frameEnd, frameEnd + 400);
  assert.ok(afterFrame.includes('tile-label'), '文字应位于相框外侧下方（图标与文字相互独立）');
  assert.ok(html.includes('生产') && html.includes('工艺') && html.includes('收集'), '三大板块保留');
  // 生产板块 8 分类相框内置固定路径图片（用户素材）+ 加载失败首字占位
  const src = readAppFile('js/pages.js');
  ['crops:assets/crop.png', 'seeds:assets/seed.png', 'artisan:assets/artisan.png',
   'cooking:assets/food.png', 'animalProducts:assets/animal_product.png',
   'animals:assets/animal.png', 'foraging:assets/specimens.png', 'fish:assets/fish.png', 'trees:assets/tree.png'
  ].forEach((pair) => {
    const [k, p] = pair.split(':');
    assert.ok(src.includes(k + ": '" + p + "'"), '生产板块 ' + k + ' 缺少固定图片路径 ' + p);
  });
  assert.ok(src.includes("querySelector('.tile-fallback');if(f)f.style.display='inline'"), '缺少图片加载失败占位逻辑');
  assert.ok(html.includes('class="tile-img"'), '生产板块相框内应内置图片');
  // 分组归属与顺序按参考布局（跨组移动）：生产=crops/foraging/fish/artisan/cooking/trees/animals/seeds/animalProducts；
  // 工艺=materials/crafting/tools；收集=minerals/artifacts/bundles/secretNotes/quests/walnuts/furniture/wallpaper/flooring/hats/achievements/shirts/pants
  const groupOf = (name) => {
    const gi = html.indexOf('<h3 class="codex-group-title">' + name + '</h3>');
    const gj = html.indexOf('<h3 class="codex-group-title">', gi + 1);
    return html.slice(gi, gj > -1 ? gj : html.length);
  };
  const assertOrder = (sec, keys) => {
    let prev = -1;
    keys.forEach((k, i) => {
      const pos = sec.indexOf('data-route="#/module/' + k + '"');
      assert.ok(pos > -1, sec.slice(0, 8) + '组应包含 ' + k);
      if (i > 0) assert.ok(pos > prev, sec.slice(0, 8) + '组顺序错误：' + k + ' 应在上一项之后');
      prev = pos;
    });
  };
  assertOrder(groupOf('生产'), ['crops', 'foraging', 'fish', 'artisan', 'cooking', 'trees', 'animals', 'seeds', 'animalProducts']);
  assertOrder(groupOf('工艺'), ['materials', 'crafting', 'tools']);
  assertOrder(groupOf('收集'), ['minerals', 'artifacts', 'bundles', 'secretNotes', 'quests', 'walnuts', 'furniture', 'wallpaper', 'flooring', 'hats', 'achievements', 'shirts', 'pants']);
  assertOrder(groupOf('其他'), ['areas', 'special', 'farm', 'buildings', 'wallet', 'weather']);
  // 功能模块（村民/日历/筛选器/计算器）保留在其他组末尾，不删改
  assertOrder(groupOf('其他'), ['villagers', 'calendar', 'filter', 'calculator']);
  assert.equal(count(html, 'class="tile tile-codex"'), 38, '分类瓦片仍应为 38');
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

test('M44-3 相框 CSS：正方形多层像素边框 + 四角装饰 + 图标适配不溢出（无导入入口样式残留）', () => {
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
  assert.ok(!comp.includes('.codex-toolbar') && !comp.includes('.icon-target-select'), '导入入口样式应已移除');
});

test('M44-4 导入图标渲染通道保留：localStorage 导入图优先渲染（无导入流程代码）', () => {
  const src = readAppFile('js/app.js');
  assert.ok(src.includes("localStorage.getItem('sdv-codex-icons')"), '导入图标存储键读取缺失');
  assert.ok(!src.includes('function pickIconFile'), '文件选择流程代码应已移除');
  assert.ok(!src.includes('function processIconImage'), '图片缩放流程代码应已移除');
  assert.ok(!src.includes("case 'codex-import-icon'"), '导入入口动作分发应已移除');
  // 渲染优先：导入图 → assets 同名图 → 首字；已含固定路径图片的相框（生产板块）跳过内置通道
  const mountFn = src.slice(src.indexOf('function mountIcons'));
  assert.ok(mountFn.includes("if (box.querySelector('img')) return;"), '已内置图片的相框应跳过内置图标通道（避免覆盖用户素材路径）');
  assert.ok(mountFn.includes('imported[key]'), '渲染应优先使用导入图标（无内置图分类保留）');
  assert.ok(mountFn.includes("'assets/icons/' + key + '.png'"), '内置图标通道保留');
});

test('M44-5 电脑端卡片尺寸缩小 CSS：图标 48×48 固定、卡片窄、移动端自适应不受影响', () => {
  const comp = readAppFile('css/components.css');
  assert.ok(comp.includes('@media (min-width: 768px)'), '缺少电脑端断点');
  const desk = comp.slice(comp.indexOf('@media (min-width: 768px)'));
  assert.ok(desk.includes('.tile-codex { width: 60px;') || desk.includes('.tile-codex { width: 60px'), '电脑端卡片应缩小为固定窄宽');
  assert.ok(desk.includes('width: 56px') && desk.includes('height: 56px'), '电脑端相框应固定 56×56（内容区 48×48 图标 + 8px 边框）');
  assert.ok(desk.includes('aspect-ratio: auto'), '电脑端相框高度应显式固定');
  assert.ok(comp.includes('image-rendering: pixelated'), '应关闭抗锯齿、保证像素锐利');
});

test('M44-6 路由跳转保留：整卡（相框+文字）点击仍进入对应模块页', () => {
  const html = Pages.codex();
  assert.ok(html.includes('data-route="#/module/crops"'), '作物分类跳转路由缺失');
  assert.ok(html.includes('data-route="#/module/achievements"'), '成就分类跳转路由缺失');
  assert.ok(html.includes('data-route="#/module/wallet"'), '其他分组分类跳转路由缺失');
});
