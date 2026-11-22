import { COPY } from "../copy.ts";
import { KINDS, type TieFamily, type TieKind } from "../records/kinds.ts";
import type { Archive, Id } from "../records/types.ts";
import { FORK, LANE_BELOW, LANE_STEP, LANE_TOP, NODE, ROW_GAP, SLOT } from "./geometry.ts";
import type { Rows } from "./rows.ts";

/* Each inner list needs at least one person in view for the piece to stay lit */
export type Lit = Id[][];

export interface Joint {
  id: string;
  x: number;
  y: number;
  label?: string;
  family: TieFamily;
  lit: Lit;
  /* Set when the piece draws particular ties */
  ties?: Id[];
  /* Twin ties, which join no parent */
  twins?: Id[];
}

export interface Line {
  id: string;
  source: string;
  target: string;
  kind: TieKind;
  family: TieFamily;
  /* Drop below the source before running sideways; absent draws straight */
  turn?: number;
  lit: Lit;
  ties?: Id[];
  twins?: Id[];
}

export interface Connectors {
  rowY: number[];
  joints: Joint[];
  lines: Line[];
  /* Ties the connectors draw */
  covered: Set<Id>;
}

interface Sibship {
  family: TieFamily;
  kind: TieKind;
  parents: Id[];
  kids: Id[];
  ties: Id[];
}

const TWINS = new Set<TieKind>(["twin", "identical_twin"]);
const BAR_CLEARANCE = 16;
const IDENTICAL_AT = 0.3;
const LABEL_AT = 0.75;

/* Children grouped by the exact set of parents they share through one family of tie */
function sibships(a: Archive, rows: Rows): Sibship[] {
  const byChild = new Map<string, Sibship>();
  for (const t of a.ties) {
    const k = KINDS[t.kind];
    if (!k?.ranks || t.from === t.to || !rows.row.has(t.from) || !rows.row.has(t.to)) continue;
    // Donors and carriers aren't seated with the parents, so each gets a separate line
    const key = k.family === "assisted" ? `${t.to}\nassisted\n${t.from}` : `${t.to}\n${k.family}`;
    const s = byChild.get(key) ??
      { family: k.family, kind: t.kind, parents: [], kids: [t.to], ties: [] };
    if (!s.parents.includes(t.from)) s.parents.push(t.from);
    s.ties.push(t.id);
    byChild.set(key, s);
  }
  const merged = new Map<string, Sibship>();
  for (const s of byChild.values()) {
    const kid = s.kids[0];
    if (rows.row.get(kid)! <= Math.max(...s.parents.map((p) => rows.row.get(p)!))) continue;
    const parents = [...s.parents].sort();
    const key = `${s.family}\n${parents.join("\n")}`;
    const into = merged.get(key);
    if (into) {
      into.kids.push(kid);
      into.ties.push(...s.ties);
    } else merged.set(key, { ...s, parents });
  }
  return [...merged.values()];
}

function birthGroups(kids: Id[], twinTies: [Id, Id][]): Id[][] {
  const root = new Map(kids.map((k) => [k, k]));
  const find = (k: Id): Id => (root.get(k) === k ? k : find(root.get(k)!));
  for (const [x, y] of twinTies) {
    if (root.has(x) && root.has(y)) root.set(find(x), find(y));
  }
  const groups = new Map<Id, Id[]>();
  for (const k of kids) groups.set(find(k), [...(groups.get(find(k)) ?? []), k]);
  return [...groups.values()];
}

/* First-fit by width, so short bars take the lanes nearest their parents */
function laneOf(bars: { gap: number; lo: number; hi: number }[]): number[] {
  const lane = new Array<number>(bars.length);
  const taken = new Map<string, [number, number][]>();
  const order = bars.map((_, i) => i).sort((i, j) =>
    (bars[i].hi - bars[i].lo) - (bars[j].hi - bars[j].lo) || bars[i].lo - bars[j].lo
  );
  for (const i of order) {
    const { gap, lo, hi } = bars[i];
    for (let n = 0;; n++) {
      const key = `${gap}:${n}`;
      const used = taken.get(key) ?? [];
      if (used.every(([l, h]) => hi + BAR_CLEARANCE < l || lo > h + BAR_CLEARANCE)) {
        taken.set(key, [...used, [lo, hi]]);
        lane[i] = n;
        break;
      }
    }
  }
  return lane;
}

/* Also sets the row heights that make room for the lanes */
export function familyConnectors(a: Archive, rows: Rows, x: Map<Id, number>): Connectors {
  const xOf = (id: Id) => x.get(id) ?? 0;
  const rowOf = (id: Id) => rows.row.get(id)!;
  const families = sibships(a, rows);
  const twinTies = a.ties.filter((t) => TWINS.has(t.kind));
  const partnered = new Set(
    a.ties.filter((t) => KINDS[t.kind]?.pairs && !TWINS.has(t.kind))
      .flatMap((t) => [`${t.from}\n${t.to}`, `${t.to}\n${t.from}`]),
  );

  const coupled = (s: Sibship) =>
    s.parents.length === 2 && partnered.has(s.parents.join("\n")) &&
    rowOf(s.parents[0]) === rowOf(s.parents[1]) &&
    Math.abs(xOf(s.parents[0]) - xOf(s.parents[1])) <= SLOT + 1;
  const stems = families.map((s) =>
    s.parents.reduce((sum, p) => sum + xOf(p), 0) / s.parents.length
  );
  const gaps = families.map((s) => Math.max(...s.parents.map(rowOf)));
  const lanes = laneOf(families.map((s, i) => {
    const xs = [stems[i], ...s.kids.map(xOf), ...(coupled(s) ? [] : s.parents.map(xOf))];
    return { gap: gaps[i], lo: Math.min(...xs), hi: Math.max(...xs) };
  }));

  const deepest = Math.max(0, ...rows.row.values());
  const busiest = new Array<number>(deepest + 1).fill(-1);
  gaps.forEach((g, i) => (busiest[g] = Math.max(busiest[g], lanes[i])));
  const rowY = [0];
  for (let r = 0; r < deepest; r++) {
    const room = busiest[r] < 0 ? 0 : LANE_TOP + busiest[r] * LANE_STEP + LANE_BELOW;
    rowY.push(rowY[r] + Math.max(ROW_GAP, room));
  }
  const yOf = (id: Id) => rowY[rowOf(id)];

  // Connector ids share the graph with record ids, which a family file may set to anything
  const ids = [...a.people.map((p) => p.id), ...a.ties.map((t) => t.id)];
  let tag = "bus:";
  while (ids.some((id) => id.startsWith(tag))) tag = `_${tag}`;

  const joints: Joint[] = [];
  const lines: Line[] = [];
  const covered = new Set<Id>();
  families.forEach((s, i) => {
    const { family, kind, parents } = s;
    const top = rowY[gaps[i]];
    const bar = top + LANE_TOP + lanes[i] * LANE_STEP;
    // One parent, or a couple seated side by side, shares a stem; others each drop to the bar
    const stem = parents.length === 1 || coupled(s);
    const u = `${tag}${i}`;
    // Cytoscape 3.35 reroutes a taxi line whose turn is 0, so a stemless joint sits 1 above the bar
    const uy = stem ? top : bar - 1;
    const turn = bar - uy;
    const drawn = s.ties;
    joints.push({ id: u, x: stems[i], y: uy, family, lit: [parents, s.kids], ties: drawn });
    s.ties.forEach((t) => covered.add(t));
    if (!stem) {
      for (const p of parents) {
        const up = `${u}:from:${p}`;
        lines.push({
          id: up,
          source: p,
          target: u,
          kind,
          family,
          turn: uy - yOf(p),
          lit: [[p], s.kids],
          ties: drawn,
        });
      }
    }

    const groups = birthGroups(s.kids, twinTies.map((t) => [t.from, t.to]));
    groups.forEach((g, gi) => {
      if (g.length === 1) {
        lines.push({
          id: `${u}:to:${g[0]}`,
          source: u,
          target: g[0],
          kind,
          family,
          turn,
          lit: [[g[0]], parents],
          ties: drawn,
        });
        return;
      }
      const t = `${u}:twins${gi}`;
      const tx = g.reduce((sum, m) => sum + xOf(m), 0) / g.length;
      const ty = bar + FORK;
      const reach = (m: Id, f: number) => ({
        x: tx + f * (xOf(m) - tx),
        y: ty + f * (yOf(m) - ty),
      });
      const paired = twinTies.filter((tie) => g.includes(tie.from) && g.includes(tie.to));
      const twinsOf = (m: Id) =>
        paired.filter((tie) => tie.from === m || tie.to === m).map((tie) => tie.id);
      joints.push({ id: t, x: tx, y: ty, family, lit: [g, parents], ties: drawn });
      lines.push({
        id: `${t}:in`,
        source: u,
        target: t,
        kind,
        family,
        turn,
        lit: [g, parents],
        ties: drawn,
      });
      for (const m of g) {
        lines.push({
          id: `${t}:${m}`,
          source: t,
          target: m,
          kind,
          family,
          lit: [[m], parents],
          ties: drawn,
          twins: twinsOf(m),
        });
      }
      const kidTop = Math.min(...g.map((m) => yOf(m) - NODE / 2));
      const ly = ty + LABEL_AT * (kidTop - ty);
      // An odd count's center leg runs straight down, so the label takes the gap beside it
      const legs = g.map((m) => tx + ((ly - ty) / (yOf(m) - ty)) * (xOf(m) - tx)).sort((a, b) =>
        a - b
      );
      const mid = Math.ceil(legs.length / 2);
      joints.push({
        id: `${t}:label`,
        x: (legs[mid - 1] + legs[mid]) / 2,
        y: ly,
        label: COPY.map.bornTogether(g.length),
        family: "lineage",
        lit: [g],
        twins: paired.map((tie) => tie.id),
      });
      for (const tie of twinTies) {
        if (!g.includes(tie.from) || !g.includes(tie.to)) continue;
        covered.add(tie.id);
        if (tie.kind !== "identical_twin") continue;
        const ends = [tie.from, tie.to].map((m, n) => ({
          id: `${t}:${tie.id}:${n}`,
          ...reach(m, IDENTICAL_AT),
        }));
        for (const e of ends) {
          joints.push({ ...e, family: "lineage", lit: [[tie.from], [tie.to]], ties: [tie.id] });
        }
        lines.push({
          id: `${t}:${tie.id}`,
          source: ends[0].id,
          target: ends[1].id,
          kind: tie.kind,
          family: "lineage",
          lit: [[tie.from], [tie.to]],
          ties: [tie.id],
        });
      }
    });
  });
  return { rowY, joints, lines, covered };
}
