import type cytoscape from "cytoscape";
import { NODE } from "../arrange/geometry.ts";
import type { Ring } from "../arrange/rings.ts";
import { COPY } from "../copy.ts";
import type { Id } from "../records/types.ts";
import type { Band, Region } from "./bands.ts";

export interface Underlay {
  show(bands: Band[], regions: Region[]): void;
  /* Follows the center person as they move */
  ring(center: Id, rings: Ring[]): void;
  hide(): void;
  /* Rereads theme colors and the label font from the page */
  restyle(): void;
  destroy(): void;
}

/* Redrawn in model space on each Cytoscape frame; `ratio` matches the map canvas's density */
export function createUnderlay(
  cy: cytoscape.Core,
  container: HTMLElement,
  ratio: number,
): Underlay {
  const layer = (cls: string) => {
    const c = document.createElement("canvas");
    c.className = cls;
    c.setAttribute("aria-hidden", "true");
    return c;
  };
  // Bands and regions sit under the people; the row labels ride above them
  const canvas = layer("underlay"), over = layer("underlay over");
  container.prepend(canvas);
  container.append(over);
  const ctx = canvas.getContext("2d")!, octx = over.getContext("2d")!;
  let bands: Band[] = [];
  let regions: Region[] = [];
  let around: { center: Id; rings: Ring[] } | null = null;
  let ink = { band: "", label: "", back: "", font: "" };
  let blank = true;

  function restyle() {
    const css = getComputedStyle(container);
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    ink = {
      band: css.getPropertyValue("--band").trim() || "rgb(255 255 255 / 0.035)",
      label: css.getPropertyValue("--muted").trim() || "#999",
      back: css.getPropertyValue("--bg").trim() || "#000",
      font: `600 ${0.75 * rem}px ${css.getPropertyValue("--font-body").trim() || "sans-serif"}`,
    };
    draw();
  }

  function draw() {
    const hub = around ? cy.$id(around.center) : undefined;
    const middle = hub?.nonempty() ? hub.position() : undefined;
    const empty = bands.length === 0 && regions.length === 0 && !middle;
    if (empty && blank) return;
    const dpr = ratio;
    const w = container.clientWidth, h = container.clientHeight;
    for (const c of [canvas, over]) {
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, over.width, over.height);
    blank = empty;
    if (empty) return;
    const zoom = cy.zoom(), pan = cy.pan();
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * pan.x, dpr * pan.y);
    const left = -pan.x / zoom, right = (w - pan.x) / zoom;

    ctx.fillStyle = ink.band;
    bands.forEach((b, i) => {
      if (i % 2 === 0) ctx.fillRect(left, b.top, right - left, b.bottom - b.top);
    });

    const pad = 10;
    ctx.globalAlpha = 0.16;
    for (const r of regions) {
      const first = cy.$id(r.ids[0]), last = cy.$id(r.ids.at(-1)!);
      if (first.empty() || last.empty()) continue;
      const a = first.position(), b = last.position();
      const x = a.x - NODE / 2 - pad, y = a.y - NODE / 2 - pad;
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.roundRect(x, y, b.x - a.x + NODE + pad * 2, NODE + pad * 2, NODE / 2 + pad);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Each ring's band reaches halfway to its neighbors
    const radii = around?.rings.map((r) => r.radius) ?? [];
    const inner = (i: number) => (radii[i] + (radii[i - 1] ?? 0)) / 2;
    const outer = (i: number) => i + 1 < radii.length ? inner(i + 1) : 2 * radii[i] - inner(i);
    if (middle) {
      ctx.fillStyle = ink.band;
      radii.forEach((_, i) => {
        if (i % 2) return;
        ctx.beginPath();
        ctx.arc(middle.x, middle.y, outer(i), 0, Math.PI * 2);
        ctx.arc(middle.x, middle.y, inner(i), 0, Math.PI * 2, true);
        ctx.fill();
      });
    }

    // Labels stay at the viewport's left edge in screen px, so they read at any zoom
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.font = ink.font;
    octx.textBaseline = "top";
    for (const b of bands) {
      if (!b.label) continue;
      const top = b.top * zoom + pan.y, bottom = b.bottom * zoom + pan.y;
      if (bottom < 0 || top > h) continue;
      const y = Math.min(Math.max(8, top + 8), bottom - 24);
      const m = octx.measureText(b.label);
      const tall = m.actualBoundingBoxDescent + m.actualBoundingBoxAscent;
      octx.globalAlpha = 0.85;
      octx.fillStyle = ink.back;
      octx.beginPath();
      octx.roundRect(6, y - 4, m.width + 12, tall + 8, 6);
      octx.fill();
      octx.globalAlpha = 1;
      octx.fillStyle = ink.label;
      octx.fillText(b.label, 12, y);
    }

    // Ring labels sit in the gap above each ring, on the line straight up from the center
    octx.textAlign = "center";
    around?.rings.forEach((r, i) => {
      if (!middle) return;
      const text = r.away === null ? COPY.map.ringApart : COPY.map.ringAway(r.away);
      const x = middle.x * zoom + pan.x, y = (middle.y - inner(i)) * zoom + pan.y - 8;
      if (y < -20 || y > h + 20) return;
      const m = octx.measureText(text);
      const tall = m.actualBoundingBoxDescent + m.actualBoundingBoxAscent;
      octx.globalAlpha = 0.85;
      octx.fillStyle = ink.back;
      octx.beginPath();
      octx.roundRect(x - m.width / 2 - 6, y - 4, m.width + 12, tall + 8, 6);
      octx.fill();
      octx.globalAlpha = 1;
      octx.fillStyle = ink.label;
      octx.fillText(text, x, y);
    });
    octx.textAlign = "start";
  }

  cy.on("render", draw);
  restyle();

  return {
    show(next, runs) {
      bands = next;
      regions = runs;
      draw();
    },
    ring(center, rings) {
      around = { center, rings };
      draw();
    },
    hide() {
      bands = [];
      regions = [];
      around = null;
      draw();
    },
    restyle,
    destroy() {
      cy.off("render", draw);
      canvas.remove();
      over.remove();
    },
  };
}
