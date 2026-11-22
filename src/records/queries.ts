import { isParentFigure, KINDS } from "./kinds.ts";
import type { Archive, FuzzyDate, Id, LifeEvent, Person, Tie } from "./types.ts";

export interface Index {
  archive: Archive;
  person(id: Id): Person | undefined;
  tiesOf(id: Id): Tie[];
  eventsOf(id: Id): LifeEvent[];
}

export function indexArchive(a: Archive): Index {
  const people = new Map(a.people.map((p) => [p.id, p]));
  const ties = new Map<Id, Tie[]>();
  const events = new Map<Id, LifeEvent[]>();
  const push = <T>(map: Map<Id, T[]>, id: Id, item: T) => {
    const list = map.get(id);
    if (list) list.push(item);
    else map.set(id, [item]);
  };
  for (const t of a.ties) {
    push(ties, t.from, t);
    if (t.to !== t.from) push(ties, t.to, t);
  }
  for (const e of a.events) {
    for (const id of new Set(e.people)) push(events, id, e);
  }
  return {
    archive: a,
    person: (id) => people.get(id),
    tiesOf: (id) => ties.get(id) ?? [],
    eventsOf: (id) => events.get(id) ?? [],
  };
}

export function lifeDates(ix: Index, id: Id): { born?: FuzzyDate; died?: FuzzyDate } {
  const events = ix.eventsOf(id).filter((e) => e.people[0] === id);
  return {
    born: events.find((e) => e.kind === "birth")?.date,
    died: events.find((e) => e.kind === "death")?.date,
  };
}

export interface Sibling {
  id: Id;
  /* the parent figures both people have */
  shared: Id[];
}

/* Through lineage, legal, or care ties; donors and carriers don't count */
export function siblingsOf(ix: Index, id: Id): Sibling[] {
  const parents = new Set(
    ix.tiesOf(id).filter((t) => t.to === id && isParentFigure(t.kind)).map((t) => t.from),
  );
  const shared = new Map<Id, Set<Id>>();
  for (const p of parents) {
    for (const t of ix.tiesOf(p)) {
      if (t.from !== p || t.to === id || !isParentFigure(t.kind)) continue;
      const set = shared.get(t.to);
      if (set) set.add(p);
      else shared.set(t.to, new Set([p]));
    }
  }
  return [...shared].map(([sibling, via]) => ({ id: sibling, shared: [...via] }));
}

/* How far focus reaches: ties out by count, or straight up and down the lines of descent */
export type Reach = 1 | 2 | "up" | "down" | "both";

/* Includes `id` itself; "up" and "down" follow every tie that ranks, donors included */
export function reachOf(ix: Index, id: Id, reach: Reach): Set<Id> {
  if (typeof reach === "number") return neighborhood(ix, id, reach);
  const seen = new Set<Id>([id]);
  const walk = (up: boolean) => {
    for (const stack = [id]; stack.length;) {
      const at = stack.pop()!;
      for (const t of ix.tiesOf(at)) {
        if (!KINDS[t.kind]?.ranks) continue;
        const next = up ? (t.to === at ? t.from : undefined) : (t.from === at ? t.to : undefined);
        if (next === undefined || seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
  };
  if (reach !== "down") walk(true);
  if (reach !== "up") walk(false);
  return seen;
}

/* Includes `id` itself */
export function neighborhood(ix: Index, id: Id, hops: number): Set<Id> {
  const seen = new Set<Id>([id]);
  let edge = [id];
  for (let i = 0; i < hops && edge.length; i++) {
    const next: Id[] = [];
    for (const at of edge) {
      for (const t of ix.tiesOf(at)) {
        const other = t.from === at ? t.to : t.from;
        if (seen.has(other)) continue;
        seen.add(other);
        next.push(other);
      }
    }
    edge = next;
  }
  return seen;
}
