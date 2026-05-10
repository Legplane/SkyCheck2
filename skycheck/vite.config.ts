import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// ─────────────────────────────────────────────────────────────────
// SkyCheck Vite Config — synchronous, no dynamic imports
// For HTTPS on LAN/phone, use ngrok or the Chrome flag:
// chrome://flags/#unsafely-treat-insecure-origin-as-secure
// ─────────────────────────────────────────────────────────────────
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // PWA dev tooling pulls in workbox-build; if node_modules is incomplete on Windows,
      // it can crash Vite on startup. Keep PWA enabled for builds, disabled for dev.
      devOptions: { enabled: false },
      includeAssets: ['icons/favicon.svg', 'icons/pwa-icon.svg'],
      manifest: {
        name: 'SkyCheck — Smart Weather & Transit',
        short_name: 'SkyCheck',
        description: 'Real-time weather, traffic, and flood risk for student commuters in the Philippines',
        theme_color: '#1A56C4',
        background_color: '#0D2F6E',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'weather-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 30, maxAgeSeconds: 1800 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/api\.opentopodata\.org/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'elevation-api',
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
            },
          },
          {
            urlPattern: /^https:\/\/api\.maptiler\.com\/maps/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 604800 },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/api/') || url.port === '3000',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'backend-api',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 1800 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
