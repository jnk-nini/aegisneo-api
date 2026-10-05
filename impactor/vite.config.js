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
    console.warn("[impactor] AEGISNEO_API_KEY is not set — copy .env.example to .env.local.");
  }

  return {
    plugins: [react()],
    // The 3D scene is lazy-loaded, so the dev server would only discover these
    // on first launch and re-bundle mid-session, leaving two copies of React.
    optimizeDeps: {
      include: ["@react-three/fiber", "@react-three/drei", "@react-three/postprocessing", "postprocessing"],
    },
    server: {
      // A port picked by whoever starts the server (PORT), else Vite's default.
      port: Number(process.env.PORT) || undefined,
      proxy: {
        "/api/neo": {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/neo/, "/api/v1"),
          headers: { "x-api-key": env.AEGISNEO_API_KEY || "" },
        },
      },
    },
    build: {
      // three.js is one big module (~700 KB raw). It only loads with the lazy 3D
      // scene, never on the 2D map, so its size doesn't block the first paint.
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          // Only three.js gets a fixed chunk. Grouping the React Three Fiber
          // packages by hand pulled React itself into the 3D chunk, which made
          // the entry depend on it and download it on every page load.
          manualChunks(id) {
            if (id.includes("node_modules/three/")) return "three";
          },
        },
      },
    },
    test: {
      environment: "node",
    },
  };
});
