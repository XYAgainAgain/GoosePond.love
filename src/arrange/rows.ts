import { KINDS } from "../records/kinds.ts";
import type { Archive, Id } from "../records/types.ts";

export interface Rows {
  row: Map<Id, number>;
  /* true when ranking ties loop, so rows are unreliable */
  looped: boolean;
  /* Partner groups, members in seating order */
  groups: Map<string, Id[]>;
  groupEdges: [string, string][];
}

export function descentRows(a: Archive): Rows {
  const parent = new Map<Id, Id>();
  for (const p of a.people) parent.set(p.id, p.id);
  const find = (x: Id): Id => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const known = (t: { from: Id; to: Id }) => parent.has(t.from) && parent.has(t.to);

  const partners = new Map<Id, Set<Id>>();
  const link = (x: Id, y: Id) => {
    const s = partners.get(x) ?? new Set<Id>();
    partners.set(x, s.add(y));
  };
  const seat = (x: Id, y: Id) => {
    parent.set(find(x), find(y));
    link(x, y);
    link(y, x);
  };
  const coParents = new Map<string, Id[]>();
  for (const t of a.ties) {
    const k = KINDS[t.kind];
    if (!k || !known(t) || t.from === t.to) continue;
    if (k.pairs) seat(t.from, t.to);
    else if (k.ranks && k.family !== "assisted") {
      const key = `${t.to}\n${k.family}`;
      coParents.set(key, [...(coParents.get(key) ?? []), t.from]);
    }
  }
  const ranking = a.ties.filter((t) => KINDS[t.kind]?.ranks && known(t) && t.from !== t.to);
  const descends = (from: Id, to: Id) => {
    const next = new Map<Id, Id[]>();
    for (const t of ranking) {
      const up = find(t.from);
      next.set(up, [...(next.get(up) ?? []), find(t.to)]);
    }
    const seen = new Set([from]);
    for (const stack = [from]; stack.length;) {
      for (const g of next.get(stack.pop()!) ?? []) {
        if (g === to) return true;
        if (!seen.has(g)) {
          seen.add(g);
          stack.push(g);
        }
      }
    }
    return false;
  };
  // Co-parents sit together without a recorded partnership, unless one descends from the other
  for (const ps of coParents.values()) {
    for (let i = 1; i < ps.length; i++) {
      const x = find(ps[i - 1]), y = find(ps[i]);
      if (x !== y && !descends(x, y) && !descends(y, x)) seat(ps[i - 1], ps[i]);
    }
  }

  const seen = new Set<string>();
  const edges: [string, string][] = [];
  for (const t of a.ties) {
    if (!KINDS[t.kind]?.ranks || !known(t)) continue;
    const up = find(t.from), down = find(t.to);
    const key = `${up}\n${down}`;
    if (up === down || seen.has(key)) continue;
    seen.add(key);
    edges.push([up, down]);
  }

  const row = new Map<string, number>();
  for (const p of a.people) row.set(find(p.id), 0);
  const cap = row.size + 2;

  let changed = true;
  for (let i = 0; changed && i < cap; i++) {
    changed = false;
    for (const [up, down] of edges) {
      if (row.get(down)! < row.get(up)! + 1) {
        row.set(down, row.get(up)! + 1);
        changed = true;
      }
    }
  }
  const looped = changed;

  changed = true;
  for (let i = 0; changed && i < cap; i++) {
    changed = false;
    const highestChild = new Map<string, number>();
    for (const [up, down] of edges) {
      highestChild.set(up, Math.min(highestChild.get(up) ?? Infinity, row.get(down)!));
    }
    for (const [g, r] of highestChild) {
      if (r - 1 > row.get(g)!) {
        row.set(g, r - 1);
        changed = true;
      }
    }
  }

  // Someone tied in only by non-descent ties joins the row of a person they're tied to, not the top
  const anchored = new Set(edges.flat());
  const loose = a.ties.filter((t) => {
    const k = KINDS[t.kind];
    return k && !k.ranks && !k.pairs && known(t) && find(t.from) !== find(t.to);
  });
  for (let i = 0, moved = true; moved && i < cap; i++) {
    moved = false;
    for (const t of loose) {
      const x = find(t.from), y = find(t.to);
      const [drift, anchor] = anchored.has(x) ? [y, x] : [x, y];
      if (anchored.has(drift) || !anchored.has(anchor)) continue;
      row.set(drift, row.get(anchor)!);
      anchored.add(drift);
      moved = true;
    }
  }

  const groups = new Map<string, Id[]>();
  for (const p of a.people) {
    const g = find(p.id);
    groups.set(g, [...(groups.get(g) ?? []), p.id]);
  }
  for (const [g, members] of groups) {
    if (members.length < 3) continue;
    const degree = (m: Id) => partners.get(m)?.size ?? 0;
    const start = members.reduce((best, m) => (degree(m) < degree(best) ? m : best));
    const ordered: Id[] = [];
    const placed = new Set<Id>();
    const walk = (m: Id) => {
      placed.add(m);
      ordered.push(m);
      for (const o of partners.get(m) ?? []) if (!placed.has(o)) walk(o);
    };
    walk(start);
    groups.set(g, ordered);
  }

  return {
    row: new Map(a.people.map((p) => [p.id, row.get(find(p.id))!])),
    looped,
    groups,
    groupEdges: edges,
  };
}
