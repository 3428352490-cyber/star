'use strict';
/* M0：创建目录结构与各阶段占位文件（后续阶段逐文件填充） */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['css', 'js', 'assets', 'assets/icons', 'scripts', 'tests', 'tests/helpers'];
const STUBS = {
  'css/base.css': '/* M2 阶段填充：深浅主题变量 + 重置 */\n',
  'css/layout.css': '/* M3 阶段填充：外壳/底部导航/双端自适应 */\n',
  'css/components.css': '/* M3 阶段填充：卡片/瓦片/按钮/弹窗等组件 */\n',
  'js/util.js': "'use strict';\n/* M1 阶段填充 */\n",
  'js/config.js': "'use strict';\n/* M1 阶段填充 */\n",
  'js/store.js': "'use strict';\n/* M1 阶段填充 */\n",
  'js/theme.js': "'use strict';\n/* M2 阶段填充 */\n",
  'js/ui.js': "'use strict';\n/* M3 阶段填充 */\n",
  'js/pages.js': "'use strict';\n/* M4 阶段填充 */\n",
  'js/router.js': "'use strict';\n/* M4 阶段填充 */\n",
  'js/update.js': "'use strict';\n/* M6 阶段填充 */\n",
  'js/app.js': "'use strict';\n/* M3 阶段填充 */\n",
};

DIRS.forEach((d) => fs.mkdirSync(path.join(ROOT, d), { recursive: true }));
let created = 0;
Object.keys(STUBS).forEach((f) => {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, STUBS[f], 'utf8');
    created += 1;
  }
});
console.log('scaffold OK: dirs=' + DIRS.length + ' stubs_created=' + created);
