// Client for the AegisNEO API. Requests go to /api/neo/*, which the dev server
// (vite.config.js) or the Vercel function (api/neo.js) forwards to the API
// with the key attached — the browser never sees the key.

const BASE = "/api/neo";
const TIMEOUT_MS = 15000;
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

async function request(path, params = {}, { signal, useCache = true } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const url = `${BASE}/${path}${query.size ? `?${query}` : ""}`;
  if (useCache && cache.has(url)) return cache.get(url);

  let data;
  try {
    data = await fetchOnce(url, signal);
  } catch (err) {
    // One retry for transient failures (Vercel cold starts, flaky mobile data).
    const transient = err instanceof ApiError && (err.status === 0 || err.status >= 500);
    if (!transient || signal?.aborted) throw err;
    data = await fetchOnce(url, signal);
  }
  if (useCache) cache.set(url, data);
  return data;
}

export const api = {
  search: (search, opts) => request("asteroids", { search, limit: 30 }, opts),
  list: (params, opts) => request("asteroids", params, opts),
  random: (params = {}, opts) =>
    request("asteroids/random", { count: 1, ...params }, { ...opts, useCache: false }),
  get: (id, opts) => request(`asteroids/${encodeURIComponent(id)}`, {}, opts),
};
