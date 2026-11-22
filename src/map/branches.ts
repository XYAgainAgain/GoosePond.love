import { familyName, surnameParts } from "../records/surnames.ts";
import type { Id, Person } from "../records/types.ts";

export interface Tone {
  /* OKLCH hue and lightness */
  h: number;
  l: number;
}

// Two lightness passes; 40–110° stays free for the selected orange and the ringed yellow
const HUES = [118, 262, 190, 334, 142, 286, 214, 358, 166, 310, 238, 22];
const TONES: Tone[] = [0.76, 0.6].flatMap((l) => HUES.map((h) => ({ h, l })));

/* FNV-1a, so a family name lands on the same tone in every session */
function slotOf(name: string): number {
  let hash = 0x811c9dc5;
  for (const ch of name.toLowerCase()) hash = Math.imul(hash ^ ch.codePointAt(0)!, 0x01000193);
  return (hash >>> 0) % TONES.length;
}

// Names claim slots in first-seen order and people are only appended, so a new relative never
// recolors anyone else
function assign(parts: Iterable<string[]>): Map<string, Tone> {
  const taken = new Set<number>();
  const tone = new Map<string, Tone>();
  for (const s of [...new Set([...parts].flat())].slice(0, TONES.length)) {
    let slot = slotOf(s);
    while (taken.has(slot)) slot = (slot + 1) % TONES.length;
    taken.add(slot);
    tone.set(s, TONES[slot]);
  }
  return tone;
}

export function branchTones(people: readonly Person[]): Map<Id, Tone[]> {
  const parts = new Map(people.map((p) => [p.id, [...new Set(surnameParts(p))]]));
  const tone = assign(parts.values());
  return new Map([...parts].map(([id, ps]) => [id, ps.flatMap((s) => tone.get(s) ?? [])]));
}

/* Each branch's family name, as first written, with its tone, for the map key */
export function branchKey(people: readonly Person[]): { name: string; tone: Tone }[] {
  const shown = new Map<string, string>();
  for (const p of people) {
    for (const part of familyName(p)?.split("-") ?? []) {
      const name = part.trim();
      if (name && !shown.has(name.toLowerCase())) shown.set(name.toLowerCase(), name);
    }
  }
  const tone = assign(people.map(surnameParts));
  return [...tone].map(([key, t]) => ({ name: shown.get(key) ?? key, tone: t }));
}

function channel(v: number): number {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

/* Björn Ottosson's OKLab matrices; out-of-gamut channels clip */
export function oklchHex(l: number, c: number, h: number): string {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ];
  return `#${rgb.map((v) => channel(v).toString(16).padStart(2, "0")).join("")}`;
}

export const ringColor = (t: Tone) => oklchHex(t.l, 0.12, t.h);
export const fillColor = (t: Tone) => oklchHex(t.l - 0.15, 0.075, t.h);
export const figureColor = (t: Tone) => oklchHex(t.l - 0.44, 0.05, t.h);
