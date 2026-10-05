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
    version: '2.0.1',
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

  /** 底部固定导航（5 个分页，均分屏幕宽度；搜索居中为视觉核心；公告入口移至首页左上角广告牌） */
  tabs: [
    { key: 'home',     label: '首页' },
    { key: 'codex',    label: '图鉴' },
    { key: 'search',   label: '搜索' },
    { key: 'messages', label: '消息' },
    { key: 'mine',     label: '我的' },
  ],

  /** 首页四大卡片功能模块（仅占位框架，二期填充） */
  homeCards: [
    { key: 'map',        title: '星露谷地图',   desc: '全图分区与地标导航（建设中）' },
    { key: 'guide',      title: '新手指南',     desc: '开荒流程与基础玩法指引（建设中）' },
    { key: 'calculator', title: '种植计算器',   desc: '季节作物收益计算（建设中）' },
    { key: 'mods',       title: '模组拓展专区', desc: 'PC 端模组推荐与说明（建设中）' },
  ],

  /** 软件公告（公告页渲染；新版本发布时向数组头部追加条目） */
  announcements: [
    {
      version: '2.0.0',
      date: '2026-10-05',
      title: '老乡有话说 上线',
      notes: [
        '新增社区板块「老乡有话说」：村民发帖、点赞收藏、评论互动',
        '新增消息中心：村民互动第一时间提醒，支持一键全部已读',
        '我的页面新增我的帖子、我的点赞、我的收藏',
        '公告入口移至首页左上角，底部导航新增「消息」',
      ],
    },
    {
      version: '1.0.11',
      date: '2026-10-05',
      title: '更新弹窗升级',
      notes: [
        '更新弹窗自动识别更新类型：重大更新、功能更新、补丁更新一目了然',
        '更新说明更清晰简洁',
      ],
    },
    {
      version: '1.0.10',
      date: '2026-10-05',
      title: '版本更新提醒升级',
      notes: [
        '打开页面会自动检查新版本，发现更新立即弹窗提示',
        '「检查更新」按钮可随时手动检查，方便确认最新内容',
      ],
    },
    {
      version: '1.0.9',
      date: '2026-10-05',
      title: '更新提醒优化',
      notes: [
        '「检查更新」改为手动点击触发，打开页面不会再自动弹窗打扰',
        '更新弹窗新增版本说明内容，更清楚了解每次更新',
      ],
    },
    {
      version: '1.0.8',
      date: '2026-10-05',
      title: '首页图标更新',
      notes: [
        '底部导航「首页」图标更新为新的像素小屋图标，更贴近游戏风格',
      ],
    },
    {
      version: '1.0.7',
      date: '2026-10-05',
      title: '稳定性与细节优化',
      notes: [
        '版本更新提醒更稳定准确，判断更可靠',
        '细节体验优化，使用更顺畅',
      ],
    },
    {
      version: '1.0.6',
      date: '2026-10-05',
      title: '更新体验优化',
      notes: [
        '更新弹窗的说明内容已更新',
        '点击「暂不更新」后，本次浏览继续使用当前版本数据，不会被悄悄更新；下次打开网页再提示',
        '手动检查更新时，若已是最新版本，会明确提示「当前已是最新版本」',
        '公告页与更新弹窗中的公告文字，全部改为简洁易懂的版本说明',
      ],
    },
    {
      version: '1.0.5',
      date: '2026-10-05',
      title: '自动化发布与版本同步优化',
      notes: [
        '发现新版本时会先弹窗由你确认，不会悄悄自动更新',
      ],
    },
    {
      version: '1.0.4',
      date: '2026-10-05',
      title: '版本检测与更新提醒优化',
      notes: [
        '更新弹窗优化：可选择「暂不更新」或「立即更新」',
        '更新公告内容更及时，始终展示最新说明',
      ],
    },
    {
      version: '1.0.3',
      date: '2026-10-05',
      title: '版本检测逻辑优化',
      notes: [
        '版本判断更准确，不会误报有新版本',
        '更新提示中的公告内容始终是最新的',
      ],
    },
    {
      version: '1.0.2',
      date: '2026-10-05',
      title: '更新弹窗统一为像素风格',
      notes: [
        '更新弹窗改为星露谷像素风格，和游戏风格更统一',
        '弹窗按钮优化为「暂不更新」和「立即更新」',
      ],
    },
    {
      version: '1.0.1',
      date: '2026-10-05',
      title: '版本自动递增与更新弹窗优化',
      notes: [
        '更新弹窗优化：可选择「暂不更新」或「立即更新」',
      ],
    },
    {
      version: '1.0.0',
      date: '2026-10-05',
      title: '版本更新提醒系统',
      notes: [
        '新增版本更新提醒：发现新版本会弹窗提示，可立即更新或暂不更新',
        '首页顶部新增星露谷农场原画背景',
        '快捷键编辑数量达到上限时会弹出提示',
      ],
    },
    {
      version: '0.6.0',
      date: '2026-10-05',
      title: '首页背景大图与快捷键上限提示',
      notes: [
        '首页顶部新增星露谷农场原画背景大图，向下柔和淡出',
        '快捷键编辑数量达到上限时会弹出提示',
      ],
    },
    {
      version: '0.5.0',
      date: '2026-10-05',
      title: '复古 8-bit 红白机像素 UI',
      notes: [
        '界面整体换成复古 8-bit 红白机像素风格，色彩活泼元气',
        '组件改为直角像素卡片，硬朗复古游戏质感',
        '功能保持不变，深浅色主题均适配',
      ],
    },
    {
      version: '0.4.0',
      date: '2026-10-05',
      title: '星露谷木质 UI 风格',
      notes: [
        '界面换成星露谷木质纹理风格，更贴近游戏',
        '弹窗改为星露谷原版对话框样式',
        '功能保持不变，深浅色主题均适配',
      ],
    },
    {
      version: '0.3.1',
      date: '2026-10-05',
      title: '公告页改版',
      notes: [
        '公告主页只展示最新一条公告，点「更多」可查看全部历史公告',
        '历史公告页支持一键返回公告主页',
      ],
    },
    {
      version: '0.3.0',
      date: '2026-10-05',
      title: '我的页精简与缓存更新优化',
      notes: [
        '「我的」页移除快捷功能板块，快捷键编辑入口统一在首页',
        '页面更新后刷新即可看到最新内容',
      ],
    },
    {
      version: '0.2.0',
      date: '2026-10-05',
      title: '快捷导航修复与界面优化',
      notes: [
        '修复首页「更多」按钮无法进入快捷键编辑页的问题，并支持返回',
        '首页精简布局，更新入口移到「我的」页',
        '按钮新增按压动态反馈，手感更好',
      ],
    },
    {
      version: '0.1.0',
      date: '2026-10-05',
      title: '一期骨架上线',
      notes: [
        '页面框架：首页 / 图鉴 / 搜索 / 公告 / 我的',
        '38 个功能模块占位，首页快捷功能可自定义',
        '深浅色主题 + 跟随系统',
        '本地设置保存，重启不丢失',
      ],
    },
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
