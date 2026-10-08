import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/sitemap": { target: process.env.API_ORIGIN || "http://127.0.0.1:5174", changeOrigin: true },
      "/robots.txt": { target: process.env.API_ORIGIN || "http://127.0.0.1:5174", changeOrigin: true },
      "/api": {
        target: process.env.API_ORIGIN || "http://127.0.0.1:5174",
        changeOrigin: true
      }
    }
  }
});
