import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import type { Lit } from "../arrange/connectors.ts";
import { arrangeGenerations } from "../arrange/generations.ts";
import { NODE, SLOT } from "../arrange/geometry.ts";
import { type Ring, ringSpots } from "../arrange/rings.ts";
import { descentRows, type Rows } from "../arrange/rows.ts";
import type { TieFamily } from "../records/kinds.ts";
import { type Index, indexArchive, neighborhood, type Reach, reachOf } from "../records/queries.ts";
import type { Archive, Id } from "../records/types.ts";
import { type Band, branchRegions, type Region, rowBands } from "./bands.ts";
import { connectorElements, toElements } from "./elements.ts";
import { type LabelText, type MapColors, mapStyle } from "./style.ts";
import { createMinimap, type Minimap } from "./minimap.ts";
import { createUnderlay, type Underlay } from "./underlay.ts";

cytoscape.use(fcose);

export type ViewName = "network" | "generations";

export interface Movement {
  /* ms per frame */
  median: number;
  p95: number;
  worst: number;
}

export interface MapView {
  load(
    a: Archive,
    opts: {
      portraits: boolean;
      webgl: boolean;
      light: boolean;
      colors: MapColors;
      text: LabelText;
    },
  ): void;
  restyle(colors: MapColors, text: LabelText): void;
  /* Swaps in an edited family without a rebuild, holding `anchor` still on screen */
  update(a: Archive, anchor: Id | null): Promise<void>;
  /* `fresh` recomputes the arrangement; without it the last one for that view is reused */
  show(view: ViewName, fresh?: boolean): Promise<{ ms: number }>;
  setHidden(families: ReadonlySet<TieFamily>): void;
  /* null clears; returns how many people stay lit */
  focus(id: Id | null, reach?: Reach): number;
  /* Overrides any focus; null clears; `frame` glides to fit the chain */
  trace(steps: TraceStep[] | null, frame?: boolean): void;
  select(id: Id | null): void;
  centerOn(id: Id): void;
  mark(ids: ReadonlySet<Id>): void;
  fit(): void;
  onSelect(cb: (id: Id | null) => void): void;
  /* A long press; `at` is rendered px within the map */
  onHold(cb: (id: Id, at: { x: number; y: number }) => void): void;
  reveal(id: Id): void;
  /* px of each edge a panel or notice covers; framing and nudges keep clear of them */
  setEdges(edges: Edges): void;
  measureMovement(): Promise<Movement>;
  picture(whole: boolean): Promise<Blob | undefined>;
  looped(): boolean;
  usingWebgl(): boolean;
  destroy(): void;
}

export interface Edges {
  top: number;
  right: number;
  bottom: number;
}

export interface TraceStep {
  tie: Id;
  a: Id;
  b: Id;
}

type Spots = Map<string, { x: number; y: number }>;
type Guide = { center: Id; rings: Ring[] };
type Camera = "frame" | { hold: Id | null; show: Id[] };

const ANIMATE_UP_TO = 400;
const READABLE = 0.8; // labels hide below min-zoomed-font-size ÷ font-size (style.ts)
const GLIDE = { duration: 450, easing: "ease-in-out-cubic" } as const;
/* Below this zoom, labels show first names only */
const BRIEF_BELOW = 1.05;
/* Model px a label reaches past its node: half its width sideways, two lines below */
const LABEL_SIDE = 50;
/* px: the least width or height framing uses, however much is covered */
const MIN_SEEN = 160;
const LABEL_BELOW = 34;

function hasWebgl2(): boolean {
  return !!document.createElement("canvas").getContext("webgl2");
}

function still(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const people = (graph: cytoscape.Core) => graph.nodes().not(".bus") as cytoscape.NodeCollection;
const ties = (graph: cytoscape.Core) => graph.edges().not(".bus") as cytoscape.EdgeCollection;
const lights = (needs: Lit, near: ReadonlySet<Id>) =>
  needs.every((any) => any.some((id) => near.has(id)));

function snapshot(graph: cytoscape.Core): Spots {
  const spots: Spots = new Map();
  people(graph).forEach((n) => {
    spots.set(n.id(), { ...n.position() });
  });
  return spots;
}

/* fcose runs synchronously here, so no one is ever drawn at a `seed` spot */
async function network(
  graph: cytoscape.Core,
  stale: () => boolean,
  randomize = true,
  seed?: Spots,
): Promise<Spots> {
  await new Promise((frame) => requestAnimationFrame(frame));
  if (graph.destroyed() || stale()) return new Map();
  return new Promise((resolve) => {
    const before = snapshot(graph);
    if (seed) people(graph).positions((n) => seed.get(n.id()) ?? n.position());
    const layout = people(graph).union(ties(graph)).layout({
      name: "fcose",
      // fcose refines existing positions only at "proof" quality
      quality: !randomize ? "proof" : people(graph).length > 600 ? "draft" : "default",
      randomize,
      animate: false,
      fit: false,
      packComponents: false,
      // Shire: label collisions 163 → about 10, for a quarter less zoom
      nodeDimensionsIncludeLabels: true,
      nodeRepulsion: 15000,
      idealEdgeLength: 110,
      nodeSeparation: 100,
    } as cytoscape.LayoutOptions);
    layout.one("layoutstop", () => {
      const after = snapshot(graph);
      people(graph).positions((n) => before.get(n.id())!);
      resolve(after);
    });
    layout.run();
  });
}

function arcSameRowTies(graph: cytoscape.Core) {
  graph.batch(() => {
    ties(graph).forEach((e) => {
      const a = e.source().position(), b = e.target().position();
      const dx = b.x - a.x;
      if (a.y === b.y && Math.abs(dx) > SLOT * 1.5) {
        e.data("arc", Math.sign(dx) * -Math.min(150, 36 + Math.abs(dx) * 0.08));
      }
    });
  });
}

export function createMap(container: HTMLElement): MapView {
  let cy: cytoscape.Core | undefined;
  let ix: Index | undefined;
  let rows: Rows | undefined;
  let hidden: ReadonlySet<TieFamily> = new Set();
  let onSelect: (id: Id | null) => void = () => {};
  let onHold: (id: Id, at: { x: number; y: number }) => void = () => {};
  let placed = false;
  let webgl = false;
  let run = 0;
  let placing: cytoscape.Layouts | undefined;
  let covered: ReadonlySet<Id> = new Set();
  let focused: { id: Id | null; reach: Reach } = { id: null, reach: 1 };
  let traced: TraceStep[] | null = null;
  /* null shows the free network layout */
  let ringed: Id | null = null;
  /* Survives edits that clear `saved` */
  let lastFree: Spots | undefined;
  let edges: Edges = { top: 0, right: 0, bottom: 0 };
  /* Run of a show() or update() still computing; it applies `ringed` when it places */
  let working: number | null = null;
  const saved = new Map<ViewName, Spots>();
  let size = "";
  let portraits = true;
  let brief: boolean | undefined;
  let underlay: Underlay | undefined;
  let minimap: Minimap | undefined;
  let layered: { bands: Band[]; regions: Region[] } = { bands: [], regions: [] };
  let shown: ViewName | undefined;
  const resize = new ResizeObserver(([entry]) => {
    const next = `${entry.contentRect.width}x${entry.contentRect.height}`;
    if (next === size) return;
    size = next;
    cy?.resize();
  });
  resize.observe(container);

  const moves = (graph: cytoscape.Core) =>
    placed && !still() && people(graph).length <= ANIMATE_UP_TO;

  function applyHidden() {
    cy?.batch(() => {
      cy!.elements().removeClass("off");
      cy!.elements().filter((e) => hidden.has(e.data("family"))).addClass("off");
    });
  }

  function applyFocus(graph: cytoscape.Core): number {
    graph.elements().removeClass("dim trail");
    if (traced) return applyTrace(graph, traced);
    if (!ix || focused.id === null) return people(graph).length;
    const near = reachOf(ix, focused.id, focused.reach);
    graph.batch(() => {
      people(graph).filter((n) => !near.has(n.id())).addClass("dim");
      ties(graph)
        .filter((e) => !(near.has(e.source().id()) && near.has(e.target().id())))
        .addClass("dim");
      graph.elements(".bus").filter((e) => !lights(e.data("lit"), near)).addClass("dim");
    });
    return near.size;
  }

  function applyTrace(graph: cytoscape.Core, steps: TraceStep[]): number {
    const on = new Set(steps.flatMap((s) => [s.a, s.b]));
    const via = new Set(steps.map((s) => s.tie));
    const pairs = steps.map((s) => ({ tie: s.tie, ends: new Set([s.a, s.b]) }));
    const shows = (e: cytoscape.SingularElementReturnValue) => {
      const drawn = e.data("ties") as Id[] | undefined;
      const twins = e.data("twins") as Id[] | undefined;
      return pairs.some((p) =>
        twins?.includes(p.tie) ||
        // A piece standing only for twin ties lights for those alone
        (!(twins && !drawn) && lights(e.data("lit"), p.ends) && (!drawn || drawn.includes(p.tie)))
      );
    };
    graph.batch(() => {
      people(graph).forEach((n) => {
        n.addClass(on.has(n.id()) ? "trail" : "dim");
      });
      ties(graph).forEach((e) => {
        e.addClass(via.has(e.id()) ? "trail" : "dim");
      });
      graph.elements(".bus").forEach((e) => {
        e.addClass(shows(e) ? "trail" : "dim");
      });
    });
    return on.size;
  }

  function frameOn(graph: cytoscape.Core, ids: Iterable<Id>, cap = 1.2) {
    if (graph.destroyed()) return;
    const points = [...ids].flatMap((id) => {
      const n = graph.$id(id);
      return n.nonempty() ? [{ ...n.position() }] : [];
    });
    if (points.length === 0) return;
    const b = bounds(points);
    const fits = Math.min(
      cap,
      (open(graph).w - 80) / (b.x2 - b.x1),
      (open(graph).h - 80) / (b.y2 - b.y1),
    );
    const to = centered(graph, (b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, fits);
    graph.stop(true, false);
    if (still()) graph.viewport(to);
    else graph.animate(to, GLIDE);
  }

  function dress(graph: cytoscape.Core, view: ViewName) {
    underlay?.hide();
    graph.batch(() => {
      graph.elements(".bus").addClass("away");
      ties(graph).removeClass("away taxi").toggleClass("calm", view === "network");
    });
  }

  function settleGenerations(graph: cytoscape.Core) {
    arcSameRowTies(graph);
    underlay?.show(layered.bands, layered.regions);
    graph.batch(() => {
      graph.elements(".bus").removeClass("away");
      for (const e of ties(graph)) {
        if (covered.has(e.id())) e.addClass("away");
        else if (e.source().position("y") !== e.target().position("y")) e.addClass("taxi");
      }
    });
  }

  function bounds(points: { x: number; y: number }[]) {
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const half = NODE / 2;
    return {
      x1: Math.min(...xs) - half - LABEL_SIDE,
      x2: Math.max(...xs) + half + LABEL_SIDE,
      y1: Math.min(...ys) - half,
      y2: Math.max(...ys) + half + LABEL_BELOW,
    };
  }

  /* Uncovered rendered px from the left edge, never under MIN_SEEN */
  function open(graph: cytoscape.Core) {
    const width = graph.width(), height = graph.height();
    const w = Math.max(width - edges.right, Math.min(width, MIN_SEEN));
    const h = Math.max(height - edges.top - edges.bottom, Math.min(height, MIN_SEEN));
    return { top: Math.min(edges.top, height - h), w, h };
  }

  function centered(graph: cytoscape.Core, x: number, y: number, zoom: number) {
    const z = Math.min(graph.maxZoom(), Math.max(graph.minZoom(), zoom));
    const a = open(graph);
    return { zoom: z, pan: { x: a.w / 2 - x * z, y: a.top + a.h / 2 - y * z } };
  }

  /* Computed before anyone moves, so the camera glides with them */
  function framing(graph: cytoscape.Core, view: ViewName, spots: Spots) {
    const live = [...spots.entries()].filter(([id]) => graph.$id(id).nonempty());
    if (live.length === 0) return undefined;
    const b = bounds(live.map(([, p]) => p));
    const { w, h } = open(graph);
    if (view === "network") {
      const zoom = Math.min((w - 80) / (b.x2 - b.x1), (h - 80) / (b.y2 - b.y1));
      return centered(graph, (b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, zoom);
    }
    const allRows = h / (b.y2 - b.y1 + 160);
    const zoom = Math.min(1.1, Math.max(READABLE, allRows));
    const chosen = graph.nodes(":selected");
    const pick = chosen.nonempty() ? spots.get(chosen.first().id()) : undefined;
    const x = pick?.x ?? (b.x1 + b.x2) / 2;
    const y = pick && allRows < READABLE ? pick.y : (b.y1 + b.y2) / 2;
    return centered(graph, x, y, zoom);
  }

  /* Keeps `hold` still on screen, backing out only if someone in `show` would land offscreen */
  function holding(graph: cytoscape.Core, spots: Spots, hold: Id | null, show: Id[]) {
    const zoom = graph.zoom();
    let pan = graph.pan();
    const node = hold ? graph.$id(hold) : undefined;
    const to = hold ? spots.get(hold) : undefined;
    if (node?.nonempty() && to) {
      const from = node.position();
      pan = { x: pan.x + (from.x - to.x) * zoom, y: pan.y + (from.y - to.y) * zoom };
    }
    const fresh = show.flatMap((id) => spots.get(id) ?? []);
    if (fresh.length === 0) return { zoom, pan };
    const { top, w, h } = open(graph);
    const n = bounds(fresh);
    const inside = n.x1 * zoom + pan.x >= 0 && n.x2 * zoom + pan.x <= w &&
      n.y1 * zoom + pan.y >= top && n.y2 * zoom + pan.y <= top + h;
    if (inside) return { zoom, pan };
    const b = bounds([...fresh, ...(to ? [to] : [])]);
    const fits = Math.min(zoom, (w - 80) / (b.x2 - b.x1), (h - 80) / (b.y2 - b.y1));
    return centered(graph, (b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, fits);
  }

  /* Framing mid-glide catches people where they're leaving. Cytoscape 3.35 also fires
     `layoutstop` for a halted placement, so this rechecks for a replacement */
  function afterPlacing(run: () => void) {
    if (!placing) return run();
    placing.one("layoutstop", () => setTimeout(() => afterPlacing(run)));
  }

  function frameFamily(id: Id) {
    if (!cy || !ix) return;
    const graph = cy;
    const near = neighborhood(ix, id, 1);
    afterPlacing(() => frameOn(graph, near, 2));
  }

  function networkSpots(graph: cytoscape.Core, free: Spots): { spots: Spots; guide?: Guide } {
    if (!ringed || !ix?.person(ringed)) return { spots: free };
    const node = graph.$id(ringed);
    const center = node.nonempty() ? { ...node.position() } : free.get(ringed);
    if (!center) return { spots: free };
    const { spots, rings } = ringSpots(ix, ringed, center, free);
    return { spots, guide: { center: ringed, rings } };
  }

  function ringAround(id: Id | null) {
    if (id === ringed) return;
    const was = ringed;
    ringed = id;
    const free = saved.get("network");
    if (!cy || shown !== "network" || working !== null || !free) return;
    const mine = ++run;
    halt();
    const { spots, guide } = networkSpots(cy, free);
    void place(cy, spots, "network", mine, { hold: id ?? was, show: [] }, guide);
  }

  function light(graph: cytoscape.Core) {
    graph.elements().removeClass("lit hush");
    const chosen = graph.nodes(":selected");
    if (chosen.empty()) return;
    const id = chosen.first().id();
    chosen.connectedEdges().addClass("lit");
    graph.elements(".bus").forEach((e) => {
      const mine = (e.data("lit") as Lit | undefined)?.some((list) => list.includes(id));
      e.addClass(mine ? "lit" : "hush");
    });
  }

  function briefen(graph: cytoscape.Core, force = false) {
    const next = graph.zoom() < BRIEF_BELOW;
    if (next === brief && !force) return;
    brief = next;
    people(graph).toggleClass("brief", next);
  }

  function halt() {
    placing?.stop();
    placing = undefined;
    cy?.stop(true, false);
  }

  function place(
    graph: cytoscape.Core,
    spots: Spots,
    view: ViewName,
    mine: number,
    camera: Camera,
    guide?: Guide,
  ): Promise<void> {
    const animate = moves(graph);
    placed = true;
    graph.resize();
    const target = camera === "frame"
      ? framing(graph, view, spots)
      : holding(graph, spots, camera.hold, camera.show);
    ties(graph).removeData("arc");
    dress(graph, view);
    if (guide) underlay?.ring(guide.center, guide.rings);
    return new Promise((resolve) => {
      const layout = graph.layout({
        name: "preset",
        positions: (n: cytoscape.NodeSingular) => spots.get(n.id()) ?? n.position(),
        fit: false,
        animate,
        animationDuration: GLIDE.duration,
        animationEasing: GLIDE.easing,
      } as cytoscape.LayoutOptions);
      layout.one("layoutstop", () => {
        if (mine === run && !graph.destroyed()) {
          placing = undefined;
          if (view === "generations") settleGenerations(graph);
        }
        resolve();
      });
      placing = layout;
      layout.run();
      if (!target) return;
      if (animate) graph.animate(target, GLIDE);
      else graph.viewport(target);
    });
  }

  async function connect(graph: cytoscape.Core, mine: number): Promise<Spots | undefined> {
    const laid = await arrangeGenerations(ix!.archive, rows!);
    if (mine !== run || graph.destroyed()) return undefined;
    graph.remove(".bus");
    graph.add(connectorElements(laid.connectors));
    covered = laid.connectors.covered;
    const x = new Map([...laid.pos].map(([id, p]) => [id, p.x]));
    layered = {
      bands: rowBands(ix!, rows!, laid.connectors.rowY),
      regions: branchRegions(ix!, rows!, x),
    };
    applyHidden();
    applyFocus(graph);
    light(graph);
    return laid.pos;
  }

  return {
    load(a, opts) {
      portraits = opts.portraits;
      run++;
      halt();
      underlay?.destroy();
      minimap?.destroy();
      cy?.destroy();
      saved.clear();
      layered = { bands: [], regions: [] };
      container.classList.add("waiting");
      covered = new Set();
      focused = { id: null, reach: 1 };
      traced = null;
      ringed = null;
      lastFree = undefined;
      working = null;
      placed = false;
      ix = indexArchive(a);
      rows = descentRows(a);
      webgl = opts.webgl && hasWebgl2();
      // Tablets default to 2–3×; full density measured 58.5 ms a frame there
      const dpr = globalThis.devicePixelRatio || 1;
      const ratio = opts.light ? Math.min(dpr, 1.5) : dpr;
      const options: cytoscape.CytoscapeOptions & { renderer: { name: string; webgl: boolean } } = {
        container,
        elements: toElements(ix, rows, portraits),
        style: mapStyle(opts.colors, opts.text),
        layout: { name: "null" },
        minZoom: 0.03,
        maxZoom: 4,
        boxSelectionEnabled: false,
        selectionType: "single",
        autoungrabify: true,
        renderer: { name: "canvas", webgl },
        pixelRatio: ratio,
      };
      cy = cytoscape(options);
      underlay = createUnderlay(cy, container, ratio);
      minimap = createMinimap(cy, container);
      cy.on("tap", "node", (e) => {
        const node = e.target as cytoscape.NodeSingular;
        if (!node.hasClass("bus")) onSelect(node.id());
      });
      cy.on("tap", (e) => {
        if (e.target === cy) onSelect(null);
      });
      brief = undefined;
      cy.on("zoom", () => briefen(cy!));
      briefen(cy);
      cy.on("taphold", "node", (e) => {
        const node = e.target as cytoscape.NodeSingular;
        if (!node.hasClass("bus")) onHold(node.id(), { ...e.renderedPosition! });
      });
      cy.on("dbltap", "node", (e) => {
        const node = e.target as cytoscape.NodeSingular;
        if (!node.hasClass("bus") && ix) frameFamily(node.id());
      });
      applyHidden();
    },

    async show(view, fresh = false) {
      if (!cy || !rows || !ix) return { ms: 0 };
      const graph = cy;
      const mine = ++run;
      halt();
      const t0 = performance.now();
      shown = view;
      working = mine;
      try {
        let spots = fresh ? undefined : saved.get(view);
        if (!spots) {
          if (view === "network") {
            dress(graph, view);
            spots = await network(graph, () => mine !== run);
          } else spots = await connect(graph, mine);
          if (!spots || mine !== run || graph.destroyed()) return { ms: 0 };
          saved.set(view, spots);
          if (view === "network") lastFree = spots;
        }
        const ms = performance.now() - t0;
        working = null;
        const ring = view === "network" && placed && ringed !== null;
        const to = view === "network" ? networkSpots(graph, spots) : { spots };
        await place(
          graph,
          to.spots,
          view,
          mine,
          ring ? { hold: ringed, show: [] } : "frame",
          to.guide,
        );
        return { ms };
      } finally {
        if (working === mine) working = null;
        if (mine === run) container.classList.remove("waiting");
      }
    },

    restyle(colors, text) {
      cy?.style(mapStyle(colors, text));
      underlay?.restyle();
      minimap?.restyle();
    },

    async update(a, anchor) {
      if (!cy || !shown) return;
      const graph = cy, view = shown;
      const mine = ++run;
      halt();
      working = mine;
      // The old connectors may draw ties this edit removed
      graph.elements(".bus").addClass("away");
      ix = indexArchive(a);
      rows = descentRows(a);
      const next = toElements(ix, rows, portraits);
      const ids = new Set(next.map((d) => d.data.id!));
      const near = (id: Id) => {
        for (const t of ix!.tiesOf(id)) {
          const kin = graph.$id(t.from === id ? t.to : t.from);
          if (kin.nonempty() && kin.isNode()) return { ...kin.position() };
        }
        const e = graph.extent();
        return { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 };
      };
      const joined: Id[] = [];
      graph.batch(() => {
        people(graph).union(ties(graph)).filter((e) => !ids.has(e.id())).remove();
        const added: cytoscape.ElementDefinition[] = [];
        for (const def of next) {
          const { id, source, target, ...rest } = def.data;
          const ele = graph.$id(id!);
          const moved = ele.nonempty() && ele.isEdge() &&
            (ele.data("source") !== source || ele.data("target") !== target);
          if (ele.nonempty() && !moved) {
            for (const key of Object.keys(ele.data())) {
              if (!(key in def.data)) ele.removeData(key);
            }
            ele.data(rest);
            continue;
          }
          if (moved) ele.remove();
          if (source === undefined) {
            joined.push(id!);
            added.push({ ...def, position: near(id!) });
          } else added.push(def);
        }
        graph.add(added);
      });
      briefen(graph, true);
      saved.clear();
      applyHidden();
      // Refines from the free layout: people may stand in rings or mid-glide
      const seed = view === "network" && lastFree ? new Map(lastFree) : undefined;
      for (const id of seed ? joined : []) {
        const kin = ix.tiesOf(id).map((t) => t.from === id ? t.to : t.from).find((k) =>
          seed!.has(k)
        );
        if (kin) seed!.set(id, { ...seed!.get(kin)! });
      }
      const spots = view === "network"
        ? await network(graph, () => mine !== run, false, seed)
        : await connect(graph, mine);
      if (working === mine) working = null;
      if (!spots || mine !== run || graph.destroyed()) return;
      saved.set(view, spots);
      if (view === "network") lastFree = spots;
      const to = view === "network" ? networkSpots(graph, spots) : { spots };
      // An edit can land before the first placement
      const camera: Camera = placed ? { hold: anchor, show: joined } : "frame";
      await place(graph, to.spots, view, mine, camera, to.guide);
      if (mine === run) container.classList.remove("waiting");
    },

    setHidden(families) {
      hidden = families;
      applyHidden();
    },

    focus(id, reach = 1) {
      focused = { id, reach };
      return cy ? applyFocus(cy) : 0;
    },

    trace(steps, frame = false) {
      traced = steps?.length ? steps : null;
      if (!cy) return;
      const graph = cy;
      applyFocus(graph);
      if (!frame || !traced) return;
      const chain = traced, ids = traced.flatMap((s) => [s.a, s.b]);
      afterPlacing(() => {
        if (traced === chain) frameOn(graph, ids);
      });
    },

    select(id) {
      if (!cy) return;
      const graph = cy;
      graph.batch(() => {
        graph.elements().unselect();
        if (id !== null) graph.$id(id).select();
        light(graph);
      });
      // Cytoscape 3.35 keeps label bounds from before a pending style, clipping the `:selected` full
      // name; reading the style applies it before reveal() measures
      if (id !== null) graph.$id(id).style("label");
      ringAround(id);
    },

    reveal(id) {
      if (!cy) return;
      const node = cy.$id(id);
      if (node.empty()) return;
      cy.resize();
      const box = node.renderedBoundingBox({ includeLabels: true });
      const m = 24, { top, w, h } = open(cy);
      const dx = box.x1 < m ? m - box.x1 : box.x2 > w - m ? w - m - box.x2 : 0;
      const up = top + m, down = top + h - m;
      const dy = box.y1 < up ? up - box.y1 : box.y2 > down ? down - box.y2 : 0;
      if (!dx && !dy) return;
      const pan = cy.pan(), to = { x: pan.x + dx, y: pan.y + dy };
      cy.stop(true, false);
      if (still()) cy.pan(to);
      else cy.animate({ pan: to }, { duration: 250, easing: "ease-out-cubic" });
    },

    onHold(cb) {
      onHold = cb;
    },

    setEdges(next) {
      edges = next;
    },

    centerOn(id) {
      if (!cy) return;
      const node = cy.$id(id);
      if (node.empty()) return;
      cy.resize(); // ResizeObserver reports a panel opened this task too late
      cy.stop(true, false);
      const p = node.position();
      const to = centered(cy, p.x, p.y, Math.max(cy.zoom(), READABLE));
      if (still()) cy.viewport(to);
      else cy.animate(to, { duration: 350 });
    },

    mark(ids) {
      cy?.batch(() => {
        cy!.nodes().removeClass("marked");
        cy!.nodes().filter((n) => ids.has(n.id())).addClass("marked");
      });
    },

    fit() {
      cy?.fit(undefined, 40);
    },

    onSelect(cb) {
      onSelect = cb;
    },

    measureMovement() {
      return new Promise((resolve) => {
        if (!cy) return resolve({ median: 0, p95: 0, worst: 0 });
        const graph = cy;
        const mid = { x: graph.width() / 2, y: graph.height() / 2 };
        graph.zoom(0.9);
        graph.center();
        const frames: number[] = [];
        const t0 = performance.now();
        let prev = t0;
        let i = 0;
        const step = (now: number) => {
          frames.push(now - prev);
          prev = now;
          i++;
          if (!graph.destroyed() && now - t0 < 3000) {
            graph.panBy({ x: Math.sin(i / 15) * 14, y: Math.cos(i / 11) * 9 });
            graph.zoom({ level: 0.9 + Math.sin(i / 30) * 0.35, renderedPosition: mid });
            requestAnimationFrame(step);
            return;
          }
          frames.shift();
          frames.sort((a, b) => a - b);
          const at = (q: number) =>
            frames[Math.min(frames.length - 1, Math.floor(frames.length * q))] ?? 0;
          resolve({ median: at(0.5), p95: at(0.95), worst: at(1) });
        };
        requestAnimationFrame(step);
      });
    },

    async picture(whole) {
      if (!cy) return undefined;
      const bg = getComputedStyle(container).getPropertyValue("--bg").trim() || undefined;
      return await cy.png({
        output: "blob-promise",
        bg,
        full: whole,
        // px caps: the renderer's pixel ratio multiplies `scale`
        ...(whole ? { maxWidth: 4000, maxHeight: 4000 } : {
          maxWidth: Math.min(4000, cy.width() * 2),
          maxHeight: Math.min(4000, cy.height() * 2),
        }),
      });
    },

    looped: () => rows?.looped ?? false,
    usingWebgl: () => webgl,

    destroy() {
      run++;
      halt();
      resize.disconnect();
      underlay?.destroy();
      minimap?.destroy();
      cy?.destroy();
      cy = undefined;
    },
  };
}
