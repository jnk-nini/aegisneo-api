import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In development the browser calls /api/neo/* on this dev server, which
// forwards to the AegisNEO API and adds the key server-side — the same shape
// as the production serverless proxy in api/neo.js, so the key never ships
// in the client bundle.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.AEGISNEO_API_URL || "http://127.0.0.1:8000";
  if (!env.AEGISNEO_API_KEY) {
    console.warn("[neo-atlas] AEGISNEO_API_KEY is not set — copy .env.example to .env.local.");
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api/neo": {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/neo/, "/api/v1"),
          headers: { "x-api-key": env.AEGISNEO_API_KEY || "" },
        },
      },
    },
    test: {
      environment: "node",
    },
  };
});
