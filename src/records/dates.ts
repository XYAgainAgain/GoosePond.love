import { COPY } from "../copy.ts";
import type { FuzzyDate } from "./types.ts";

export interface DateSpan {
  /* years */
  earliest: number;
  latest: number;
  approximate: boolean;
}

interface Point {
  year: number;
  month?: number;
  day?: number;
  approximate: boolean;
}

const POINT = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?([~?])?$/;
const MONTHS = COPY.dates.months;

function daysIn(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function point(text: string): Point | undefined {
  const m = POINT.exec(text.trim());
  if (!m) return undefined;
  const month = m[2] ? Number(m[2]) : undefined;
  const day = m[3] ? Number(m[3]) : undefined;
  if (month !== undefined && (month < 1 || month > 12)) return undefined;
  const year = Number(m[1]);
  if (day !== undefined && (day < 1 || day > daysIn(year, month!))) return undefined;
  return { year, month, day, approximate: m[4] !== undefined };
}

function points(d: FuzzyDate): Point[] | undefined {
  const parts = d.split("/");
  if (parts.length > 2) return undefined;
  const parsed = parts.map(point);
  if (parsed.some((p) => !p)) return undefined;
  return parsed as Point[];
}

export function isValidDate(d: FuzzyDate): boolean {
  const ps = points(d);
  return !!ps && (ps.length === 1 || ps[0].year <= ps[1].year);
}

export function dateSpan(d: FuzzyDate | undefined): DateSpan | undefined {
  if (!d) return undefined;
  const ps = points(d);
  if (!ps) return undefined;
  return {
    earliest: ps[0].year,
    latest: ps[ps.length - 1].year,
    approximate: ps.some((p) => p.approximate),
  };
}

function wording(p: Point): string {
  const text = p.month === undefined
    ? String(p.year)
    : p.day === undefined
    ? COPY.dates.month(MONTHS[p.month - 1], p.year)
    : COPY.dates.day(MONTHS[p.month - 1], p.day, p.year);
  return p.approximate ? COPY.dates.about(text) : text;
}

/* Unparseable text comes back as written, so nothing is silently sharpened */
export function formatDate(d: FuzzyDate | undefined): string {
  if (!d) return COPY.dates.unknown;
  const ps = points(d);
  if (!ps) return d;
  return ps.length === 1 ? wording(ps[0]) : COPY.dates.between(wording(ps[0]), wording(ps[1]));
}
