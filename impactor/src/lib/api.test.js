import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

describe("AegisNEO API client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the proxy URL, skipping empty parameters", async () => {
    fetch.mockResolvedValueOnce(json({ asteroids: [] }));
    await api.list({ sort: "diameter", order: "desc", search: "", hazardous: null });
    expect(fetch.mock.calls[0][0]).toBe("/api/neo/asteroids?sort=diameter&order=desc");
  });

  it("caches repeat requests but never random picks", async () => {
    fetch.mockImplementation(async () => json({ asteroids: [{ neo_reference_id: "1" }] }));
    await api.search("cache-test");
    await api.search("cache-test");
    expect(fetch).toHaveBeenCalledTimes(1);
    await api.random();
    await api.random();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries once after a server error, then succeeds", async () => {
    fetch.mockResolvedValueOnce(json({ detail: "cold start" }, 503)).mockResolvedValueOnce(json({ id: "x" }));
    await expect(api.get("retry-ok")).resolves.toEqual({ id: "x" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry client errors and explains them in plain words", async () => {
    fetch.mockResolvedValue(json({ detail: "missing" }, 404));
    const err = await api.get("no-such-id").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/isn't in the AegisNEO catalog/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("turns network failures into a connection message", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await api.get("offline").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/Couldn't reach the AegisNEO API/);
    expect(fetch).toHaveBeenCalledTimes(2); // one retry
  });

  it("lets a caller's cancel through untouched", async () => {
    const controller = new AbortController();
    fetch.mockImplementation(
      (_url, { signal }) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
        ),
    );
    const pending = api.get("cancelled", { signal: controller.signal });
    controller.abort();
    const err = await pending.catch((e) => e);
    expect(err.name).toBe("AbortError");
  });
});
