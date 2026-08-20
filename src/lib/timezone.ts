// Small timezone conversion utilities built only on the native Intl API — no new
// dependency, matching the project's convention of hand-rolling anything that doesn't
// clearly need a library. IANA zone data (including DST rules) ships with the browser,
// so this stays correct without a bundled tz database.

function getZonedParts(instant: Date, timeZone: string) {
  // hourCycle: "h23" pins the hour to a strict 0-23 range — without it some engines'
  // default inference for hour12:false can emit "24" for midnight, which would make
  // naive arithmetic on the parts silently wrong.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** Converts a wall-clock date+time as observed in `timeZone` into the equivalent UTC
 * ISO instant — e.g. "2026-08-25"+"19:00" in "Asia/Shanghai" becomes the UTC instant
 * that reads as 19:00 in Shanghai on that date (DST-correct for zones that observe it).
 * Standard "format the guess, measure the drift, correct" technique — converges in one
 * pass except right at a DST transition, where a second pass resolves it. */
export function zonedWallTimeToUtcISO(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);

  let guess = target;
  for (let i = 0; i < 2; i++) {
    const shown = getZonedParts(new Date(guess), timeZone);
    const shownAsUTC = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, 0);
    const drift = shownAsUTC - target;
    if (drift === 0) break;
    guess -= drift;
  }
  return new Date(guess).toISOString();
}

/** Formats a stored UTC ISO instant as a "YYYY-MM-DD HH:mm" wall-clock string in the
 * given IANA zone — reused both for showing a student their own local time back to them
 * and for the admin view's parallel KST display of the same instant. */
export function formatInTimeZone(isoUTC: string, timeZone: string): string {
  const p = getZonedParts(new Date(isoUTC), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** Best-effort local IANA zone for languages without an explicit `timeZone` mapping in
 * SUPPORTED_LANGUAGES (currently just "en") — falls back to Korea's zone, the business's
 * own timezone, if the browser can't report one. */
export function detectLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul";
  } catch {
    return "Asia/Seoul";
  }
}
