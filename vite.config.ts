import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), {
    name: "legacy-media-redirects",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (/^\/(movie|tv)\/[^/?]+\/?(?:\?|$)/.test(request.url || "")) { response.statusCode = 301; response.setHeader("Location", "/yingshi" + request.url); response.end(); return; }
        next();
      });
    }
  }],
  server: {
    port: 5173,
    proxy: {
      "/ai/remote/": { target: process.env.API_ORIGIN || "http://127.0.0.1:5174", changeOrigin: false, ws: true },
      "/workbench-sitemap.xml": { target: process.env.API_ORIGIN || "http://127.0.0.1:5174", changeOrigin: true },
      "/yingshi/sitemap": { target: process.env.API_ORIGIN || "http://127.0.0.1:5174", changeOrigin: true },
      "/sitemap": { target: process.env.API_ORIGIN || "http://127.0.0.1:5174", changeOrigin: true },
      "/robots.txt": { target: process.env.API_ORIGIN || "http://127.0.0.1:5174", changeOrigin: true },
      "/api": {
        target: process.env.API_ORIGIN || "http://127.0.0.1:5174",
        changeOrigin: true
      }
    }
  }
});
