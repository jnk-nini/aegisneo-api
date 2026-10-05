// The atlas is a planisphere: angle around Earth is the day of the year of the
// close approach, with January 1 at the top and the year running clockwise.

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_LENGTHS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // leap-year layout, so Feb 29 has a place
const YEAR_DAYS = 366;

// Day index (0–365) each month starts on in the leap-year layout.
export const MONTH_STARTS = MONTH_LENGTHS.reduce((starts, len, i) => {
  starts.push(i === 0 ? 0 : starts[i - 1] + MONTH_LENGTHS[i - 1]);
  return starts;
}, []);

/** Day index (0–365) for an ISO "YYYY-MM-DD" date, ignoring the year. Null if invalid. */
export function dayIndex(isoDate) {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(isoDate || "");
  if (!match) return null;
  const month = Number(match[1]) - 1;
  const day = Number(match[2]) - 1;
  if (month < 0 || month > 11 || day < 0 || day >= MONTH_LENGTHS[month]) return null;
  return MONTH_STARTS[month] + day;
}

/** Angle in radians for a day index, with 0 days at 12 o'clock and increasing clockwise. */
export function dayAngle(index) {
  return (index / YEAR_DAYS) * Math.PI * 2 - Math.PI / 2;
}
