import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

/** The catalog total, for "312 asteroids of 33,511". Optional: the chart works without it. */
export function useCatalogTotal() {
  const [total, setTotal] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .stats({ signal: controller.signal })
      .then((stats) => setTotal(stats.total))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return total;
}
