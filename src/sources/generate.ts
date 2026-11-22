import { archiveBuilder } from "../records/builder.ts";
import type { TieKind } from "../records/kinds.ts";
import type { Archive, FuzzyDate, Id, InterestRole, Person, Tie } from "../records/types.ts";
import { GIVEN, SURNAMES } from "./names.ts";

/* Latest event year; fixed so output never reads the clock */
const NOW = 2025;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Couple {
  a: Id;
  b: Id;
  tie: Tie;
  start: number;
  kids: Id[];
}

const pad = (n: number) => String(n).padStart(2, "0");

export function generate(size: number, seed: number): Archive {
  const r = mulberry32(seed);
  const int = (k: number) => Math.floor(r() * k);
  const pick = <T>(xs: readonly T[]) => xs[int(xs.length)];
  const chance = (p: number) => r() < p;
  const shuffle = <T>(xs: T[]) => {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
  };

  const b = archiveBuilder(`Generated families, seed ${seed}`, true);
  const a = b.archive;
  const born = new Map<Id, number>();
  const surname = new Map<Id, string>();
  /* the year each person must be alive through */
  const alive = new Map<Id, number>();
  const origin = new Map<Id, Couple>();
  const parentTies = new Map<Id, Tie[]>();
  const birthEvent = new Map<Id, Id>();
  const couples: Couple[] = [];

  const last = <T>(xs: T[]) => xs[xs.length - 1];
  const year = (id: Id) => born.get(id)!;
  const keepAlive = (id: Id, y: number) => alive.set(id, Math.max(alive.get(id) ?? y, y));
  const span = (start?: number, end?: number) => ({
    ...(start === undefined ? {} : { start: `${start}` }),
    ...(end === undefined ? {} : { end: `${end}` }),
  });

  const birthDate = (y: number): FuzzyDate => {
    const roll = r();
    if (y < 1915) return roll < 0.25 ? `${y}~` : roll < 0.35 ? `${y - 1}/${y + 1}` : `${y}`;
    if (roll < 0.3) return `${y}-${pad(1 + int(12))}`;
    if (roll < 0.5) return `${y}-${pad(1 + int(12))}-${pad(1 + int(28))}`;
    return `${y}`;
  };

  const mk = (sur: string, y: number) => {
    const id = b.person(`${pick(GIVEN)} ${sur}`, { born: birthDate(y) });
    birthEvent.set(id, last(a.events).id);
    born.set(id, y);
    surname.set(id, sur);
    keepAlive(id, y);
    return id;
  };
  const undisclosed = () => b.person("Undisclosed donor");

  const parent = (kind: TieKind, from: Id, child: Id, start?: number, end?: number) => {
    b.tie(kind, from, child, span(start, end));
    const t = last(a.ties);
    const list = parentTies.get(child);
    if (list) list.push(t);
    else parentTies.set(child, [t]);
    if (born.has(from)) keepAlive(from, end ?? start ?? year(child));
  };
  const retie = (child: Id, from: Id[], kind: TieKind) => {
    const changed = (parentTies.get(child) ?? []).filter((t) =>
      t.kind === "biological_parent" && from.includes(t.from)
    );
    for (const t of changed) t.kind = kind;
    return changed;
  };

  const pair = (x: Id, y: Id, start: number, kind: "spouse" | "partner") => {
    b.tie(kind, x, y, span(start));
    const tie = last(a.ties);
    b.event(kind === "spouse" ? "marriage" : "partnership", [x, y], { date: `${start}` });
    keepAlive(x, start);
    keepAlive(y, start);
    const c: Couple = { a: x, b: y, tie, start, kids: [] };
    couples.push(c);
    return c;
  };
  const relation = (): "spouse" | "partner" => chance(0.8) ? "spouse" : "partner";

  const kinCache = new Map<Id, Set<Id>>();
  const kin = (id: Id): Set<Id> => {
    let set = kinCache.get(id);
    if (set) return set;
    set = new Set();
    const o = origin.get(id);
    if (o) {
      for (const p of [o.a, o.b]) {
        set.add(p);
        const g = origin.get(p);
        if (g) set.add(g.a).add(g.b);
      }
    }
    kinCache.set(id, set);
    return set;
  };
  const related = (x: Id, y: Id) => {
    const kx = kin(x);
    for (const k of kin(y)) if (kx.has(k)) return true;
    return false;
  };

  // Households; a later founding couple is a branch unconnected until a marriage
  let queue: Couple[] = [];
  const found = (y: number) => {
    const x = mk(pick(SURNAMES), y);
    const z = mk(pick(SURNAMES), y + int(7) - 3);
    queue.push(pair(x, z, Math.max(y, year(z)) + 20 + int(6), "spouse"));
  };
  const budget = Math.round(size * 0.94);
  for (let i = Math.max(1, Math.round(size / 60)); i > 0; i--) found(1880 + int(25));

  while (a.people.length < budget) {
    if (!queue.length) {
      found(1880 + int(70));
      continue;
    }
    const singles: Id[] = [];
    for (const c of queue) {
      let y = c.start + 1 + int(4);
      for (let k = 1 + int(4); k > 0 && y < NOW && a.people.length < budget; k--) {
        const kid = mk(surname.get(c.a)!, y);
        parent("biological_parent", c.a, kid);
        parent("biological_parent", c.b, kid);
        c.kids.push(kid);
        origin.set(kid, c);
        singles.push(kid);
        y += 1 + int(4);
      }
    }
    shuffle(singles);
    const next: Couple[] = [];
    while (singles.length && a.people.length < budget) {
      const x = singles.pop()!;
      if (!chance(0.75)) continue;
      const j = chance(0.2)
        ? singles.findIndex((s) => Math.abs(year(s) - year(x)) < 8 && !related(s, x))
        : -1;
      const other = j >= 0 ? year(singles[j]) : year(x) + int(9) - 4;
      const start = Math.max(year(x), other) + 20 + int(10);
      if (start >= NOW) continue;
      const y = j >= 0 ? singles.splice(j, 1)[0] : mk(pick(SURNAMES), other);
      next.push(pair(x, y, start, relation()));
    }
    queue = next;
  }

  // Hard cases
  const withKids = couples.filter((c) => c.kids.length);
  for (const c of withKids) {
    for (const kid of c.kids) {
      const k = year(kid);
      const roll = r();
      if (roll < 0.03) {
        const start = k + int(4);
        for (const t of retie(kid, [c.a, c.b], "adoptive_parent")) t.start = `${start}`;
        keepAlive(c.a, start);
        keepAlive(c.b, start);
        b.event("adoption", [kid, c.a, c.b], { date: `${start}` });
        parent("biological_parent", mk(pick(SURNAMES), k - 17 - int(15)), kid);
      } else if (roll < 0.05 && k >= 1978) {
        retie(kid, [c.b], chance(0.5) ? "legal_parent" : "intended_parent");
        const donor = chance(0.5) ? undisclosed() : mk(pick(SURNAMES), k - 22 - int(15));
        parent("gamete_donor", donor, kid);
      } else if (roll < 0.06 && k >= 1988) {
        parent("gestational_carrier", mk(pick(SURNAMES), k - 24 - int(12)), kid);
      } else if (roll < 0.065 && k >= 1995) {
        retie(kid, [c.a, c.b], chance(0.5) ? "legal_parent" : "intended_parent");
        parent("gamete_donor", undisclosed(), kid);
        parent("gamete_donor", mk(pick(SURNAMES), k - 22 - int(15)), kid);
      } else if (roll < 0.085) {
        const f = pick(withKids);
        const start = k + int(10);
        const end = Math.min(start + 1 + int(4), NOW);
        if (f !== c && Math.max(year(f.a), year(f.b)) + 22 <= start && start < NOW) {
          parent("foster_parent", f.a, kid, start, end);
          parent("foster_parent", f.b, kid, start, end);
          b.event("fostering", [kid, f.a, f.b], { date: `${start}` });
          if (chance(0.3)) b.tie("sibling_by_custom", kid, pick(f.kids));
        }
      } else if (roll < 0.095) {
        const start = k + 2 + int(12);
        const aunts = (origin.get(c.a)?.kids ?? []).filter((s) =>
          s !== c.a && year(s) + 20 <= start
        );
        if (aunts.length && start < NOW) {
          parent("guardian", pick(aunts), kid, start, k + 18 <= NOW ? k + 18 : undefined);
        }
      }
    }

    if (chance(0.12)) {
      const split = year(last(c.kids)) + 1 + int(8);
      if (split > NOW - 2) continue;
      c.tie.end = `${split}`;
      keepAlive(c.a, split);
      keepAlive(c.b, split);
      b.event(c.tie.kind === "spouse" ? "divorce" : "separation", [c.a, c.b], {
        date: `${split}`,
      });
      const again = split + 1 + int(5);
      if (!chance(0.7) || again >= NOW) continue;
      const step = mk(pick(SURNAMES), year(c.a) + int(11) - 5);
      const remarried = pair(c.a, step, again, relation());
      for (const kid of c.kids) parent("step_parent", step, kid, again);
      const half = again + 1 + int(4);
      if (chance(0.5) && half < NOW && half - year(c.a) <= 45 && half - year(step) >= 18) {
        const kid = mk(surname.get(c.a)!, half);
        parent("biological_parent", c.a, kid);
        parent("biological_parent", step, kid);
        remarried.kids.push(kid);
        origin.set(kid, remarried);
      }
    } else if (c.start >= 1965 && chance(0.015)) {
      const y = year(c.a) + int(9) - 4;
      const start = Math.max(c.start, y + 20) + int(5);
      if (start >= NOW) continue;
      const third = mk(pick(SURNAMES), y);
      for (const p of [c.a, c.b]) b.tie("partner", p, third, span(start));
      for (const p of [c.a, c.b, third]) keepAlive(p, start);
    }
  }

  const dated = a.people.filter((p) => born.has(p.id));
  for (let i = Math.round(size / 30); i > 0; i--) {
    const x = pick(dated).id, y = pick(dated).id;
    const start = Math.max(year(x), year(y)) + 15 + int(10);
    if (x === y || Math.abs(year(x) - year(y)) >= 15 || start >= NOW) continue;
    b.tie("chosen_family", x, y, span(start));
    keepAlive(x, start);
    keepAlive(y, start);
  }

  // Deaths, widowhood, and remarriage after it
  const died = new Map<Id, number>();
  const deathDate = new Map<Id, FuzzyDate>();
  const settle = (p: Person) => {
    const d = Math.max(year(p.id) + 58 + int(40), alive.get(p.id)!);
    if (d > NOW) {
      p.living = true;
      return;
    }
    const date = chance(0.25) ? `${d}-${pad(1 + int(12))}` : `${d}`;
    p.living = false;
    died.set(p.id, d);
    deathDate.set(p.id, date);
    b.event("death", [p.id], { date });
  };
  for (const p of dated) settle(p);

  const close = (c: Couple) => {
    if (c.tie.end) return undefined;
    const gone = [c.a, c.b].filter((p) => died.has(p))
      .sort((x, y) => died.get(x)! - died.get(y)!)[0];
    if (gone === undefined) return undefined;
    c.tie.end = deathDate.get(gone);
    return { survivor: gone === c.a ? c.b : c.a, end: died.get(gone)! };
  };
  for (const c of [...couples]) {
    const w = close(c);
    if (!w || !chance(0.15)) continue;
    const again = w.end + 1 + int(3);
    if (again >= NOW || again > (died.get(w.survivor) ?? NOW)) continue;
    if (again - year(w.survivor) > 75) continue;
    const spouse = mk(pick(SURNAMES), year(w.survivor) + int(9) - 4);
    const later = pair(w.survivor, spouse, again, "spouse");
    settle(last(a.people));
    close(later);
  }

  // Property and trust
  const place = (name: string, note: string) => {
    const id = b.id("pl");
    a.places.push({ id, name, note });
    return id;
  };
  place("Harlow Mills", "The town nearest the lake.");
  place("Lake Wendell", "The lake the landing sits on.");
  const landing = place("Tamarack Landing", "Four cabins on Lake Wendell.");
  place("Sawmill", "The largest cabin, with the main room.");
  place("Lantern", "A cabin at Tamarack Landing.");
  place("Wren", "The smallest cabin.");
  place("The Annex", "A cabin at Tamarack Landing.");
  const trust = b.id("en");
  a.entities.push({ id: trust, name: "Tamarack Landing Family Trust", kind: "trust" });

  const source = (title: string, citation?: string) => {
    const id = b.id("s");
    a.sources.push(citation ? { id, title, citation } : { id, title });
    return id;
  };
  const deed = source("Deed of trust, Tamarack Landing Family Trust", "Harlow Mills land registry");
  const register = source("Harlow Mills town register", "Births and marriages, volumes 1 to 9");
  const letters = source("Letters from the landing");
  source("Lantern Swim guest books");

  const interest = (
    holder: Id,
    role: InterestRole,
    start: number,
    end?: FuzzyDate,
    extra: { share?: string; sources?: Id[] } = {},
  ) => {
    a.interests.push({
      id: b.id("i"),
      holder,
      place: landing,
      role,
      start: `${start}`,
      ...(end ? { end } : {}),
      ...extra,
    });
  };

  const childrenOf = new Map<Id, Id[]>();
  for (const c of couples) {
    for (const p of [c.a, c.b]) {
      const list = childrenOf.get(p);
      if (list) list.push(...c.kids);
      else childrenOf.set(p, [...c.kids]);
    }
  }
  const outlives = (id: Id, y: number) => (died.get(id) ?? Infinity) >= y;

  const descendantsOf = (root: Id) => {
    const found: Id[] = [];
    const seen = new Set<Id>([root]);
    for (let frontier = [root]; frontier.length;) {
      const next: Id[] = [];
      for (const at of frontier) {
        for (const k of childrenOf.get(at) ?? []) {
          if (seen.has(k)) continue;
          seen.add(k);
          found.push(k);
          next.push(k);
        }
      }
      frontier = next;
    }
    return found;
  };
  const roots = couples.filter((c) => !origin.has(c.a) && year(c.a) < 1910);
  let home = couples[0], descendants = descendantsOf(home.a);
  for (const c of roots) {
    const ds = descendantsOf(c.a);
    if (ds.length > descendants.length) [home, descendants] = [c, ds];
  }

  const founder = home.a;
  const owned = year(founder) + 28;
  const transfer = Math.min(owned + 6 + int(6), died.get(founder) ?? NOW);
  interest(founder, "recorded_owner", owned, `${transfer}`, { sources: [deed] });
  interest(trust, "recorded_owner", transfer, undefined, { sources: [deed] });
  b.event("property_transfer", [founder], { date: `${transfer}`, place: landing, sources: [deed] });

  for (let holder: Id | undefined = founder, start = transfer; holder;) {
    const end = died.get(holder);
    interest(holder, "trustee", start, deathDate.get(holder));
    if (end === undefined) break;
    const able = (k: Id) => year(k) + 25 <= end && outlives(k, end) && k !== holder;
    const heirs: Id[] = (childrenOf.get(holder) ?? []).filter(able);
    const pool: Id[] = heirs.length ? heirs : descendants.filter(able);
    holder = pool.length ? pick(pool) : undefined;
    start = end;
  }

  for (const d of descendants.slice(0, 60)) {
    const start = Math.max(transfer, year(d) + 21);
    if (start >= NOW || !outlives(d, start)) continue;
    const share = origin.get(d) === home ? "an equal share, as written in the deed" : undefined;
    interest(d, "beneficiary", start, deathDate.get(d), share ? { share } : {});
  }
  const keeper = descendants.find((d) => year(d) + 25 < NOW && outlives(d, year(d) + 25));
  if (keeper) {
    const start = year(keeper) + 25;
    const end = start + 8 + int(15);
    interest(keeper, "caretaker", start, end < NOW && outlives(keeper, end) ? `${end}` : undefined);
  }

  // Sources, media, and claims
  for (const e of a.events) {
    if ((e.kind === "marriage" || e.kind === "birth") && chance(0.1)) e.sources = [register];
  }
  const photo = (title: string, people: Id[], date: number) =>
    a.media.push({ id: b.id("m"), kind: "photo", title, people, date: `${date}` });
  a.media.push({
    id: b.id("m"),
    kind: "document",
    title: "Deed of trust",
    people: [founder],
    date: `${transfer}`,
  });
  for (let i = Math.max(2, Math.round(size / 25)); i > 0; i--) {
    const c = pick(couples);
    if (!c.kids.length) {
      photo("Wedding day", [c.a, c.b], c.start);
      continue;
    }
    const people = [c.a, c.b, ...c.kids.slice(0, 1 + int(3))];
    const latest = Math.min(NOW, ...people.map((p) => died.get(p) ?? NOW));
    photo("At the landing", people, Math.min(year(last(people)) + int(8), latest));
  }
  const older = dated.filter((p) => year(p.id) < 1950);
  for (let i = Math.round(size / 120) + 1; i > 0 && older.length; i--) {
    const p = pick(older);
    const y = year(p.id);
    const about = birthEvent.get(p.id)!;
    a.claims.push({
      id: b.id("c"),
      about,
      statement: `Born in ${y}, as the town register has it.`,
      certainty: "disputed",
      sources: [register],
    }, {
      id: b.id("c"),
      about,
      statement: `Born in ${y + 2}, as the family remembers it.`,
      certainty: "disputed",
      sources: [letters],
    });
  }

  return a;
}
