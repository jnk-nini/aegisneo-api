import { afterEach, describe, expect, it, vi } from "vitest";
import { api, buildUrl } from "./api.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

function page(offset, count, matched) {
  return {
    count,
    matched,
    asteroids: Array.from({ length: count }, (_, i) => ({ neo_reference_id: String(offset + i) })),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("buildUrl", () => {
  it("drops empty params and keeps the rest", () => {
    expect(buildUrl("asteroids", { search: "1987-", hazardous: null, sort: "", limit: 100 })).toBe(
      "/api/neo/asteroids?search=1987-&limit=100",
    );
    expect(buildUrl("stats")).toBe("/api/neo/stats");
  });
});

describe("api.listAll", () => {
  it("walks pages with offset until everything matched is loaded", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      const offset = Number(new URL(url, "http://x").searchParams.get("offset"));
      return json(page(offset, Math.min(100, 250 - offset), 250));
    });
    const pages = [];
    const result = await api.listAll({ search: "walk-test" }, { onPage: (list) => pages.push(list.length) });
    expect(result.asteroids).toHaveLength(250);
    expect(result.matched).toBe(250);
    expect(pages).toEqual([100, 200, 250]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("stops at max", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      const offset = Number(new URL(url, "http://x").searchParams.get("offset"));
      return json(page(offset, 100, 5000));
    });
    const result = await api.listAll({ search: "max-test" }, { max: 200 });
    expect(result.asteroids).toHaveLength(200);
    expect(result.matched).toBe(5000);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("errors", () => {
  it("turns HTTP errors into readable messages without retrying client errors", async () => {
    globalThis.fetch = vi.fn(async () => json({ detail: "x" }, 401));
    await expect(api.get("err-401")).rejects.toMatchObject({ status: 401 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries once on a server error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ total: 1 }));
    await expect(api.get("retry-once")).resolves.toEqual({ total: 1 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
