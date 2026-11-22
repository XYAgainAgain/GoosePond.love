import type { ElkNode } from "elkjs/lib/elk-api.js";
import type { Archive, Id } from "../records/types.ts";
import { type Connectors, familyConnectors } from "./connectors.ts";
import { GROUP_GAP, NODE, SLOT } from "./geometry.ts";
import type { Rows } from "./rows.ts";

/* People and connector joints */
export type Positions = Map<string, { x: number; y: number }>;

export interface Generations {
  pos: Positions;
  connectors: Connectors;
}

interface Reply {
  id: number;
  data?: ElkNode;
  error?: unknown;
}

interface Request {
  graph: ElkNode;
  resolve: (g: ElkNode) => void;
  reject: (e: unknown) => void;
}

function elkGraph(rows: Rows): ElkNode {
  const groupRow = (g: string) => rows.row.get(rows.groups.get(g)![0])!;
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.partitioning.activate": "true",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "LONGEST_PATH",
      // Slower than the default Brandes-Köpf, which strands children far from their parents
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.spacing.nodeNode": String(GROUP_GAP),
    },
    children: [...rows.groups].map(([g, members]) => ({
      id: g,
      width: members.length * SLOT,
      height: NODE,
      layoutOptions: { "elk.partitioning.partition": String(groupRow(g)) },
    })),
    // Only loops make edges that don't point down a row
    edges: rows.groupEdges
      .filter(([up, down]) => groupRow(down) > groupRow(up))
      .map(([up, down], i) => ({ id: `edge${i}`, sources: [up], targets: [down] })),
  };
}

let mainElk: Promise<{ layout(g: ElkNode): Promise<ElkNode> }> | undefined;

function layoutOnMain(graph: ElkNode): Promise<ElkNode> {
  mainElk ??= import("elkjs/lib/elk.bundled.js").then((mod) => {
    const ELK = ((mod as { default?: unknown }).default ?? mod) as new () => {
      layout(g: ElkNode): Promise<ElkNode>;
    };
    return new ELK();
  }).catch((e) => {
    mainElk = undefined;
    throw e;
  });
  return mainElk.then((elk) => elk.layout(graph));
}

/* null once the worker can't be used */
let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Request>();

function retire() {
  worker?.terminate();
  worker = null;
  for (const req of pending.values()) layoutOnMain(req.graph).then(req.resolve, req.reject);
  pending.clear();
}

function elkWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./elk.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return worker = null;
  }
  worker.onmessage = (e: MessageEvent<Reply>) => {
    const req = pending.get(e.data.id);
    if (!req) return;
    pending.delete(e.data.id);
    if (e.data.error === undefined && e.data.data) req.resolve(e.data.data);
    else layoutOnMain(req.graph).then(req.resolve, req.reject);
  };
  worker.onerror = retire;
  worker.onmessageerror = retire;
  // Mirrors the ELK constructor
  worker.postMessage({ id: 0, cmd: "register", algorithms: ["layered"] });
  return worker;
}

function runLayout(graph: ElkNode): Promise<ElkNode> {
  const w = elkWorker();
  if (!w) return layoutOnMain(graph);
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { graph, resolve, reject });
    w.postMessage({ id, cmd: "layout", graph });
  });
}

export async function arrangeGenerations(a: Archive, rows: Rows): Promise<Generations> {
  const x = new Map<Id, number>();
  if (rows.groups.size > 0) {
    const laid = await runLayout(elkGraph(rows));
    const groupX = new Map((laid.children ?? []).map((c) => [c.id, c.x ?? 0]));
    for (const [g, members] of rows.groups) {
      const x0 = groupX.get(g) ?? 0;
      members.forEach((m, i) => x.set(m, x0 + (i + 0.5) * SLOT));
    }
  }
  const connectors = familyConnectors(a, rows, x);
  const pos: Positions = new Map();
  for (const [id, px] of x) pos.set(id, { x: px, y: connectors.rowY[rows.row.get(id)!] });
  for (const j of connectors.joints) pos.set(j.id, { x: j.x, y: j.y });
  return { pos, connectors };
}
