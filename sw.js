'use strict';
/* 星露谷攻略 · Service Worker
   一期：核心资源缓存（离线可用）+ 新版本发布后自动替换缓存。
   版本号（CACHE_NAME）为「代码版本」，必须与 js/config.js 中
   SDV_CONFIG.app.version 保持一致（发布版本 version.json 独立）。 */
const CACHE_NAME = 'sdv-guide-v2.0.4';
const CORE_ASSETS = [
  './',
  './index.html',
  './version.json',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/community.css',
  './js/util.js',
  './js/config.js',
  './js/store.js',
  './js/theme.js',
  './js/ui.js',
  './js/pages.js',
  './js/api.js',
  './js/community.js',
  './js/router.js',
  './js/review-log.js',
  './js/self-check.js',
  './js/security-guard.js',
  './js/update.js',
  './js/app.js',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // 网络优先：代码更新后立即生效；网络失败时回退缓存（PWA 离线可用）
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() =>
      caches.match(e.request).then((hit) => hit || caches.match('./index.html'))
    )
  );
});
