// sw.js - Minimal Service Worker for PWA (No Offline Caching)

// This SW only exists to make the app "installable"
// It doesn't cache anything, so always fetches from server

self.addEventListener('install', (event) => {
  console.log('Service Worker installed - no caching');
  // Skip waiting to activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated - no caching');
  // Take control immediately
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Don't intercept any requests - let everything go to network
  // This means NO offline functionality, but also NO caching issues
  return;
});

// Handle messages from main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});