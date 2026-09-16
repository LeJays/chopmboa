import { vlyPlugin } from "@vly-ai/integrations";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [vlyPlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      // Expose la clé VAPID publique au client (non secrète par définition)
      "import.meta.env.VITE_VAPID_PUBLIC_KEY": JSON.stringify(
        env.VAPID_PUBLIC_KEY ?? ""
      ),
    },
    server: {
      hmr: false,
      proxy: {
        "/api": "http://localhost:8787",
      },
    },
  };
});
