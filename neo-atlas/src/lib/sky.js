// A "sky" is what the chart is showing: one year, or one calendar date across
// every year. It round-trips through the URL so a refresh (or a shared link)
// opens the same chart.

import { dayIndex } from "./calendar.js";
import { FIRST_YEAR, LAST_YEAR } from "./chart.js";

export const DEFAULT_SKY = { mode: "year", year: LAST_YEAR, date: null };

export function isValidMonthDay(mmdd) {
  return /^\d{2}-\d{2}$/.test(mmdd || "") && dayIndex(`2000-${mmdd}`) != null;
}

export function isValidYear(year) {
  return Number.isInteger(year) && year >= FIRST_YEAR && year <= LAST_YEAR;
}

/** The API search string that selects this sky (dates are matched as text, e.g. "1987-" or "-05-12"). */
export function skySearch(sky) {
  return sky.mode === "date" ? `-${sky.date}` : `${sky.year}-`;
}

export function skyFromQuery(search) {
  const q = new URLSearchParams(search);
  const selected = /^[A-Za-z0-9_-]{1,32}$/.test(q.get("a") || "") ? q.get("a") : null;
  if (isValidMonthDay(q.get("d"))) return { sky: { mode: "date", year: null, date: q.get("d") }, selected };
  const year = Number(q.get("y"));
  if (isValidYear(year)) return { sky: { mode: "year", year, date: null }, selected };
  return { sky: DEFAULT_SKY, selected };
}

export function skyToQuery(sky, selected) {
  const q = new URLSearchParams();
  if (sky.mode === "date") q.set("d", sky.date);
  else q.set("y", String(sky.year));
  if (selected) q.set("a", selected);
  return `?${q}`;
}

export function todayMonthDay(now = new Date()) {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}
