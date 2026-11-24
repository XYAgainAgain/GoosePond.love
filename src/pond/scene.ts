export type MoonPhase =
  | "new"
  | "waxingCrescent"
  | "firstQuarter"
  | "waxingGibbous"
  | "full"
  | "waningGibbous"
  | "lastQuarter"
  | "waningCrescent";

export type Sky = "clear" | "partly" | "overcast" | "fog" | "mist" | "rain" | "storm";

/* fraction is the lit share of the disc, 0–1 */
export function moonPhase(fraction: number, waxing: boolean): MoonPhase {
  if (fraction < 0.03) return "new";
  if (fraction > 0.97) return "full";
  if (Math.abs(fraction - 0.5) < 0.05) return waxing ? "firstQuarter" : "lastQuarter";
  if (fraction < 0.5) return waxing ? "waxingCrescent" : "waningCrescent";
  return waxing ? "waxingGibbous" : "waningGibbous";
}

/* Settings are 0–100; the most striking wins */
export function skyOf(w: {
  storms: number;
  rain: number;
  fog: number;
  mist: number;
  cover: number;
  mid: number;
}): Sky {
  if (w.storms >= 20) return "storm";
  if (w.rain >= 8) return "rain";
  if (w.fog >= 35) return "fog";
  if (w.mist >= 50) return "mist";
  const cover = Math.max(w.cover, w.mid);
  if (cover >= 75) return "overcast";
  return cover >= 35 ? "partly" : "clear";
}

/* rate: simulated s per real s, or null for the real clock */
export function nextSimMs(
  simMs: number,
  seconds: number,
  rate: number | null,
  still: boolean,
  now: number,
): number {
  if (rate === null) return now;
  return still ? simMs : simMs + seconds * 1000 * rate;
}
