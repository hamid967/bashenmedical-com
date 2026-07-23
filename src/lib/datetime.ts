// Shared date/time helpers with a pinned timezone to keep SSR and client
// rendering identical (avoids hydration mismatches from Node UTC vs
// browser local time).

export const APP_TZ = "Asia/Riyadh";

type Parts = { y: number; m: number; d: number };

function partsInTZ(date: Date, timeZone = APP_TZ): Parts {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Today's Y/M/D in Asia/Riyadh — identical on server and client. */
export function getAppTodayParts(): Parts {
  return partsInTZ(new Date());
}

/**
 * A Date whose *local* Y/M/D matches today in Asia/Riyadh. Safe to render
 * from because we only read getFullYear/getMonth/getDate downstream —
 * both SSR (UTC) and browser (any TZ) produce the same output.
 */
export function getAppToday(): Date {
  const { y, m, d } = getAppTodayParts();
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function formatDateInTZ(
  input: Date | string,
  lang: "ar" | "en",
  opts: Intl.DateTimeFormatOptions = { weekday: "long", year: "numeric", month: "long", day: "numeric" },
): string {
  const d = typeof input === "string" ? new Date(input.length === 10 ? input + "T00:00:00" : input) : input;
  const locale = lang === "ar" ? "ar-SA-u-ca-gregory" : "en-US";
  return new Intl.DateTimeFormat(locale, { timeZone: APP_TZ, ...opts }).format(d);
}

export function formatDateTimeInTZ(
  input: Date | string,
  lang: "ar" | "en",
  opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const locale = lang === "ar" ? "ar-SA-u-ca-gregory" : "en-US";
  return new Intl.DateTimeFormat(locale, { timeZone: APP_TZ, ...opts }).format(d);
}
