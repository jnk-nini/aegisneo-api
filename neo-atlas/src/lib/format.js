import { MONTHS } from "./calendar.js";

export const KM_PER_LD = 384400; // mean Earth–Moon distance ("lunar distance")
const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const toLunarDistances = (km) => km / KM_PER_LD;

export function formatLD(km) {
  const ld = toLunarDistances(km);
  const digits = ld < 1 ? 2 : ld < 10 ? 1 : 0;
  return `${ld.toFixed(digits)} LD`;
}

export function formatKm(km) {
  if (km >= 1e6) return `${(km / 1e6).toFixed(km >= 1e7 ? 1 : 2)} million km`;
  return `${Math.round(km).toLocaleString("en-US")} km`;
}

export function formatDiameter(km) {
  const m = km * 1000;
  if (m < 1000) return `${m < 10 ? m.toFixed(1) : Math.round(m)} m`;
  return `${km.toFixed(km < 10 ? 2 : 1)} km`;
}

export function formatSpeed(kmh) {
  const kms = kmh / 3600;
  return `${kms.toFixed(1)} km/s`;
}

/** "1987-05-12" → "12 May 1987". Formatted by hand so it reads the same on every device. */
export function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${FULL_MONTHS[m - 1]} ${y}`;
}

/** "05-12" → "12 May". */
export function formatMonthDay(mmdd) {
  const [m, d] = mmdd.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
