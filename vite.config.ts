import { vlyPlugin } from "@vly-ai/integrations";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vlyPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    hmr: false,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
