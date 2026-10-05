'use strict';

/**
 * ============================================================
 * 全局配置中心（数组化）
 * 后期新增功能：只需往 modules / tabs / homeCards 数组追加条目，
 * 页面布局与路由无需改动。
 * ============================================================
 */
const SDV_CONFIG = {
  app: {
    name: '星露谷攻略',
    version: '0.1.0',
    /**
     * 云端版本清单地址（GitHub Pages 部署后替换为实际地址）：
     * 例如 'https://你的用户名.github.io/仓库名/version.json'
     */
    cloudVersionUrl: 'version.json',
  },

  storage: {
    configKey: 'sdv-guide:config', // 本地配置存档键（localStorage，重启不丢失）
    saveVersion: 1,                // 存档结构版本号：后续字段升级时用于迁移
  },

  theme: {
    followSystemDefault: true,     // 「跟随系统主题」默认开启
    manualDefault: 'light',        // 手动主题默认值
  },

  quickNav: {
    // 未手动编辑前的默认展示（占第1~4格，第5~7格空位，第8格固定「更多」）
    defaultSelected: ['villagers', 'calendar', 'calculator', 'filter'],
    maxSelected: 7,                // 最多自定义 7 个功能展示
    cols: 4,                       // 2 行 4 格
    rows: 2,
    moreKey: '__more__',           // 第8格固定「更多」按钮标识（不属于功能模块数组）
  },

  /** 底部固定导航（5 个分页，均分屏幕宽度；搜索居中为视觉核心） */
  tabs: [
    { key: 'home',   label: '首页' },
    { key: 'codex',  label: '图鉴' },
    { key: 'search', label: '搜索' },
    { key: 'news',   label: '公告' },
    { key: 'mine',   label: '我的' },
  ],

  /** 首页四大卡片功能模块（仅占位框架，二期填充） */
  homeCards: [
    { key: 'map',        title: '星露谷地图',   desc: '全图分区与地标导航（建设中）' },
    { key: 'guide',      title: '新手指南',     desc: '开荒流程与基础玩法指引（建设中）' },
    { key: 'calculator', title: '种植计算器',   desc: '季节作物收益计算（建设中）' },
    { key: 'mods',       title: '模组拓展专区', desc: 'PC 端模组推荐与说明（建设中）' },
  ],

  /**
   * 全部功能模块（38 个）
   * key  : 唯一标识，同时作为图标文件名：assets/icons/{key}.png
   * label: 展示名
   */
  modules: [
    { key: 'calculator',     label: '计算器' },
    { key: 'villagers',      label: '村民' },
    { key: 'calendar',       label: '日历' },
    { key: 'filter',         label: '筛选器' },
    { key: 'equipment',      label: '装备' },
    { key: 'monsters',       label: '怪物' },
    { key: 'accessories',    label: '饰品' },
    { key: 'areas',          label: '区域' },
    { key: 'special',        label: '特殊' },
    { key: 'farm',           label: '农场' },
    { key: 'buildings',      label: '建筑' },
    { key: 'wallet',         label: '钱包' },
    { key: 'weather',        label: '天气' },
    { key: 'crops',          label: '农作物' },
    { key: 'foraging',       label: '采集' },
    { key: 'fish',           label: '鱼类' },
    { key: 'artisan',        label: '工匠物品' },
    { key: 'cooking',        label: '料理' },
    { key: 'trees',          label: '树' },
    { key: 'animals',        label: '动物' },
    { key: 'seeds',          label: '种子' },
    { key: 'animalProducts', label: '畜产品' },
    { key: 'materials',      label: '材料' },
    { key: 'crafting',       label: '打造' },
    { key: 'tools',          label: '工具' },
    { key: 'minerals',       label: '矿物' },
    { key: 'artifacts',      label: '古物' },
    { key: 'bundles',        label: '收集包' },
    { key: 'secretNotes',    label: '秘密纸条' },
    { key: 'quests',         label: '任务' },
    { key: 'walnuts',        label: '核桃' },
    { key: 'furniture',      label: '家具' },
    { key: 'wallpaper',      label: '墙纸' },
    { key: 'flooring',       label: '地板' },
    { key: 'hats',           label: '帽子' },
    { key: 'achievements',   label: '成就' },
    { key: 'shirts',         label: '上衣' },
    { key: 'pants',          label: '下装' },
  ],
};
