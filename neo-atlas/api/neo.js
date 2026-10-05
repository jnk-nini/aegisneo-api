// Serverless proxy to the AegisNEO API (runs on Vercel, not in the browser).
// The browser calls /api/neo/<path>; vercel.json rewrites that to
// /api/neo?path=<path>. This function adds the API key from an environment
// variable so the key is never shipped in the client bundle, and only lets
// through the read-only endpoints and query parameters NEO Atlas uses.

const ALLOWED_PATH = /^(asteroids(\/[A-Za-z0-9_-]{1,32})?|stats)$/;
const ALLOWED_PARAMS = new Set([
  "search",
  "hazardous",
  "min_diameter",
  "max_diameter",
  "sort",
  "order",
  "limit",
  "offset",
]);
const MAX_PARAM_LENGTH = 64;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ detail: "Method not allowed." });
  }

  // Trimmed because a key pasted into the Vercel dashboard often picks up a stray space or newline.
  const apiKey = (process.env.AEGISNEO_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(500).json({ detail: "Server is missing the AEGISNEO_API_KEY environment variable." });
  }

  const path = String(req.query.path || "").replace(/^\/+|\/+$/g, "");
  if (!ALLOWED_PATH.test(path)) {
    return res.status(404).json({ detail: "Unknown endpoint." });
  }
  // The edge cache is keyed on the full URL, so made-up parameters would let anyone skip it and
  // send every request on to the API. Only the ones the site itself sends are accepted.
  const unknown = Object.keys(req.query).filter((key) => key !== "path" && !ALLOWED_PARAMS.has(key));
  if (unknown.length > 0) {
    return res.status(400).json({ detail: `Unknown parameter: ${unknown[0].slice(0, MAX_PARAM_LENGTH)}.` });
  }

  const base = process.env.AEGISNEO_API_URL || "https://aegisneo-api.vercel.app";
  const url = new URL(`/api/v1/${path}`, base);
  for (const [key, value] of Object.entries(req.query)) {
    if (ALLOWED_PARAMS.has(key)) url.searchParams.set(key, String(value).slice(0, MAX_PARAM_LENGTH));
  }

  try {
    const upstream = await fetch(url, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(15000),
    });
    const body = await upstream.text();
    // The catalog is a fixed historical dataset, so successful answers can be
    // cached at the edge for a long time.
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Cache-Control",
      upstream.ok ? "public, s-maxage=86400, stale-while-revalidate=604800" : "no-store",
    );
    return res.status(upstream.status).send(body);
  } catch (err) {
    const timedOut = err && err.name === "TimeoutError";
    return res.status(timedOut ? 504 : 502).json({
      detail: timedOut ? "The AegisNEO API took too long to respond." : "Could not reach the AegisNEO API.",
    });
  }
}
