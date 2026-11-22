import { COPY } from "../copy.ts";
import { branchKey, ringColor } from "../map/branches.ts";
import { lineStyle } from "../map/style.ts";
import type { TieFamily } from "../records/kinds.ts";
import type { Archive } from "../records/types.ts";
import { keyLines } from "./key.ts";
import { currentTheme } from "./settings.ts";
import { mapColors } from "./themes.ts";

export async function framePicture(
  map: Blob,
  archive: Archive,
  hidden: ReadonlySet<TieFamily>,
): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const ink = { bg: v("--bg", "#1a1310"), text: v("--text", "#eee"), muted: v("--muted", "#aaa") };
  const body = v("--font-body", "sans-serif"), heading = v("--font-heading", "serif");
  const ground = mapColors(currentTheme()).ground;
  const img = await createImageBitmap(map);

  const u = Math.max(1, img.width / 1400);
  const margin = 48 * u;
  const width = Math.max(img.width, 900 * u) + margin * 2;
  const head = 130 * u;

  const lines = keyLines(hidden);
  const families = branchKey(archive.people);
  const cell = 300 * u, rowH = 34 * u;
  const perRow = Math.max(1, Math.floor((width - margin * 2) / cell));
  const keyRows = Math.ceil(lines.length / perRow) + Math.ceil(families.length / perRow);
  const foot = 70 * u + keyRows * rowH + margin;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(head + img.height + foot);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = ink.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, (width - img.width) / 2, head);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ink.text;
  ctx.font = `700 ${52 * u}px ${heading}`;
  ctx.fillText(archive.title, margin, 70 * u);
  ctx.fillStyle = ink.muted;
  ctx.font = `400 ${22 * u}px ${body}`;
  const day = new Date().toLocaleDateString("en-US", { dateStyle: "long" });
  ctx.fillText(COPY.picture.made(day), margin, 106 * u);

  let y = head + img.height + 50 * u;
  ctx.font = `600 ${20 * u}px ${body}`;
  ctx.fillStyle = ink.muted;
  ctx.fillText(COPY.key.lines, margin, y);
  ctx.font = `400 ${18 * u}px ${body}`;
  y += rowH * 0.9;
  lines.forEach((l, i) => {
    const x = margin + (i % perRow) * cell, ly = y + Math.floor(i / perRow) * rowH;
    const s = lineStyle(l.kind, ground);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = Math.min(4, s.width) * u;
    ctx.lineCap = s.line === "dotted" ? "round" : "butt";
    ctx.setLineDash(
      s.line === "dotted" ? [0.1, 6 * u] : s.dash ? s.dash.map((d) => d * 0.6 * u) : [],
    );
    ctx.beginPath();
    ctx.moveTo(x, ly - 6 * u);
    ctx.lineTo(x + 44 * u, ly - 6 * u);
    ctx.stroke();
    ctx.fillStyle = ink.text;
    ctx.fillText(l.label, x + 56 * u, ly, cell - 64 * u);
  });
  ctx.setLineDash([]);
  y += Math.ceil(lines.length / perRow) * rowH;
  families.forEach((f, i) => {
    const x = margin + (i % perRow) * cell, fy = y + Math.floor(i / perRow) * rowH;
    ctx.fillStyle = ringColor(f.tone);
    ctx.beginPath();
    ctx.arc(x + 8 * u, fy - 6 * u, 8 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink.text;
    ctx.fillText(f.name, x + 26 * u, fy, cell - 34 * u);
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(COPY.picture.failed))), "image/png")
  );
}
