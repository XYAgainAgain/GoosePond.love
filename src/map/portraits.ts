import { figureColor, fillColor, type Tone } from "./branches.ts";

const SIZE = 96;
let canvas: HTMLCanvasElement | undefined;
/* JPEG encodes cost a few ms each; a family repeats initials and tones often */
const made = new Map<string, string>();

/* Grey with no branch, a left-to-right blend for a hyphenated name */
function paint(
  ctx: CanvasRenderingContext2D,
  tones: readonly Tone[],
  color: (t: Tone) => string,
  grey: string,
): string | CanvasGradient {
  if (tones.length < 2) return tones.length ? color(tones[0]) : grey;
  const g = ctx.createLinearGradient(0, 0, SIZE, 0);
  tones.forEach((t, i) => g.addColorStop(i / (tones.length - 1), color(t)));
  return g;
}

/* First and last word, so "Mary Ellen Smith" reads MS */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = (w: string | undefined) => (w ? [...w][0] : "") ?? "";
  const pair = words.length > 1 ? first(words[0]) + first(words.at(-1)) : first(words[0]);
  return pair.toLocaleUpperCase() || "?";
}

/* A monogram on the branch color; main.ts loads National Park before any is drawn */
export function placeholderPortrait(name: string, tones: readonly Tone[] = []): string {
  const initials = initialsOf(name);
  const key = `${initials}|${tones.map((t) => `${t.h}/${t.l}`).join(",")}`;
  const cached = made.get(key);
  if (cached) return cached;
  canvas ??= Object.assign(document.createElement("canvas"), { width: SIZE, height: SIZE });
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = paint(ctx, tones, fillColor, "#8a8f94");
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = paint(ctx, tones, figureColor, "#2b2f33");
  ctx.font = `700 ${[...initials].length > 1 ? 40 : 46}px "National Park", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials, SIZE / 2, SIZE / 2 + 2);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  if (made.size > 2000) made.clear();
  made.set(key, url);
  return url;
}
