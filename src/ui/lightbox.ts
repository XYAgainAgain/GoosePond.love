import { COPY } from "../copy.ts";
import { h } from "./dom.ts";
import { haptic } from "./haptics.ts";

export interface LightboxItem {
  src: string;
  title: string;
  detail?: string;
}

interface Viewer {
  open(items: LightboxItem[], start: number): void;
}

const MAX_SCALE = 4; // CSS px per image px
const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6]; // multiples of the fit size
const DECODE_NEIGHBORS = [1, -1];
const COMMIT_MS = 140;
const TWEEN_MS = 220;
const SWIPE_PX = 50;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
const PAN_STEP = 80;
const SVG_NS = "http://www.w3.org/2000/svg";

let viewer: Viewer | null = null;

export function openLightbox(items: LightboxItem[], start: number): void {
  if (!items.length || !document.body) return;
  viewer ??= createViewer();
  viewer.open(items, start);
}

function icon(viewBox: string, d: string, strokeWidth: string, cls?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  if (cls) svg.setAttribute("class", cls);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", strokeWidth);
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

function reducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function shortcutsOn(): boolean {
  return document.documentElement.dataset.shortcuts !== "off";
}

// Matches margin: auto, which centers the image until it outgrows the wrapper
function centerOffset(size: number, client: number): number {
  return Math.max(0, (client - size) / 2);
}

/* Holds the live gesture to what the committed scroll layout can show, so the commit never snaps */
function clampOffset(offset: number, size: number, client: number): number {
  if (size <= client) return (client - size) / 2;
  return Math.min(0, Math.max(client - size, offset));
}

function createViewer(): Viewer {
  const text = COPY.lightbox;
  const controller = new AbortController();
  const { signal } = controller;

  const state = {
    items: [] as LightboxItem[],
    index: 0,
    isOpen: false,
    previousFocus: null as HTMLElement | null,
    scale: 0, // 0 is fit; otherwise CSS px per image px
    natural: { w: 0, h: 0 }, // img.naturalWidth lags during src swaps
    gen: 0, // bumps on every update and close; a stale decode checks it
  };

  const elImage = h("img", { class: "lightbox-image", draggable: false, decoding: "async" });
  const elWrapper = h("div", { class: "lightbox-image-wrapper" }, elImage);
  const elNotice = h("div", { class: "lightbox-notice", hidden: true, attrs: { role: "status" } });
  const elZoomOut = h(
    "button",
    {
      type: "button",
      class: "lightbox-rocker-btn",
      title: text.zoomOut,
      attrs: { "aria-label": text.zoomOut },
    },
    icon("0 0 16 16", "M3 8h10", "2.5"),
  );
  const elZoomLevel = h("span", {
    class: "lightbox-rocker-label",
    textContent: text.fit,
    attrs: { "aria-live": "polite" },
  });
  const elZoomIn = h(
    "button",
    {
      type: "button",
      class: "lightbox-rocker-btn",
      title: text.zoomIn,
      attrs: { "aria-label": text.zoomIn },
    },
    icon("0 0 16 16", "M3 8h10M8 3v10", "2.5"),
  );
  const elReset = h("button", {
    type: "button",
    class: "lightbox-zoom-fit",
    textContent: text.reset,
    attrs: { "aria-label": text.resetLabel },
  });
  const elHintNav = h("span", { class: "lightbox-hint-nav" });
  const footer = h(
    "div",
    { class: "lightbox-frame-footer" },
    h(
      "div",
      { class: "lightbox-zoom-controls" },
      h(
        "div",
        { class: "lightbox-rocker", attrs: { role: "group", "aria-label": text.zoomGroup } },
        elZoomOut,
        elZoomLevel,
        elZoomIn,
      ),
      elReset,
    ),
    h("p", { class: "lightbox-hint" }, text.hint, elHintNav),
  );
  const elTitle = h("h2", { class: "lightbox-title", id: "lightbox-title" });
  const elDetail = h("p", { class: "lightbox-detail", hidden: true });
  const elCounter = h("p", { class: "lightbox-counter" });
  const elStatus = h("p", {
    class: "lightbox-sr-only",
    attrs: { role: "status", "aria-live": "polite" },
  });
  const elPrev = h(
    "button",
    { type: "button", class: "lightbox-nav lightbox-prev", attrs: { "aria-label": text.previous } },
    icon("0 0 24 24", "M6 12H18M6 12L11 7M6 12L11 17", "2"),
  );
  const elNext = h(
    "button",
    { type: "button", class: "lightbox-nav lightbox-next", attrs: { "aria-label": text.next } },
    icon("0 0 24 24", "M6 12H18M18 12L13 7M18 12L13 17", "2"),
  );
  const elClose = h(
    "button",
    { type: "button", class: "lightbox-close", attrs: { "aria-label": text.close } },
    icon("0 0 36 36", "M7.5 7.5 28.5 28.5M28.5 7.5 7.5 28.5", "3", "lightbox-close-icon"),
  );
  const overlay = h(
    "div",
    {
      class: "lightbox-overlay",
      attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "lightbox-title" },
    },
    elPrev,
    h(
      "div",
      { class: "lightbox-container" },
      h("div", { class: "lightbox-image-frame" }, elWrapper, elNotice, footer),
      h("div", { class: "lightbox-caption" }, elTitle, elDetail, elCounter, elStatus),
    ),
    elNext,
    elClose,
  );
  document.body.append(overlay);

  const decoded = new Map<string, Promise<HTMLImageElement>>();
  const ready = new Map<string, HTMLImageElement>(); // so a warm neighbor shows without awaiting

  function preload(src: string): Promise<HTMLImageElement> {
    const known = decoded.get(src);
    if (known) return known;
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    // Only the live entry may mark ready or evict: pruning may have replaced it
    const mine: Promise<HTMLImageElement> = img.decode().then(() => {
      if (decoded.get(src) === mine) ready.set(src, img);
      return img;
    });
    mine.catch(() => {
      if (decoded.get(src) === mine) decoded.delete(src);
    });
    decoded.set(src, mine);
    return mine;
  }

  function keepSet(): Set<string> {
    const keep = new Set<string>();
    const current = state.items[state.index];
    if (!current) return keep;
    keep.add(current.src);
    for (const dir of DECODE_NEIGHBORS) {
      const near = state.items[state.index + dir];
      if (near) keep.add(near.src);
    }
    return keep;
  }

  function pruneDecoded() {
    const keep = keepSet();
    for (const src of decoded.keys()) {
      if (keep.has(src)) continue;
      decoded.delete(src);
      ready.delete(src);
    }
  }

  function warmNeighbors() {
    for (const src of keepSet()) preload(src).catch(() => {});
  }

  // A visibility: hidden control holds its slot but isn't focusable
  function isVisible(el: Element | null): el is HTMLElement {
    return el instanceof HTMLElement && el.offsetParent !== null &&
      getComputedStyle(el).visibility !== "hidden";
  }

  function getFocusable(): HTMLElement[] {
    return Array.from(overlay.querySelectorAll<HTMLButtonElement>("button:not([hidden])"))
      .filter((el) => !el.disabled && isVisible(el));
  }

  function fitScale(): number {
    if (!state.natural.w || !elWrapper.clientWidth) return 1;
    return Math.min(
      elWrapper.clientWidth / state.natural.w,
      elWrapper.clientHeight / state.natural.h,
      1,
    );
  }

  function currentScale(): number {
    return state.scale || fitScale();
  }

  // Cached: reading it per wheel event, right after a width write, forces a layout
  let wrapperRect: DOMRect | null = null;
  function wrapperOrigin(): DOMRect {
    wrapperRect ??= elWrapper.getBoundingClientRect();
    return wrapperRect;
  }

  /* A live gesture moves only the transform: per-frame width writes re-raster big bitmaps (Firefox
     downscales on the main thread). ox/oy track the image's top-left while layout stays frozen */
  const gesture = {
    active: false,
    baseW: 0,
    scale: 0,
    ox: 0,
    oy: 0,
    offX: 0,
    offY: 0,
    left: 0,
    top: 0,
    cw: 0,
    ch: 0,
  };
  let commitTimer = 0;

  function beginGesture() {
    if (gesture.active || !state.natural.w) return;
    const start = currentScale();
    overlay.classList.add("zoomed");
    state.scale = start;
    gesture.baseW = Math.round(state.natural.w * start);
    elImage.style.width = gesture.baseW + "px";
    elImage.style.transformOrigin = "0 0";

    const noBars = elWrapper.scrollWidth <= elWrapper.clientWidth &&
      elWrapper.scrollHeight <= elWrapper.clientHeight;
    gesture.cw = elWrapper.clientWidth;
    gesture.ch = elWrapper.clientHeight;
    gesture.left = elWrapper.scrollLeft;
    gesture.top = elWrapper.scrollTop;
    gesture.offX = centerOffset(gesture.baseW, gesture.cw);
    gesture.offY = centerOffset(Math.round(state.natural.h * start), gesture.ch);
    gesture.ox = gesture.offX - gesture.left;
    gesture.oy = gesture.offY - gesture.top;
    gesture.scale = start;
    gesture.active = true;
    overlay.classList.add("zooming");
    // Transformed overflow would pop a scrollbar mid-gesture; only safe to clip when none is showing
    if (noBars) overlay.classList.add("zoom-clip");
  }

  function commitGesture() {
    if (!gesture.active) return;
    gesture.active = false;
    clearTimeout(commitTimer);
    overlay.classList.remove("zooming", "zoom-clip");

    const scale = gesture.scale;
    if (scale <= fitScale() + 0.001) {
      exitZoom();
      return;
    }
    const w = Math.round(state.natural.w * scale);
    const hgt = Math.round(state.natural.h * scale);
    state.scale = scale;
    elImage.style.transform = "";
    elImage.style.width = w + "px";
    elWrapper.scrollLeft = centerOffset(w, elWrapper.clientWidth) - gesture.ox;
    elWrapper.scrollTop = centerOffset(hgt, elWrapper.clientHeight) - gesture.oy;
    elZoomLevel.textContent = zoomLabel(scale);
  }

  function applyScale(target: number, focusX?: number, focusY?: number) {
    if (!state.natural.w) return;
    if (target <= fitScale() + 0.001) {
      exitZoom();
      return;
    }
    const scale = Math.min(target, MAX_SCALE);

    beginGesture();
    if (!gesture.active) return;

    const fx = focusX ?? gesture.cw / 2;
    const fy = focusY ?? gesture.ch / 2;
    // The image pixel under the focus point, held still across the scale change
    const pointX = (fx - gesture.ox) / gesture.scale;
    const pointY = (fy - gesture.oy) / gesture.scale;

    gesture.scale = scale;
    gesture.ox = clampOffset(fx - pointX * scale, state.natural.w * scale, gesture.cw);
    gesture.oy = clampOffset(fy - pointY * scale, state.natural.h * scale, gesture.ch);
    state.scale = scale;

    const tx = gesture.ox - gesture.offX + gesture.left;
    const ty = gesture.oy - gesture.offY + gesture.top;
    elImage.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${
      scale * state.natural.w / gesture.baseW
    })`;
    elZoomLevel.textContent = zoomLabel(scale);

    clearTimeout(commitTimer);
    commitTimer = setTimeout(commitGesture, COMMIT_MS);
  }

  function zoomLabel(scale: number): string {
    const mult = scale / fitScale();
    const shown = mult >= 10 ? Math.round(mult) : Math.round(mult * 10) / 10;
    return text.zoomLevel(String(shown), Math.abs(scale - 1) < 0.01);
  }

  let tween = 0;
  function animateScale(target: number, fx?: number, fy?: number) {
    if (tween) cancelAnimationFrame(tween);
    tween = 0;
    const from = currentScale();
    if (reducedMotion() || Math.abs(target - from) < 0.001) {
      applyScale(target, fx, fy);
      return;
    }
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / TWEEN_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      applyScale(from + (target - from) * eased, fx, fy);
      tween = t < 1 ? requestAnimationFrame(frame) : 0;
    };
    tween = requestAnimationFrame(frame);
  }

  function stepZoom(dir: number) {
    const fit = fitScale();
    const mult = currentScale() / fit;
    const steps = ZOOM_STEPS.filter((m) => m === 1 || m * fit <= MAX_SCALE);
    const next = dir > 0
      ? steps.find((m) => m > mult + 0.01)
      : steps.filter((m) => m < mult - 0.01).at(-1);
    if (next !== undefined) animateScale(next * fit);
  }

  function toggleZoomAt(clientX: number, clientY: number) {
    const rect = wrapperOrigin();
    const fit = fitScale();
    if (currentScale() > fit + 0.001) {
      animateScale(fit);
      return;
    }
    animateScale(Math.max(1, fit * 2), clientX - rect.left, clientY - rect.top);
  }

  let wheelDelta = 0;
  let wheelFrame = 0;
  let wheelFocus = { x: 0, y: 0 };

  function cancelWheelZoom() {
    if (wheelFrame) cancelAnimationFrame(wheelFrame);
    wheelFrame = 0;
    wheelDelta = 0;
  }

  function queueWheelZoom(deltaY: number, fx: number, fy: number) {
    wheelDelta += deltaY;
    wheelFocus = { x: fx, y: fy };
    if (wheelFrame) return;
    wheelFrame = requestAnimationFrame(() => {
      wheelFrame = 0;
      const d = wheelDelta;
      wheelDelta = 0;
      if (state.isOpen) {
        applyScale(currentScale() * Math.exp(-d * 0.0015), wheelFocus.x, wheelFocus.y);
      }
    });
  }

  function exitZoom() {
    if (tween) cancelAnimationFrame(tween);
    tween = 0;
    cancelWheelZoom();
    clearTimeout(commitTimer);
    gesture.active = false;
    wrapperRect = null;
    state.scale = 0;
    overlay.classList.remove("zoomed", "zooming", "zoom-clip");
    elImage.style.transform = "";
    elImage.style.width = "";
    elWrapper.scrollLeft = 0;
    elWrapper.scrollTop = 0;
    elZoomLevel.textContent = text.fit;
  }

  function install(img: HTMLImageElement, gen: number) {
    commitGesture();
    elImage.src = img.src;
    state.natural = { w: img.naturalWidth, h: img.naturalHeight };
    // Waits for the <img> itself to decode; the off-DOM decode isn't enough
    const reveal = () => {
      if (state.gen === gen) elImage.classList.remove("is-pending");
    };
    elImage.decode().then(reveal, reveal);
  }

  // decode() rejects on some bitmaps an <img> renders, so retry through the element
  function retryThroughImage(src: string, gen: number) {
    elImage.onload = () => {
      elImage.onload = elImage.onerror = null;
      if (state.gen !== gen) return;
      state.natural = { w: elImage.naturalWidth, h: elImage.naturalHeight };
      elImage.classList.remove("is-pending");
    };
    elImage.onerror = () => {
      elImage.onload = elImage.onerror = null;
      if (state.gen !== gen) return;
      elStatus.textContent = text.loadFailedStatus;
      showFailure(src);
    };
    elImage.src = src;
  }

  let elRetry: HTMLButtonElement | null = null;
  let failedSrc = "";
  function showFailure(src: string) {
    failedSrc = src;
    elRetry ??= h("button", {
      type: "button",
      class: "lightbox-retry",
      textContent: text.retry,
      onclick: () => {
        decoded.delete(failedSrc);
        ready.delete(failedSrc);
        if (document.activeElement === elRetry) elClose.focus();
        update();
      },
    });
    elNotice.replaceChildren(text.loadFailed, elRetry);
    elNotice.hidden = false;
  }

  function hideNotice() {
    if (elNotice.contains(document.activeElement)) elClose.focus();
    elNotice.hidden = true;
  }

  function setNavHint() {
    elHintNav.textContent = shortcutsOn() ? text.hintNavLetters : text.hintNav;
  }

  function update() {
    const item = state.items[state.index];
    const gen = ++state.gen;
    const n = state.index + 1;
    const total = state.items.length;

    exitZoom();
    hideNotice();
    elImage.onload = elImage.onerror = null;
    elTitle.textContent = item.title;
    elDetail.textContent = item.detail ?? "";
    elDetail.hidden = !item.detail;
    elImage.alt = item.title;

    const multiple = total > 1;
    elPrev.hidden = elNext.hidden = !multiple;
    // Disabling drops focus to <body>, so read it first
    const hadFocus = document.activeElement;
    elPrev.disabled = state.index === 0;
    elNext.disabled = state.index === total - 1;
    if ((hadFocus === elPrev && elPrev.disabled) || (hadFocus === elNext && elNext.disabled)) {
      elClose.focus();
    }
    elCounter.textContent = multiple ? text.counter(n, total) : "";
    elCounter.hidden = !multiple;
    elHintNav.hidden = !multiple;
    setNavHint();
    elStatus.textContent = text.status(item.title, n, total);

    // Hidden until decoded, so the previous photo never sits under the new caption
    const warm = ready.get(item.src);
    if (warm) install(warm, gen);
    else {
      elImage.classList.add("is-pending");
      state.natural = { w: 0, h: 0 };
      preload(item.src).then(
        (img) => {
          if (state.gen === gen) install(img, gen);
        },
        () => {
          if (state.gen === gen) retryThroughImage(item.src, gen);
        },
      );
    }

    pruneDecoded();
    warmNeighbors();
  }

  function navigate(dir: number) {
    const next = state.index + dir;
    if (next < 0 || next >= state.items.length) return;
    state.index = next;
    update();
  }

  // Undoes only this viewer's inert marks
  const pageInert: HTMLElement[] = [];
  function setPageInert(on: boolean) {
    if (on) {
      for (const el of Array.from(document.body.children)) {
        if (el === overlay || !(el instanceof HTMLElement) || el.inert) continue;
        el.inert = true;
        pageInert.push(el);
      }
      return;
    }
    for (const el of pageInert) el.inert = false;
    pageInert.length = 0;
  }

  function open(items: LightboxItem[], start: number) {
    state.items = items.slice();
    state.index = Math.min(Math.max(0, Math.floor(Number(start) || 0)), state.items.length - 1);
    if (!state.isOpen) {
      const active = document.activeElement;
      state.previousFocus = active instanceof HTMLElement ? active : null;
    }
    state.isOpen = true;
    update();
    overlay.classList.add("active");
    document.body.classList.add("lightbox-open");
    setPageInert(true);
    // Focus lands only once the overlay is visible, two frames after the class flip
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (state.isOpen) elClose.focus();
      })
    );
  }

  function close() {
    if (!state.isOpen) return;
    state.isOpen = false;
    state.gen++;
    exitZoom();
    hideNotice();
    elImage.onload = elImage.onerror = null;
    // Decoded bitmaps must not outlive the dialog
    decoded.clear();
    ready.clear();
    setPageInert(false);
    overlay.classList.remove("active");
    document.body.classList.remove("lightbox-open");
    const back = state.previousFocus;
    state.previousFocus = null;
    if (back?.isConnected) back.focus();
  }

  elClose.addEventListener("click", () => {
    haptic(elClose);
    close();
  }, { signal });
  elPrev.addEventListener("click", () => {
    haptic(elPrev);
    navigate(-1);
  }, { signal });
  elNext.addEventListener("click", () => {
    haptic(elNext);
    navigate(1);
  }, { signal });
  elZoomIn.addEventListener("click", () => stepZoom(1), { signal });
  elZoomOut.addEventListener("click", () => stepZoom(-1), { signal });
  elReset.addEventListener("click", () => animateScale(fitScale()), { signal });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  }, { signal });

  elWrapper.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = wrapperOrigin();
    // Firefox reports wheel deltas in lines or pages, not px
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? elWrapper.clientHeight : 1;
    queueWheelZoom(e.deltaY * unit, e.clientX - rect.left, e.clientY - rect.top);
  }, { signal, passive: false });

  let drag: { x: number; y: number; left: number; top: number } | null = null;
  const touches = new Map<number, { x: number; y: number }>();
  let pinchStart: { dist: number; scale: number } | null = null;
  let pointerMoved = false;
  let pointerStart = { x: 0, y: 0 };
  let touchPinched = false;
  let lastTap = { t: -Infinity, x: 0, y: 0 };
  let lastTouchAt = -Infinity;

  // Touch double-taps come from pointer events; this skips the dblclick some browsers add
  elWrapper.addEventListener("dblclick", (e) => {
    if (e.timeStamp - lastTouchAt < 800) return;
    toggleZoomAt(e.clientX, e.clientY);
  }, { signal });

  elWrapper.addEventListener("pointerdown", (e) => {
    pointerMoved = false;
    pointerStart = { x: e.clientX, y: e.clientY };
    if (e.pointerType === "touch") {
      lastTouchAt = e.timeStamp;
      if (touches.size === 0) touchPinched = false;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        touchPinched = true;
        const [a, b] = Array.from(touches.values());
        pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: currentScale() };
      }
      return;
    }
    if (!state.scale) return;
    commitGesture(); // panning moves scrollLeft, which a live transform gesture has frozen
    drag = { x: e.clientX, y: e.clientY, left: elWrapper.scrollLeft, top: elWrapper.scrollTop };
    elWrapper.classList.add("dragging");
    elWrapper.setPointerCapture(e.pointerId);
  }, { signal });

  elWrapper.addEventListener("pointermove", (e) => {
    // e.buttons filters out plain hover
    if (
      e.buttons &&
      (Math.abs(e.clientX - pointerStart.x) > 4 || Math.abs(e.clientY - pointerStart.y) > 4)
    ) pointerMoved = true;
    if (e.pointerType === "touch") {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && pinchStart) {
        const [a, b] = Array.from(touches.values());
        const rect = wrapperOrigin();
        applyScale(
          pinchStart.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.dist),
          (a.x + b.x) / 2 - rect.left,
          (a.y + b.y) / 2 - rect.top,
        );
      }
      return;
    }
    if (!drag) return;
    elWrapper.scrollLeft = drag.left - (e.clientX - drag.x);
    elWrapper.scrollTop = drag.top - (e.clientY - drag.y);
  }, { signal });

  function endPointer(e: PointerEvent) {
    if (e.pointerType === "touch") {
      touches.delete(e.pointerId);
      if (touches.size < 2) {
        pinchStart = null;
        commitGesture();
      }
      if (e.type === "pointerup" && touches.size === 0 && !touchPinched && !pointerMoved) {
        const near = Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_PX;
        if (e.timeStamp - lastTap.t < DOUBLE_TAP_MS && near) {
          lastTap.t = -Infinity;
          toggleZoomAt(e.clientX, e.clientY);
        } else lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
      }
      return;
    }
    drag = null;
    elWrapper.classList.remove("dragging");
  }
  elWrapper.addEventListener("pointerup", endPointer, { signal });
  elWrapper.addEventListener("pointercancel", endPointer, { signal });

  /* Window capture runs ahead of the app's key handlers, so Escape never closes the panel behind */
  function onKey(e: KeyboardEvent): boolean {
    if (e.key === "Escape") {
      if (state.scale) exitZoom();
      else close();
      return true;
    }

    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    const letters = plain && shortcutsOn();
    if (letters) {
      if (e.key === "+" || e.key === "=") return stepZoom(1), true;
      if (e.key === "-" || e.key === "_") return stepZoom(-1), true;
      if (e.key === "0") return animateScale(fitScale()), true;
    }

    const arrow = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key);
    if (arrow && state.scale) {
      e.preventDefault();
      commitGesture();
      if (e.key === "ArrowLeft") elWrapper.scrollLeft -= PAN_STEP;
      if (e.key === "ArrowRight") elWrapper.scrollLeft += PAN_STEP;
      if (e.key === "ArrowUp") elWrapper.scrollTop -= PAN_STEP;
      if (e.key === "ArrowDown") elWrapper.scrollTop += PAN_STEP;
      return true;
    }

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; // Shift or Caps Lock must not break A/D
    if (key === "ArrowLeft" || (letters && key === "a")) return navigate(-1), true;
    if (key === "ArrowRight" || (letters && key === "d")) return navigate(1), true;

    if (e.key === "Tab") {
      const focusable = getFocusable();
      if (!focusable.length) return true;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!overlay.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return true;
    }
    return false;
  }
  addEventListener("keydown", (e) => {
    if (state.isOpen && onKey(e)) e.stopPropagation();
  }, { signal, capture: true });

  let touchStartX = 0;
  let multiTouch = false;
  overlay.addEventListener("touchstart", (e) => {
    // A pinch that overshoots to fit lands unzoomed; its last finger up must not read as a swipe
    if (e.touches.length > 1) {
      multiTouch = true;
      return;
    }
    touchStartX = e.changedTouches[0].screenX;
  }, { signal, passive: true });

  overlay.addEventListener("touchend", (e) => {
    if (e.touches.length) return;
    const wasMulti = multiTouch;
    multiTouch = false;
    if (wasMulti || state.scale) return;
    const diff = touchStartX - e.changedTouches[0].screenX;
    if (Math.abs(diff) > SWIPE_PX) navigate(diff > 0 ? 1 : -1);
  }, { signal, passive: true });

  overlay.addEventListener("touchcancel", (e) => {
    if (!e.touches.length) multiTouch = false;
  }, { signal, passive: true });

  // Text-size changes resize the frame without a window resize event
  const wrapperObserver = new ResizeObserver(() => {
    wrapperRect = null;
  });
  wrapperObserver.observe(elWrapper);

  // Back-forward cache restores never rerun this, so it must stay alive
  addEventListener("pagehide", (e) => {
    if (e.persisted) return;
    close();
    controller.abort();
    wrapperObserver.disconnect();
    overlay.remove();
    viewer = null;
  }, { signal });

  return { open };
}
