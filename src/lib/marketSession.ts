import type { AssetClass } from "@/types";

const dayMs = 86400000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const nyDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const nyHour = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  hourCycle: "h23",
});
export const marketDayKey = (now: number) => {
  // Locale date ordering varies across browsers; build the key from named parts.
  const parts = nyDate.formatToParts(now);
  return ["year", "month", "day"]
    .map(type => parts.find(part => part.type === type)!.value)
    .join("-");
};
const nth = (year: number, month: number, weekday: number, n: number) => {
  const date = new Date(Date.UTC(year, month, 1));
  date.setUTCDate(1 + ((weekday - date.getUTCDay() + 7) % 7) + (n - 1) * 7);
  return date;
};
const observed = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCDay() === 6) date.setUTCDate(day - 1);
  if (date.getUTCDay() === 0) date.setUTCDate(day + 1);
  return date;
};
function easter(year: number) {
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100;
  const d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451),
    x = h + l - 7 * m + 114;
  return new Date(Date.UTC(year, Math.floor(x / 31) - 1, (x % 31) + 1));
}
export function nyseHoliday(key: string): boolean {
  const year = Number(key.slice(0, 4));
  const goodFriday = new Date(easter(year).getTime() - 2 * dayMs);
  const memorial = new Date(Date.UTC(year, 5, 0));
  memorial.setUTCDate(memorial.getUTCDate() - ((memorial.getUTCDay() + 6) % 7));
  const newYear = new Date(Date.UTC(year, 0, 1));
  // NYSE does not observe a Saturday New Year's Day on the preceding Friday.
  if (newYear.getUTCDay() === 0) newYear.setUTCDate(2);
  return (
    [
      newYear,
      nth(year, 0, 1, 3),
      nth(year, 1, 1, 3),
      goodFriday,
      memorial,
      observed(year, 5, 19),
      observed(year, 6, 4),
      nth(year, 8, 1, 1),
      nth(year, 10, 4, 4),
      observed(year, 11, 25),
    ].some(date => iso(date) === key) || key === "2025-01-09"
  );
}

export function marketSession(assetClass: AssetClass, now: number) {
  const date = new Date(now);
  const key = assetClass === "crypto" ? iso(date) : marketDayKey(now);
  const [year, month, day] = key.split("-").map(Number);
  if (assetClass === "crypto") {
    const open = Date.UTC(year, month - 1, day);
    return {
      key,
      open,
      close: open + dayMs,
      cutoff: open + dayMs,
      flatBy: null,
      openNow: true,
      tradingDay: true,
      known: true,
      early: false,
      label: "Referencia del día UTC · cripto 24/7",
    };
  }
  // Noon UTC always belongs to the requested New York calendar date.
  const noon = Date.UTC(year, month - 1, day, 12);
  const parts = nyHour.formatToParts(noon);
  const hour = Number(parts.find(p => p.type === "hour")!.value);
  const offset = 12 - hour;
  const thanksgiving = nth(year, 10, 4, 4);
  const early =
    key === iso(new Date(thanksgiving.getTime() + dayMs)) ||
    (month === 7 && day === 3) ||
    (month === 12 && day === 24);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const known = year >= 2025 && year <= 2030;
  const tradingDay = weekday !== 0 && weekday !== 6 && !nyseHoliday(key);
  const open = Date.UTC(year, month - 1, day, 9 + offset, 30);
  const close = Date.UTC(year, month - 1, day, (early ? 13 : 16) + offset);
  return {
    key,
    open,
    close,
    cutoff: close - 30 * 60000,
    flatBy: close - 5 * 60000,
    openNow: known && tradingDay && now >= open && now < close,
    tradingDay,
    known,
    early: early && tradingDay,
    label: tradingDay
      ? `Sesión regular NYSE${early ? " · cierre anticipado" : ""}`
      : "NYSE cerrada: fin de semana o festivo",
  };
}
