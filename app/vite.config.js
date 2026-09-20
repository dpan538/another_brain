import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { efishApi } from "./server/dev_middleware.js";

// Answers go through /api/chat, where the owner's key is held server-side.
// Locally the same handler is mounted by efishApi(); put the key in .env.local.
// VITE_EFISH_PROXY_URL overrides the endpoint; set it to "" for device-key mode.
export default defineConfig({
  plugins: [
    react(),
    efishApi(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "icons/*.png", "ime/pinyin_dict.json"],
      manifest: {
        name: "efish other",
        short_name: "efish",
        description: "type, write, chat.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#FBFAF8",
        theme_color: "#FBFAF8",
        lang: "zh-CN",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,json}"],
        maximumFileSizeToCacheInBytes: 3_000_000,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // The 22 MB font is never part of the install. It is fetched once, in the
        // background, and kept from then on.
        runtimeCaching: [{
          urlPattern: /\/fonts\/oppo-sans\/.*\.ttf$/,
          handler: "CacheFirst",
          options: { cacheName: "efish-font", expiration: { maxEntries: 2, maxAgeSeconds: 31536000 }, cacheableResponse: { statuses: [200] } }
        }]
      }
    })
  ],
  // Safari 15 is the floor (dvh, inert and smooth element scrolling degrade gracefully below it)
  build: { target: ["es2020", "safari15", "chrome100"], sourcemap: false }
});
