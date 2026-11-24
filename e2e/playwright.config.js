// Browser tests for the website (landing, sign-in, hub, Explorer) running against the real API
// and a real PostgreSQL database. Start it with: TEST_DATABASE_URL=postgresql://... npm test
import { defineConfig } from "@playwright/test";

const admin = new URL(process.env.TEST_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres");
const appUrl = `postgresql://aegis_app:e2e-app-password@${admin.host}/aegisneo_e2e`;
const PORT = 8123;

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}/frontend/`, trace: "off", screenshot: "only-on-failure" },
  webServer: {
    command: "python e2e/seed.py && python scripts/dev_server.py",
    cwd: "..",
    url: `http://127.0.0.1:${PORT}/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      PORT: String(PORT),
      TEST_DATABASE_URL: admin.href,
      DATABASE_URL: appUrl,
      JWT_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret-0123456789",
      AEGISNEO_API_KEYS: "impactor:e2e-impactor-key,neo-atlas:e2e-atlas-key",
      RATE_LIMIT_DISABLED: "1",
    },
  },
});
