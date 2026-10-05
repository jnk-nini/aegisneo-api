import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import handler from "./api/neo.js";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Serves /api/neo/* in development with the same function Vercel runs in
 * production (api/neo.js), so the dev server allows exactly the same endpoints
 * and parameters, and the key stays server-side.
 */
function neoProxy() {
  return {
    name: "neo-proxy",
    configureServer(server) {
      server.middlewares.use("/api/neo", (req, res) => {
        const url = new URL(req.url, "http://localhost");
        const query = { ...Object.fromEntries(url.searchParams), path: url.pathname.slice(1) };
        res.status = (code) => ((res.statusCode = code), res);
        res.json = (body) => (res.setHeader("Content-Type", "application/json"), res.end(JSON.stringify(body)), res);
        res.send = (body) => (res.end(body), res);
        handler({ method: req.method, query }, res);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Read .env files from this folder, wherever the dev server was started from.
  const env = loadEnv(mode, root, "");
  process.env.AEGISNEO_API_URL ??= env.AEGISNEO_API_URL || "http://127.0.0.1:8000";
  process.env.AEGISNEO_API_KEY ??= env.AEGISNEO_API_KEY || "";
  if (mode === "development" && !process.env.AEGISNEO_API_KEY) {
    console.warn("[neo-atlas] AEGISNEO_API_KEY is not set — copy .env.example to .env.local.");
  }

  return {
    plugins: [react(), neoProxy()],
    build: {
      // Small font files would otherwise be inlined as data: URLs, which the
      // site's Content-Security-Policy (font-src 'self') blocks.
      assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
    },
    test: {
      environment: "node",
    },
  };
});
