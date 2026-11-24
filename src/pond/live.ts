import { COPY } from "../copy.ts";
import { blendWind, cloudBase, type Forecast, rainLine, shelter } from "./forecast.ts";

const FIELDS = [
  "temperature_2m",
  "dew_point_2m",
  "relative_humidity_2m",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "visibility",
  "precipitation",
  "rain",
  "showers",
  "snowfall",
  "weather_code",
] as const;
type Field = typeof FIELDS[number];
const USED = [
  "temperature_2m",
  "relative_humidity_2m",
  "wind_speed_10m",
  "wind_direction_10m",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "visibility",
  "precipitation",
  "showers",
  "weather_code",
] as const satisfies readonly Field[];
const URL = "https://api.open-meteo.com/v1/forecast?latitude=41.6955&longitude=-70.0045" +
  `&hourly=${
    FIELDS.join(",")
  }&past_days=4&forecast_days=3&timezone=GMT&timeformat=unixtime&wind_speed_unit=ms`;
const MINUTE = 60_000, HOUR = 60 * MINUTE;
const STALE = 3 * HOUR, FADE = 30 * MINUTE;
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const clamp = (x: number, max = 1) => Math.min(max, Math.max(0, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (x: number) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
const RANGES: Partial<Record<Field, [number, number]>> = {
  temperature_2m: [-80, 60],
  dew_point_2m: [-80, 60],
  relative_humidity_2m: [0, 100],
  wind_speed_10m: [0, 100],
  wind_direction_10m: [0, 360],
  cloud_cover_low: [0, 100],
  cloud_cover_mid: [0, 100],
  cloud_cover_high: [0, 100],
  visibility: [0, 1e6],
  precipitation: [0, 500],
  showers: [0, 500],
  weather_code: [0, 99],
};

interface Series {
  start: number;
  rows: number;
  fields: Partial<Record<Field, unknown[]>>;
}

function parse(body: unknown): Series {
  const hourly = (body as { hourly?: Record<string, unknown> } | null)?.hourly;
  const time = hourly?.time;
  if (
    !Array.isArray(time) || time.length < 2 || !finite(time[0]) ||
    !time.every((t, i) => t === time[0] + 3600 * i)
  ) {
    throw new Error("Invalid hourly time series");
  }
  const fields: Series["fields"] = {};
  for (const key of FIELDS) {
    const values = hourly?.[key];
    if (Array.isArray(values)) fields[key] = values;
  }
  if (!USED.some((key) => fields[key]?.slice(0, time.length).some(finite))) {
    throw new Error("No usable hourly weather");
  }
  return { start: time[0] * 1000, rows: time.length, fields };
}

function value(series: Series, key: Field, row: number) {
  const v = series.fields[key]?.[row], range = RANGES[key];
  return finite(v) && (!range || (v >= range[0] && v <= range[1])) ? v : undefined;
}

function sample(series: Series, key: Field, hour: number, interpolate = mix) {
  const row = Math.floor(hour), fraction = hour - row;
  const a = value(series, key, row);
  if (a === undefined || fraction === 0) return a;
  const b = value(series, key, row + 1);
  return b === undefined ? undefined : interpolate(a, b, fraction);
}

function rainAt(series: Series, hour: number) {
  // Hourly precipitation totals belong to the hour ending at their timestamp.
  const row = Math.min(series.rows - 1, Math.floor(hour) + 1);
  const total = value(series, "precipitation", row);
  if (total === undefined) return;
  if (total <= 0) return { rate: 0, front: Infinity };
  // Interpolate only between wet hours.
  const t = Math.min(series.rows - 1, hour + 0.5), first = Math.floor(t);
  const neighbor = value(series, "precipitation", first === row ? row + 1 : first);
  const rate = neighbor !== undefined && neighbor > 0
    ? sample(series, "precipitation", t) ?? total
    : total;
  // A known dry hour anchors the onset.
  const front = value(series, "precipitation", row - 1) === 0
    ? rainLine(hour - (row - 1))
    : -Infinity;
  return { rate: Math.max(0, rate), front };
}

function mixFront(seeded: Forecast, live: NonNullable<ReturnType<typeof rainAt>>, weight: number) {
  if (weight === 1) return live.front;
  if (live.rate === 0) return seeded.rainFront;
  if (seeded.rain === 0 || seeded.rainFront === Infinity) return live.front;
  if (seeded.rainFront === live.front) return live.front;
  return mix(Math.max(-60000, seeded.rainFront), Math.max(-60000, live.front), weight);
}

// Adapted from KELPII's feed.ts.
export class LiveWeather {
  private readonly jitter = (Math.random() * 10 - 5) * MINUTE;
  private nextAt = 0;
  private pending = false;
  private failures = 0;
  private series: Series | undefined;
  private fetchedAt = 0;
  private weight = 0;
  private air: number | undefined;
  private wind: number | undefined;
  private from: number | undefined;
  private outside = false;

  /** True when fresh data arrived; an abort resolves false quietly. */
  async poll(now: number, signal?: AbortSignal) {
    if (this.pending || now < this.nextAt) return false;
    this.pending = true;
    let retryAt = 0;
    try {
      const response = await fetch(URL, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(9000)])
          : AbortSignal.timeout(9000),
      });
      const retry = response.headers.get("retry-after");
      if (retry) {
        const delay = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
        if (finite(delay) && delay > 0) retryAt = Date.now() + Math.min(delay, 24 * HOUR);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.series = parse(await response.json());
      this.fetchedAt = Date.now();
      this.nextAt = this.fetchedAt + 30 * MINUTE + this.jitter;
      this.failures = 0;
      return true;
    } catch (error) {
      if (signal?.aborted) return false;
      if (this.failures++ === 0) console.warn("Pixel Pond live weather unavailable", error);
      const delay = Math.min(30, 2 ** Math.min(5, this.failures - 1)) * MINUTE;
      this.nextAt = Date.now() + delay * (1.1 + this.jitter / (50 * MINUTE));
    } finally {
      this.nextAt = Math.max(this.nextAt, retryAt);
      this.pending = false;
    }
    return false;
  }

  apply(ms: number, now: number, seeded: Forecast) {
    this.weight = 0;
    this.outside = false;
    const series = this.series;
    if (!series) return;
    const hour = (ms - series.start) / HOUR;
    this.outside = hour < 0 || hour > series.rows - 1;
    if (this.outside) return;
    const weight = ease(1 - (now - this.fetchedAt - STALE) / FADE);
    if (!weight) return;

    const air = this.air = sample(series, "temperature_2m", hour);
    const wind = this.wind = sample(series, "wind_speed_10m", hour);
    const from = this.from = this.windFrom(series, hour);
    const rain = rainAt(series, hour);
    const code = value(series, "weather_code", Math.round(hour));
    const showers = sample(series, "showers", Math.min(series.rows - 1, hour + 0.5));
    const visibility = sample(series, "visibility", hour);
    const humidity = sample(series, "relative_humidity_2m", hour);
    const fog = code === 45 || code === 48
      ? 100
      : visibility !== undefined && humidity !== undefined
      ? 100 * (1 - ease(visibility / 1000)) * ease((humidity - 85) / 10)
      : undefined;
    const blend = (
      key: keyof Pick<
        Forecast,
        "cover" | "base" | "mid" | "cirrus" | "storms" | "fog" | "rain" | "mist" | "wind" | "airC"
      >,
      live: number | undefined,
    ) => {
      if (live === undefined) return;
      seeded[key] = mix(seeded[key], live, weight);
      this.weight = weight;
    };
    const cloud = (key: Field) => {
      const percent = sample(series, key, hour);
      return percent === undefined ? undefined : clamp(percent, 100);
    };
    const row = Math.floor(hour), fraction = hour - row;
    const baseAt = (index: number) => {
      const temperature = value(series, "temperature_2m", index);
      const dew = value(series, "dew_point_2m", index);
      return temperature === undefined || dew === undefined
        ? undefined
        : cloudBase(temperature - dew);
    };
    const baseA = baseAt(row), baseB = fraction > 0 ? baseAt(row + 1) : undefined;
    if (baseA !== undefined || baseB !== undefined) {
      blend("base", mix(baseA ?? seeded.base, baseB ?? seeded.base, fraction));
    }
    const localWind = wind === undefined
      ? seeded.wind
      : clamp(wind * shelter(seeded.waterC, air ?? seeded.airC), 20);
    if (air !== undefined) {
      const estHour = ((ms / HOUR - 5) % 24 + 24) % 24;
      const night = 1 - ease((estHour - 6) / 5) + ease((estHour - 18) / 4);
      const rate = rain?.rate ?? 50 * (seeded.rain / 100) ** 2;
      const mist = ease((seeded.waterC - air) / 8) * (1 - ease((localWind - 0.5) / 3)) *
        night * (1 - ease(rate / 3));
      blend("mist", 100 * mist);
      blend("airC", air);
    }
    blend("cover", cloud("cloud_cover_low"));
    blend("mid", cloud("cloud_cover_mid"));
    blend("cirrus", cloud("cloud_cover_high"));
    if (code !== undefined) {
      blend("storms", code >= 95 && code <= 99 ? 40 + 60 * ease((showers ?? 0) / 10) : 0);
    }
    blend("fog", fog);
    if (from !== undefined || wind !== undefined) {
      [seeded.windFrom, seeded.wind] = blendWind(
        seeded.windFrom,
        seeded.wind,
        from ?? seeded.windFrom,
        localWind,
        weight,
      );
      this.weight = weight;
    }
    if (rain) {
      seeded.rainFront = mixFront(seeded, rain, weight);
      blend("rain", 100 * clamp(Math.sqrt(rain.rate / 50)));
    }
  }

  private windFrom(series: Series, hour: number) {
    const row = Math.floor(hour), fraction = hour - row;
    const a = value(series, "wind_direction_10m", row);
    if (a === undefined || fraction === 0) return a;
    const b = value(series, "wind_direction_10m", row + 1);
    if (b === undefined) return undefined;
    const sa = value(series, "wind_speed_10m", row) ?? 1,
      sb = value(series, "wind_speed_10m", row + 1) ?? 1;
    return blendWind(a, Math.max(sa, 0.1), b, Math.max(sb, 0.1), fraction)[0];
  }

  /** Whether the last apply() blended live data. */
  get live() {
    return this.weight > 0;
  }

  readout(now: number) {
    const t = COPY.pond.live;
    if (this.outside) return t.outside;
    if (!this.weight) return t.unavailable;
    const age = Math.max(0, Math.floor((now - this.fetchedAt) / MINUTE));
    const source = this.weight < 1 ? t.fading : this.failures ? t.last : t.live;
    const details = [t.updated(source, age)];
    if (this.air !== undefined) details.push(temperature(this.air));
    if (this.wind !== undefined) details.push(windText(this.wind, this.from));
    return details.join(" · ");
  }
}

export function temperature(c: number) {
  return COPY.pond.temperature(Math.round(c * 1.8 + 32), Math.round(c));
}

export function windText(ms: number, from?: number) {
  const t = COPY.pond;
  const speed = t.wind(Math.round(ms * 2.23694), Math.round(ms));
  if (from === undefined) return speed;
  const deg = (Math.round(from) % 360 + 360) % 360;
  return t.windFrom(speed, deg, t.compass[Math.round(deg / 22.5) % 16]);
}
