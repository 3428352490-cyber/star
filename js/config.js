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
    version: '1.0.3',
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

  /** 软件公告（公告页渲染；新版本发布时向数组头部追加条目） */
  announcements: [
    {
      version: '1.0.3',
      date: '2026-10-05',
      title: '版本检测逻辑优化',
      notes: [
        '版本对比统一为语义化分段数字比较（compareVersion），杜绝字符串直接比较',
        'version.json 与 notice.json 请求均带时间戳绕过浏览器缓存，弹窗更新说明优先读取 notice.json 人工公告',
      ],
    },
    {
      version: '1.0.2',
      date: '2026-10-05',
      title: '更新弹窗统一为像素风格',
      notes: [
        '更新弹窗底部按钮优化：左侧「暂不更新」纯文字（本次会话不再弹窗），右侧「立即更新」像素红按钮（写入本地版本并刷新）',
        '移除「知道了」按钮与「请稍后重新打开应用获取最新内容」过期文案',
        '停用白色卡片更新弹窗，统一使用像素黄边弹窗，避免重复提示',
      ],
    },
    {
      version: '1.0.1',
      date: '2026-10-05',
      title: '版本自动递增与更新弹窗优化',
      notes: [
        'GitHub Actions 推送自动补丁递增上线，版本号三处同步（version.json / config.js / sw.js）',
        '更新弹窗底部按钮优化：左侧「暂不更新」纯文字（本次会话不再弹窗），右侧「立即更新」像素红按钮（写入本地版本并刷新）',
        '更新弹窗移除「请稍后重新打开应用获取最新内容」文案',
      ],
    },
    {
      version: '1.0.0',
      date: '2026-10-05',
      title: '版本更新提醒系统',
      notes: [
        '新增版本更新提醒：检测到新版本自动弹出更新提示，支持【立即更新】与【暂不更新】',
        '首页顶部星露谷农场原画背景大图，向下渐变淡出到格子背景',
        '删除首页顶部标题板块，快捷功能/功能专区下移让出顶部空间',
        '快捷键编辑页已达上限时弹出提示弹窗，阻止新增',
      ],
    },
    {
      version: '0.6.0',
      date: '2026-10-05',
      title: '首页背景大图与快捷键上限提示',
      notes: [
        '首页顶部引入星露谷农场原画背景大图：置于卡片下层，靠近快捷功能卡片上边缘向下渐变淡出，平滑过渡到格子背景',
        '删除首页最顶部「星露谷攻略」标题板块，快捷功能/功能专区整体下移让出顶部空间，移动端自适应',
        '快捷键编辑页：已达上限（7 个）时点击未勾选项弹出提示弹窗，阻止新增，点击「确定」关闭',
        '页面功能、卡片样式、底部导航保持不变，深浅色主题均适配',
      ],
    },
    {
      version: '0.5.0',
      date: '2026-10-05',
      title: '复古 8-bit 红白机像素 UI',
      notes: [
        '全局 UI 切换为复古 8-bit 红白机像素风格：高饱和撞色（正红/明亮蓝/暖黄/深灰/砖红）、米白页面底色',
        '全部组件改为直角矩形卡片：深灰粗像素边框 + 白色内描边，硬像素无模糊、无圆角',
        '页面结构、功能逻辑不变，深浅色主题均适配',
      ],
    },
    {
      version: '0.4.0',
      date: '2026-10-05',
      title: '星露谷木质 UI 风格',
      notes: [
        '全局页面卡片替换为星露谷木质纹理样式',
        '交互弹窗改为星露谷原版对话框样式',
        '页面结构、功能逻辑不变，深浅色主题均适配',
      ],
    },
    {
      version: '0.3.1',
      date: '2026-10-05',
      title: '公告页改版',
      notes: [
        '公告主页只展示最新一条公告，卡片右上角「更多」可进入历史公告页',
        '历史公告页展示全部往期公告，左上角返回按钮回到公告主页',
      ],
    },
    {
      version: '0.3.0',
      date: '2026-10-05',
      title: '我的页精简与缓存更新优化',
      notes: [
        '移除：「我的」页「快捷功能」板块（快捷键编辑入口统一在首页「更多」，编辑页功能保留）',
        '优化：缓存策略改为网络优先，代码更新后刷新即生效',
      ],
    },
    {
      version: '0.2.0',
      date: '2026-10-05',
      title: '快捷导航修复与界面优化',
      notes: [
        '修复：首页「更多」按钮可正常进入快捷键编辑页，并支持返回首页',
        '优化：首页移除本地存档、云端更新卡片（底层功能保留，更新入口收敛至「我的」页）',
        '体验：快捷键、导航栏等按钮新增按压动态反馈',
      ],
    },
    {
      version: '0.1.0',
      date: '2026-10-05',
      title: '一期骨架上线',
      notes: [
        '页面框架：首页 / 图鉴 / 搜索 / 公告 / 我的',
        '38 个功能模块分类占位，支持首页快捷功能自定义',
        '深浅色主题 + 跟随系统',
        '本地配置持久化（重启不丢）、云端版本更新检测',
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
