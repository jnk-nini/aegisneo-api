// Serverless proxy to the AegisNEO API (runs on Vercel, not in the browser).
// The browser calls /api/neo/<path>; vercel.json rewrites that to
// /api/neo?path=<path>. This function adds the API key from an environment
// variable so the key is never shipped in the client bundle.

const ALLOWED_PATH = /^(asteroids(\/random|\/[A-Za-z0-9_-]{1,32})?|stats)$/;
const ALLOWED_PARAMS = new Set([
  "search",
  "hazardous",
  "min_diameter",
  "max_diameter",
  "sort",
  "order",
  "limit",
  "offset",
  "count",
]);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ detail: "Method not allowed." });
  }

  const apiKey = process.env.AEGISNEO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ detail: "Server is missing the AEGISNEO_API_KEY environment variable." });
  }

  const path = String(req.query.path || "").replace(/^\/+|\/+$/g, "");
  if (!ALLOWED_PATH.test(path)) {
    return res.status(404).json({ detail: "Unknown endpoint." });
  }

  const base = process.env.AEGISNEO_API_URL || "https://aegisneo-api.vercel.app";
  const url = new URL(`/api/v1/${path}`, base);
  for (const [key, value] of Object.entries(req.query)) {
    if (ALLOWED_PARAMS.has(key)) url.searchParams.set(key, String(value));
  }

  try {
    const upstream = await fetch(url, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(15000),
    });
    const body = await upstream.text();
    const cacheable = upstream.ok && !path.endsWith("random");
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Cache-Control",
      cacheable ? "public, s-maxage=3600, stale-while-revalidate=86400" : "no-store",
    );
    return res.status(upstream.status).send(body);
  } catch (err) {
    const timedOut = err && err.name === "TimeoutError";
    return res.status(timedOut ? 504 : 502).json({
      detail: timedOut ? "The AegisNEO API took too long to respond." : "Could not reach the AegisNEO API.",
    });
  }
}
