import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// En `npm run dev`, /api se reenvía al deploy de producción (consume IA real, ~$0.002/consulta).
// Para probar el backend en local sin producción: `npm run build && npm run local` (puerto 8787).
const API_PROXY = process.env.API_PROXY || "https://app-two-pearl-50.vercel.app";

export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": { target: API_PROXY, changeOrigin: true } },
  },
  build: {
    target: "es2022",
    rollupOptions: { input: { landing: "index.html", app: "app.html", admin: "admin.html" } },
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "logo.svg", "logo-emblema.png"],
      manifest: {
        name: "AuriScan · análisis de pabellón auricular",
        short_name: "AuriScan",
        description: "Sube la foto de un oído y descarga un informe de auriculoterapia.",
        lang: "es",
        theme_color: "#1f4e79",
        background_color: "#f4f7fb",
        display: "standalone",
        start_url: "/app",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // La app necesita red para /api/analizar; solo cacheamos el shell.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [{
          urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
          handler: "CacheFirst",
          options: { cacheName: "fuentes", expiration: { maxEntries: 20 } }
        }]
      }
    })
  ]
});
