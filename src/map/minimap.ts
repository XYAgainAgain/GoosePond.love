import type cytoscape from "cytoscape";

export interface Minimap {
  /* Rereads theme colors from the page */
  restyle(): void;
  destroy(): void;
}

const W = 168, H = 112, PAD = 8;

/* Tapping or dragging on it moves the view there */
export function createMinimap(cy: cytoscape.Core, container: HTMLElement): Minimap {
  const canvas = document.createElement("canvas");
  canvas.className = "minimap";
  canvas.setAttribute("aria-hidden", "true");
  container.append(canvas);
  const ctx = canvas.getContext("2d")!;
  const dots = document.createElement("canvas");
  const dctx = dots.getContext("2d")!;
  let ink = { dot: "#999", frame: "#fff", back: "#000" };
  let fit = { scale: 1, x: 0, y: 0 };
  let stale = true;
  let shown = false;
  let box = { x1: 0, x2: 0, y1: 0, y2: 0, w: 0, h: 0 };

  const people = () => cy.nodes().not(".bus");

  function restyle() {
    const css = getComputedStyle(container);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    ink = { dot: v("--muted", "#999"), frame: v("--text", "#fff"), back: v("--panel", "#000") };
    stale = true;
    draw();
  }

  function paintDots(dpr: number) {
    if (!isFinite(box.w) || box.w === 0) return;
    const scale = Math.min((W - PAD * 2) / box.w, (H - PAD * 2) / Math.max(box.h, 1));
    fit = {
      scale,
      x: PAD + (W - PAD * 2 - box.w * scale) / 2 - box.x1 * scale,
      y: PAD + (H - PAD * 2 - box.h * scale) / 2 - box.y1 * scale,
    };
    dots.width = W * dpr;
    dots.height = H * dpr;
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = Math.max(1.5, Math.min(3, scale * 23));
    people().forEach((n) => {
      const p = n.position();
      dctx.fillStyle = n.data("branch") ?? ink.dot;
      dctx.globalAlpha = n.hasClass("dim") ? 0.35 : 1;
      dctx.beginPath();
      dctx.arc(fit.x + p.x * fit.scale, fit.y + p.y * fit.scale, r, 0, Math.PI * 2);
      dctx.fill();
    });
    dctx.globalAlpha = 1;
  }

  function draw() {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const ext = cy.extent();
    if (stale) {
      const everyone = people();
      box = everyone.empty() ? { x1: 0, x2: 0, y1: 0, y2: 0, w: 0, h: 0 } : everyone.boundingBox({
        includeLabels: false,
      });
      paintDots(dpr);
      stale = false;
    }
    // Hidden while everyone fits on screen
    const fits = box.w === 0 ||
      (box.x1 >= ext.x1 && box.x2 <= ext.x2 && box.y1 >= ext.y1 && box.y2 <= ext.y2);
    if (fits !== !shown) {
      shown = !fits;
      canvas.hidden = fits;
    }
    if (fits) return;
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(dots, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = ink.frame;
    ctx.lineWidth = 1.5;
    const x1 = Math.max(1, fit.x + ext.x1 * fit.scale),
      y1 = Math.max(1, fit.y + ext.y1 * fit.scale);
    const x2 = Math.min(W - 1, fit.x + ext.x2 * fit.scale);
    const y2 = Math.min(H - 1, fit.y + ext.y2 * fit.scale);
    if (x2 > x1 && y2 > y1) ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }

  function jump(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - fit.x) / fit.scale;
    const my = (e.clientY - rect.top - fit.y) / fit.scale;
    const zoom = cy.zoom();
    cy.stop(true, false);
    cy.pan({ x: cy.width() / 2 - mx * zoom, y: cy.height() / 2 - my * zoom });
  }
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    jump(e);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (canvas.hasPointerCapture(e.pointerId)) jump(e);
  });

  const restale = () => (stale = true);
  cy.on("position add remove style", restale);
  cy.on("render", draw);
  restyle();

  return {
    restyle,
    destroy() {
      cy.off("position add remove style", restale);
      cy.off("render", draw);
      canvas.remove();
    },
  };
}
