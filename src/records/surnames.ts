import type { Person } from "./types.ts";

const SUFFIX = /^(?:[IVX]+|Jr\.?|Sr\.?)$/;
const PLACE_OR_EPITHET = /^(?:of|the)$/i;
const PARTICLE = new Set([
  "da",
  "das",
  "de",
  "del",
  "della",
  "den",
  "der",
  "di",
  "dos",
  "du",
  "la",
  "le",
  "van",
  "von",
]);

/* The family name at birth as written, or undefined when none can be read */
export function familyName(p: Person): string | undefined {
  const given = p.surname?.trim();
  if (given) return given;
  const full = (p.birthName ?? p.name).trim();
  const [head, ...rest] = full.split(",");
  const after = rest.join(",").trim().split(/\s+/).filter(Boolean);
  // "Smith, Mary Ellen" puts the family name first
  if (after.length && !after.every((w) => SUFFIX.test(w)) && head.trim()) return head.trim();

  let words = head.trim().split(/\s+/);
  const cut = words.findIndex((w, i) => i > 0 && PLACE_OR_EPITHET.test(w));
  if (cut > 0) words = words.slice(0, cut);
  while (words.length > 1 && SUFFIX.test(words[words.length - 1])) words.pop();
  if (words.length < 2) return undefined;
  let start = words.length - 1;
  while (start > 1 && PARTICLE.has(words[start - 1])) start--;
  return words.slice(start).join(" ");
}

/* The family name at birth, lowercased and split at hyphens; empty when none can be read */
export function surnameParts(p: Person): string[] {
  const family = familyName(p);
  if (!family) return [];
  return family.split("-").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
