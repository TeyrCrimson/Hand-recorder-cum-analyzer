import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// IMPORTANT: `base` must match your GitHub repo name for GitHub Pages
// (e.g. repo "hand-recorder" -> base "/hand-recorder/"). Use "/" for a custom
// domain or user/organization pages.
export default defineConfig({
  base: "/Hand-recorder-cum-analyzer/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate", // SW updates itself on new deploys
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Hand Log",
        short_name: "HandLog",
        description: "Flopzilla-style range vs board analyzer",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0E1512",
        theme_color: "#0E1512",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // App is fully client-side: precache everything, works offline
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"]
      }
    })
  ]
});
