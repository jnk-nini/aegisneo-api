export function formatDistance(meters) {
  if (meters == null) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  if (km < 10) return `${km.toFixed(2)} km`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

export function formatEnergy(megatons) {
  if (megatons < 1e-3) return `${(megatons * 1e6).toFixed(megatons * 1e6 < 10 ? 1 : 0)} tons of TNT`;
  if (megatons < 1) return `${(megatons * 1000).toFixed(megatons * 1000 < 10 ? 1 : 0)} kilotons of TNT`;
  if (megatons < 1000) return `${megatons.toFixed(megatons < 10 ? 2 : 1)} megatons of TNT`;
  return `${formatBig(megatons)} megatons of TNT`;
}

export function formatBig(n) {
  if (n < 1e6) return Math.round(n).toLocaleString();
  const units = [
    [1e12, "trillion"],
    [1e9, "billion"],
    [1e6, "million"],
  ];
  for (const [size, word] of units)
    if (n >= size) return `${(n / size).toFixed(n / size < 10 ? 1 : 0)} ${word}`;
  return String(n);
}

export function formatYears(years) {
  if (years < 1) return "several times a year";
  if (years < 2) return "about once a year";
  return `about once every ${formatBig(years)} years`;
}

export function formatSpeed(kms) {
  return `${kms.toFixed(kms < 10 ? 2 : 1)} km/s`;
}

export function formatDiameter(meters) {
  return meters < 1000
    ? `${meters < 10 ? meters.toFixed(1) : Math.round(meters)} m`
    : `${(meters / 1000).toFixed(meters < 10000 ? 2 : 1)} km`;
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
