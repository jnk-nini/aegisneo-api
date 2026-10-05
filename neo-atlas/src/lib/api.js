// Client for the AegisNEO API. Requests go to /api/neo/*, which the dev server
// (vite.config.js) or the Vercel function (api/neo.js) forwards to the API
// with the key attached — the browser never sees the key.

const BASE = "/api/neo";
// Longer than the server function's own 15 s limit, so its "took too long" answer arrives before this gives up.
const TIMEOUT_MS = 20000;
export const PAGE_SIZE = 100; // the API's per-request maximum
const cache = new Map();

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function messageFor(status) {
  if (status === 401) return "The AegisNEO API rejected this site's key.";
  if (status === 404) return "That asteroid isn't in the AegisNEO catalog.";
  if (status === 422) return "The request had an invalid value.";
  if (status === 504) return "The AegisNEO API took too long to respond. It may be waking up — try again.";
  return "Couldn't reach the AegisNEO API. Check your connection and try again.";
}

async function fetchOnce(url, signal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new ApiError(messageFor(response.status), response.status);
    return await response.json();
  } catch (err) {
    if (signal?.aborted) throw err; // caller cancelled — let them ignore it
    if (err instanceof ApiError) throw err;
    throw new ApiError(messageFor(controller.signal.aborted ? 504 : 0), 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function buildUrl(path, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return `${BASE}/${path}${qs ? `?${qs}` : ""}`;
}

async function request(path, params = {}, { signal } = {}) {
  const url = buildUrl(path, params);
  if (cache.has(url)) return cache.get(url);

  let data;
  try {
    data = await fetchOnce(url, signal);
  } catch (err) {
    // One retry for transient failures (Vercel cold starts, flaky mobile data).
    const transient = err instanceof ApiError && (err.status === 0 || err.status >= 500);
    if (!transient || signal?.aborted) throw err;
    data = await fetchOnce(url, signal);
  }
  cache.set(url, data);
  return data;
}

/**
 * Fetches every page of a filtered list (the API returns at most 100 per call),
 * stopping at `max` objects. The first page says how many match; the rest are
 * then requested together. `onPage` gets everything loaded so far after each
 * page, so the chart fills in progressively on slow connections.
 */
async function listAll(params, { signal, max = 1000, onPage } = {}) {
  const fetchPage = (offset) => request("asteroids", { ...params, limit: PAGE_SIZE, offset }, { signal });
  const first = await fetchPage(0);
  const matched = first.matched ?? first.count;
  onPage?.(first.asteroids.slice(), matched);

  const pages = [first.asteroids];
  const offsets = [];
  if (first.asteroids.length === PAGE_SIZE) {
    for (let offset = PAGE_SIZE; offset < Math.min(matched, max); offset += PAGE_SIZE) offsets.push(offset);
  }
  let failed = false;
  try {
    await Promise.all(
      offsets.map(async (offset, i) => {
        const page = await fetchPage(offset);
        pages[i + 1] = page.asteroids;
        // Pages can arrive in any order; flat() skips the ones still missing.
        if (!failed) onPage?.(pages.flat(), matched);
      }),
    );
  } catch (err) {
    failed = true; // pages still in flight must not report after the error
    throw err;
  }
  return { asteroids: pages.flat().slice(0, max), matched };
}

export const api = {
  list: (params, opts) => request("asteroids", params, opts),
  listAll,
  get: (id, opts) => request(`asteroids/${encodeURIComponent(id)}`, {}, opts),
  stats: (opts) => request("stats", {}, opts),
};
