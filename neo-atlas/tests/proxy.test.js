import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../api/neo.js";

// Lives outside api/ because Vercel turns every file in api/ into a function.

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.setHeader = (key, value) => ((res.headers[key] = value), res);
  res.json = (obj) => ((res.body = obj), res);
  res.send = (text) => ((res.body = text), res);
  return res;
}

describe("api/neo proxy", () => {
  beforeEach(() => {
    process.env.AEGISNEO_API_KEY = "test-key";
    process.env.AEGISNEO_API_URL = "https://api.example.test";
    globalThis.fetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards allowed paths and params with the key attached", async () => {
    const res = mockRes();
    await handler({ method: "GET", query: { path: "asteroids", search: "1987-", limit: "100" } }, res);
    expect(res.statusCode).toBe(200);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url.toString()).toBe("https://api.example.test/api/v1/asteroids?search=1987-&limit=100");
    expect(init.headers["x-api-key"]).toBe("test-key");
    expect(res.headers["Cache-Control"]).toContain("s-maxage");
  });

  it("rejects unknown parameters, so they can't be used to skip the edge cache", async () => {
    const res = mockRes();
    await handler({ method: "GET", query: { path: "asteroids", search: "1987-", nocache: "123" } }, res);
    expect(res.statusCode).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("allows a single asteroid and stats", async () => {
    for (const path of ["asteroids/2162117", "stats"]) {
      const res = mockRes();
      await handler({ method: "GET", query: { path } }, res);
      expect(res.statusCode).toBe(200);
    }
  });

  it("rejects unknown or traversal paths without calling upstream", async () => {
    for (const path of ["", "health", "asteroids/../stats", "asteroids/a/b", "docs"]) {
      const res = mockRes();
      await handler({ method: "GET", query: { path } }, res);
      expect(res.statusCode).toBe(404);
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects non-GET methods", async () => {
    const res = mockRes();
    await handler({ method: "POST", query: { path: "stats" } }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("GET");
  });

  it("fails clearly when the key is not configured", async () => {
    delete process.env.AEGISNEO_API_KEY;
    const res = mockRes();
    await handler({ method: "GET", query: { path: "stats" } }, res);
    expect(res.statusCode).toBe(500);
  });

  it("passes upstream errors through without caching them", async () => {
    globalThis.fetch = vi.fn(async () => new Response('{"detail":"nope"}', { status: 401 }));
    const res = mockRes();
    await handler({ method: "GET", query: { path: "stats" } }, res);
    expect(res.statusCode).toBe(401);
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it("returns 502 when the API is unreachable", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const res = mockRes();
    await handler({ method: "GET", query: { path: "stats" } }, res);
    expect(res.statusCode).toBe(502);
  });
});
