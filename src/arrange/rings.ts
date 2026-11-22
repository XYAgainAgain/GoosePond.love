import { KINDS } from "../records/kinds.ts";
import type { Index } from "../records/queries.ts";
import type { Id } from "../records/types.ts";

export interface Point {
  x: number;
  y: number;
}

export interface Ring {
  radius: number;
  /* Ties from the center; null for the ring of people with no chain to it */
  away: number | null;
}

/* Model px: arc between ring neighbors, and the least step between rings (a face and its label) */
const SPACING = 100;
const RING_GAP = 130;
const TURN = Math.PI * 2;

/* Ring 1 sits by direction: parents above, children below, partners right, everyone else left */
function aim(ix: Index, root: Id, other: Id): number {
  let best: number | undefined;
  for (const t of ix.tiesOf(root)) {
    if ((t.from === root ? t.to : t.from) !== other) continue;
    const kind = KINDS[t.kind];
    const angle = kind?.ranks
      ? (t.to === root ? -Math.PI / 2 : Math.PI / 2)
      : kind?.family === "partnership"
      ? 0
      : Math.PI;
    // Of several ties to the same person, the one that ranks wins
    if (best === undefined || kind?.ranks) best = angle;
  }
  return best ?? Math.PI;
}

/* Keeps the given order, turned to sit closest to `want` */
function spread(ids: Id[], want: Map<Id, number>): Map<Id, number> {
  const n = ids.length;
  let sin = 0, cos = 0;
  ids.forEach((id, i) => {
    const off = want.get(id)! - (i / n) * TURN;
    sin += Math.sin(off);
    cos += Math.cos(off);
  });
  const phase = sin || cos ? Math.atan2(sin, cos) : 0;
  return new Map(ids.map((id, i) => [id, phase + (i / n) * TURN]));
}

/* Ring k is neighborhood k less k − 1, unconnected last; `free` order keeps the network shape */
export function ringSpots(
  ix: Index,
  root: Id,
  center: Point,
  free: ReadonlyMap<Id, Point>,
): { spots: Map<Id, Point>; rings: Ring[] } {
  const people = ix.archive.people.map((p) => p.id);
  const spots = new Map<Id, Point>([[root, { ...center }]]);
  const placed: Ring[] = [];
  if (!ix.person(root)) return { spots, rings: placed };
  const from = free.get(root);
  const freeAngle = (id: Id) => {
    const p = free.get(id);
    return from && p ? Math.atan2(p.y - from.y, p.x - from.x) : 0;
  };

  const rings: Id[][] = [];
  const angle = new Map<Id, number>([[root, 0]]);
  const via = new Map<Id, Id>();
  const seen = new Set<Id>([root]);
  for (let edge = [root]; edge.length;) {
    const next: Id[] = [];
    for (const at of edge) {
      for (const t of ix.tiesOf(at)) {
        const other = t.from === at ? t.to : t.from;
        if (seen.has(other) || !ix.person(other)) continue;
        seen.add(other);
        via.set(other, at);
        next.push(other);
      }
    }
    if (next.length) rings.push(next);
    edge = next;
  }
  const lost = people.filter((id) => !seen.has(id));
  if (lost.length) rings.push(lost);

  let radius = 0;
  rings.forEach((ring, k) => {
    const want = new Map(ring.map((id) => {
      const by = via.get(id);
      if (by === undefined) return [id, freeAngle(id)];
      return [id, by === root ? aim(ix, root, id) : angle.get(by)!];
    }));
    // Spread angles run past one lap, so compare them folded into one
    const norm = (a: number) => ((a % TURN) + TURN) % TURN;
    ring.sort((a, b) =>
      norm(want.get(a)!) - norm(want.get(b)!) ||
      norm(freeAngle(a)) - norm(freeAngle(b)) ||
      (a < b ? -1 : a > b ? 1 : 0)
    );
    radius = Math.max(radius + RING_GAP, (ring.length * SPACING) / TURN);
    placed.push({ radius, away: via.has(ring[0]) ? k + 1 : null });
    for (const [id, a] of spread(ring, want)) {
      angle.set(id, a);
      spots.set(id, { x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
    }
  });
  return { spots, rings: placed };
}
