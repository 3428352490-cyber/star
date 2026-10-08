'use strict';
/**
 * 测试基础设施：在 Node 中加载浏览器脚本并 stub 浏览器全局对象。
 * 用法：const { loadApp, ref } = require('./harness.js');
 *  - loadApp()：按序执行 js/ 下全部脚本（stub 全局后）
 *  - ref('Store')：取回脚本中顶层 const/let 的引用
 *  - 每个测试文件是独立进程，互不污染。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const APP_FILES = [
  'js/util.js', 'js/config.js', 'js/store.js', 'js/theme.js', 'js/ui.js',
  'js/pages.js', 'js/api.js', 'js/community.js', 'js/search-ui.js',
  'js/router.js',
  'js/review-log.js', 'js/self-check.js', 'js/security-guard.js',
  'js/update.js', 'js/app.js',
  'js/dev-admin.js',
  'js/leaf.js',
];

function fakeEl(id) {
  let _html = '';
  return {
    id: id || '',
    // innerHTML 赋值等同真实 DOM：替换内容并清空子节点
    get innerHTML() { return _html; },
    set innerHTML(v) { _html = String(v); this.children = []; },
    textContent: '',
    className: '',
    dataset: {},
    style: {},
    disabled: false,
    checked: false,
    value: '',
    files: [],
    children: [],
    __listeners: {},
    classList: {
      add() {}, remove() {}, toggle() {}, contains() { return false; },
    },
    setAttribute() {}, getAttribute() { return null; },
    appendChild(el) { this.children.push(el); return el; },
    remove() {}, click() {},
    addEventListener(type, fn) {
      (this.__listeners[type] || (this.__listeners[type] = [])).push(fn);
    },
    removeEventListener() {},
    querySelector(sel) {
      // 按选择器缓存子元素，保证 Modal 挂载监听与测试派发使用同一对象
      this.__children || (this.__children = {});
      if (!this.__children[sel]) {
        const el = fakeEl(this.id + ' ' + sel);
        // 从选择器提取 [data-x] 并写入 dataset，使 closest('[data-x]') 可命中
        const m = String(sel).match(/\[data-([a-zA-Z-]+)\]/);
        if (m) {
          const prop = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          el.dataset[prop] = '';
        }
        this.__children[sel] = el;
      }
      return this.__children[sel];
    },
    querySelectorAll() { return []; },
    closest(sel) {
      // 支持 [data-x] 匹配自身 dataset（供搜索面板等事件委托测试使用）
      const m = sel && String(sel).match(/^\[data-([a-zA-Z-]+)\]$/);
      if (m) {
        const prop = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (this.dataset && this.dataset[prop] !== undefined) return this;
        return null;
      }
      return null;
    },
    matches() { return false; },
    dispatchEvent(ev) {
      const type = (ev && ev.type) || '';
      const fns = (this.__listeners && this.__listeners[type]) || [];
      fns.forEach((fn) => fn(ev || { target: this }));
    },
  };
}

/** 派发事件到伪元素（触发其 addEventListener 注册的处理器） */
function fire(el, type, event) {
  const fns = (el && el.__listeners && el.__listeners[type]) || [];
  fns.forEach((fn) => fn(event || { target: el }));
}

function setupGlobals() {
  const els = new Map();
  const getEl = (key) => {
    if (!els.has(key)) els.set(key, fakeEl(key));
    return els.get(key);
  };

  /** 模拟真实 Storage：数据键为实例自有属性（Object.keys 可枚举），方法在原型不可枚举 */
  function StorageMock() {}
  Object.defineProperty(StorageMock.prototype, 'length', {
    get() { return Object.keys(this).length; },
  });
  StorageMock.prototype.key = function key(i) { return Object.keys(this)[i] || null; };
  StorageMock.prototype.getItem = function getItem(k) {
    return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null;
  };
  StorageMock.prototype.setItem = function setItem(k, v) { this[k] = String(v); };
  StorageMock.prototype.removeItem = function removeItem(k) { delete this[k]; };
  StorageMock.prototype.clear = function clear() { for (const k of Object.keys(this)) delete this[k]; };

  const localStorage = new StorageMock();
  const sessionStorage = new StorageMock();

  const mql = {
    matches: false,
    listeners: [],
    set(v) { this.matches = !!v; this.listeners.forEach((fn) => fn()); },
    addEventListener(type, fn) { this.listeners.push(fn); },
    removeEventListener() {},
  };

  /** 最小 CSS 选择器匹配：支持 [data-x]、[data-x]:checked、.class、#id */
  function matchesSelector(el, sel) {
    const s = String(sel).trim();
    const attrMatch = s.match(/^\[([a-zA-Z-]+)\](?::checked)?$/);
    if (attrMatch) {
      // 属性名 → dataset 键（camelCase，与真实 DOM 一致）：data-nav-check → navCheck
      const prop = attrMatch[1].replace(/^data-/, '');
      const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const hasAttr = !!(el.dataset && el.dataset[camel] !== undefined);
      if (!hasAttr) return false;
      return s.endsWith(':checked') ? !!el.checked : true;
    }
    if (s.startsWith('.')) return (el.className || '').split(/\s+/).includes(s.slice(1));
    if (s.startsWith('#')) return el.id === s.slice(1);
    return true; // 其余选择器从宽放行
  }

  let qsaResults = [];
  const document = {
    documentElement: { dataset: {}, setAttribute() {}, getAttribute() { return null; } },
    title: '',
    body: getEl('body'),
    __listeners: {},
    getElementById(id) { return getEl(id); },
    querySelector(sel) { return getEl(sel); },
    querySelectorAll(sel) { return qsaResults.filter((el) => matchesSelector(el, sel)); },
    createElement(tag) { return getEl('created:' + tag); },
    addEventListener(type, fn) {
      (this.__listeners[type] || (this.__listeners[type] = [])).push(fn);
    },
    removeEventListener() {},
  };

  const window = {
    addEventListener() {}, removeEventListener() {},
    scrollTo() {},
    matchMedia() { return mql; },
  };

  const location = { hash: '#/home', protocol: 'test:', reloadCount: 0, reload() { this.reloadCount = (this.reloadCount || 0) + 1; } };

  globalThis.__testEls = els;
  globalThis.__testMql = mql;
  // 模拟真实浏览器路由重建：让 getElementById 下次返回全新元素对象
  globalThis.__resetEl = (key) => {
    els.delete(key);
    return getEl(key);
  };
  globalThis.fire = fire;
  globalThis.__setQSA = (arr) => { qsaResults = arr || []; };
  globalThis.__fireDoc = (type, event) => {
    ((document.__listeners[type]) || []).forEach((fn) => fn(event));
  };
  globalThis.localStorage = localStorage;
  globalThis.sessionStorage = sessionStorage;
  globalThis.window = window;
  globalThis.document = document;
  globalThis.location = location;
  // Node 21+ 的全局 navigator 为只读 getter，需 defineProperty 覆盖
  try {
    globalThis.navigator = {};
  } catch (e) {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  }
  globalThis.Image = function Image() {
    this.src = ''; this.alt = ''; this.className = ''; this.naturalWidth = 0;
    this.onload = null; this.onerror = null;
  };
  globalThis.fetch = async () => { throw new Error('fetch 未在测试中 stub'); };
}

/** 按序加载全部应用脚本；返回后可用 ref() 取引用 */
function loadApp() {
  setupGlobals();
  for (const f of APP_FILES) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInThisContext(code, { filename: f });
  }
}

/** 取回脚本顶层绑定（不存在时返回 undefined） */
function ref(name) {
  return vm.runInThisContext('typeof ' + name + ' !== "undefined" ? ' + name + ' : undefined');
}

/** 读取应用文件文本 */
function readAppFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

module.exports = { ROOT, loadApp, ref, readAppFile, fakeEl };
