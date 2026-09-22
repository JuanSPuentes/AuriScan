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
        name: "AuriScan: Análisis de pabellón auricular",
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
        // Esto NO es una SPA de una sola página: index.html/app.html/admin.html son 3
        // páginas reales que nginx sirve por separado (ver nginx.conf). El navigateFallback
        // de Workbox es un "app shell" pensado para SPAs -- sin excluir /app y /admin,
        // intercepta CUALQUIER navegación (login con Google, retorno de pago de Wompi, un
        // refresh...) y sirve el index.html cacheado de la landing en vez de la página real,
        // una vez el service worker ya está activo (no en la primera visita, que todavía no
        // lo tiene registrado -- por eso el bug solo se veía "a veces").
        navigateFallbackDenylist: [/^\/api\//, /^\/app(\?|$)/, /^\/admin(\?|$)/],
        runtimeCaching: [{
          urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
          handler: "CacheFirst",
          options: { cacheName: "fuentes", expiration: { maxEntries: 20 } }
        }]
      }
    })
  ]
});
