import { assert, assertEquals } from "@std/assert";
import { KINDS, type TieKind } from "../records/kinds.ts";
import { indexArchive, lifeDates } from "../records/queries.ts";
import type { Archive, Id, Tie } from "../records/types.ts";
import { validate } from "../records/validate.ts";
import { fixture } from "./fixture.ts";

const a = fixture();
const ix = indexArchive(a);

const parentTies = (id: Id) => ix.tiesOf(id).filter((t) => t.to === id && KINDS[t.kind].ranks);
const hasKind = (kind: TieKind) => a.ties.some((t) => t.kind === kind);
const pairKey = (t: Tie) => [t.from, t.to].toSorted().join("|");

function components(archive: Archive, skipTie?: Id, skipPeople = new Set<Id>()): number {
  const people = archive.people.filter((p) => !skipPeople.has(p.id));
  const up = new Map(people.map((p) => [p.id, p.id]));
  const find = (x: Id): Id => {
    while (up.get(x) !== x) x = up.get(x)!;
    return x;
  };
  for (const t of archive.ties) {
    if (t.id !== skipTie && up.has(t.from) && up.has(t.to)) up.set(find(t.from), find(t.to));
  }
  return new Set(people.map((p) => find(p.id))).size;
}

function descentLoops(archive: Archive): boolean {
  const children = new Map<Id, Id[]>();
  for (const t of archive.ties) {
    if (!KINDS[t.kind].ranks) continue;
    children.set(t.from, [...(children.get(t.from) ?? []), t.to]);
  }
  const state = new Map<Id, 1 | 2>();
  const visit = (id: Id): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    const loop = (children.get(id) ?? []).some(visit);
    state.set(id, 2);
    return loop;
  };
  return archive.people.some((p) => visit(p.id));
}

Deno.test("fixture is synthetic and roughly fifty people", () => {
  assert(a.synthetic);
  assert(a.people.length >= 40 && a.people.length <= 50, `${a.people.length} people`);
});

Deno.test("fixture validates without errors or warnings", () => {
  assertEquals(validate(a), []);
});

Deno.test("fixture spans at least five generations", () => {
  const depth = (id: Id): number =>
    1 +
    Math.max(
      0,
      ...parentTies(id).filter((t) => t.kind === "biological_parent").map((t) => depth(t.from)),
    );
  assert(Math.max(...a.people.map((p) => depth(p.id))) >= 5);
});

Deno.test("fixture has a branch joined only by a partnership and its children", () => {
  assertEquals(components(a), 1);
  const childrenOf = (id: Id) =>
    new Set(ix.tiesOf(id).filter((t) => t.from === id && KINDS[t.kind].ranks).map((t) => t.to));
  assert(a.ties.some((t) => {
    if (KINDS[t.kind].family !== "partnership") return false;
    const theirs = childrenOf(t.to);
    const shared = new Set([...childrenOf(t.from)].filter((c) => theirs.has(c)));
    return components(a, t.id, shared) > 1;
  }));
});

Deno.test("fixture keeps biological and adoptive parents together", () => {
  assert(a.people.some((p) => {
    const kinds = parentTies(p.id).map((t) => t.kind);
    return kinds.includes("biological_parent") && kinds.includes("adoptive_parent");
  }));
});

Deno.test("fixture has foster placement and guardianship", () => {
  assert(a.ties.some((t) => t.kind === "foster_parent" && t.start && t.end));
  assert(a.events.some((e) => e.kind === "fostering"));
  assert(hasKind("guardian"));
});

Deno.test("fixture has a stepfamily with more than two parent figures", () => {
  assert(a.people.some((p) => {
    const ties = parentTies(p.id);
    return ties.some((t) => t.kind === "step_parent") && new Set(ties.map((t) => t.from)).size > 2;
  }));
});

Deno.test("fixture has donor conception and a gestational carrier", () => {
  assert(
    a.people.some((p) => parentTies(p.id).filter((t) => t.kind === "gamete_donor").length === 1),
  );
  assert(hasKind("gestational_carrier"));
});

Deno.test("fixture has double-donor IVF with one undisclosed donor", () => {
  const child = a.people.find((p) =>
    parentTies(p.id).filter((t) => t.kind === "gamete_donor").length === 2
  );
  assert(child);
  const ties = parentTies(child.id);
  const donors = ties.filter((t) => t.kind === "gamete_donor").map((t) => t.from);
  const intended = ties.filter((t) => t.kind === "legal_parent" || t.kind === "intended_parent");
  assertEquals(intended.length, 2);
  assertEquals(ties.length, 4);
  assert(donors.some((d) => !ix.eventsOf(d).length && ix.person(d)!.living === undefined));
});

Deno.test("fixture has remarriage, divorce, separation, and widowhood", () => {
  const spouseCount = new Map<Id, number>();
  for (const t of a.ties.filter((t) => t.kind === "spouse")) {
    for (const p of [t.from, t.to]) spouseCount.set(p, (spouseCount.get(p) ?? 0) + 1);
  }
  assert([...spouseCount.values()].some((n) => n > 1));
  assert(a.events.some((e) => e.kind === "divorce"));
  assert(a.events.some((e) => e.kind === "separation"));
  assert(a.ties.some((t) => t.kind === "partner" && t.end));
  assert(a.ties.some((t) =>
    t.kind === "spouse" && t.end &&
    [t.from, t.to].some((p) => lifeDates(ix, p).died === t.end)
  ));
});

Deno.test("fixture has unmarried co-parents", () => {
  assert(a.ties.some((t) => {
    if (t.kind !== "partner") return false;
    const kids = (id: Id) =>
      new Set(
        ix.tiesOf(id).filter((x) => x.from === id && x.kind === "biological_parent").map((x) =>
          x.to
        ),
      );
    const ofTo = kids(t.to);
    const married = ix.tiesOf(t.from).some((x) => x.kind === "spouse" && pairKey(x) === pairKey(t));
    return !married && [...kids(t.from)].some((k) => ofTo.has(k));
  }));
});

Deno.test("fixture has same-gender partners", () => {
  assert(a.ties.some((t) => {
    if (KINDS[t.kind].family !== "partnership") return false;
    const x = ix.person(t.from)!.pronouns, y = ix.person(t.to)!.pronouns;
    return x !== undefined && x === y;
  }));
});

Deno.test("fixture has a three-partner household", () => {
  const partners = new Set(a.ties.filter((t) => t.kind === "partner").map(pairKey));
  const linked = (x: Id, y: Id) => partners.has([x, y].toSorted().join("|"));
  const ids = a.people.map((p) => p.id);
  assert(
    ids.some((x) =>
      ids.some((y) =>
        y > x && linked(x, y) && ids.some((z) => z > y && linked(x, z) && linked(y, z))
      )
    ),
  );
});

Deno.test("fixture has chosen family", () => {
  assert(hasKind("chosen_family"));
});

Deno.test("fixture has someone with only one parent on record", () => {
  assert(a.people.some((p) => {
    const ties = parentTies(p.id);
    return ties.length > 0 && new Set(ties.map((t) => t.from)).size === 1;
  }));
});

Deno.test("fixture has partial, approximate, ranged, and missing dates", () => {
  const dates = a.events.map((e) => e.date).filter((d) => d !== undefined);
  assert(dates.some((d) => /^\d{4}-\d{2}$/.test(d)));
  assert(dates.some((d) => d.endsWith("~")));
  assert(dates.some((d) => d.includes("/")));
  assert(a.people.some((p) => !lifeDates(ix, p.id).born));
});

Deno.test("fixture keeps a disputed fact as two coexisting claims", () => {
  const byRecord = Map.groupBy(a.claims, (c) => c.about);
  assert(
    [...byRecord.values()].some((cs) =>
      cs.length >= 2 && cs.every((c) => c.certainty === "disputed") &&
      new Set(cs.map((c) => c.statement)).size === cs.length
    ),
  );
});

Deno.test("fixture has living, deceased, and unknown people", () => {
  assert(a.people.some((p) => p.living === true));
  assert(a.people.some((p) => p.living === false && lifeDates(ix, p.id).died));
  assert(a.people.some((p) => p.living === undefined));
  for (const p of a.people) if (lifeDates(ix, p.id).died) assert(p.living !== true, p.name);
});

Deno.test("fixture has a pair of people with two ties", () => {
  const counts = Map.groupBy(a.ties, pairKey);
  assert([...counts.values()].some((ts) => ts.length > 1));
});

Deno.test("fixture has several paths between the same people", () => {
  const pairs = new Set(a.ties.map(pairKey));
  assert(pairs.size > a.people.length - components(a));
});

Deno.test("fixture has no descent loops", () => {
  assert(!descentLoops(a));
});

Deno.test("fixture place, trust, and interests resolve", () => {
  const places = new Map(a.places.map((p) => [p.id, p.name]));
  for (
    const name of [
      "Tamarack Landing",
      "Lake Wendell",
      "Harlow Mills",
      "Sawmill",
      "Lantern",
      "Wren",
      "The Annex",
    ]
  ) {
    assert([...places.values()].includes(name), name);
  }
  assertEquals(a.entities.map((e) => [e.name, e.kind]), [[
    "Tamarack Landing Family Trust",
    "trust",
  ]]);
  const holders = new Set([...a.people, ...a.entities].map((r) => r.id));
  for (const i of a.interests) {
    assert(holders.has(i.holder), i.id);
    assert(places.has(i.place), i.id);
  }
});

Deno.test("fixture trustees and beneficiaries change over time", () => {
  const trustees = a.interests.filter((i) => i.role === "trustee");
  assert(new Set(trustees.map((i) => i.holder)).size > 3);
  assert(trustees.some((i) => i.end) && trustees.some((i) => !i.end));
  const beneficiaries = a.interests.filter((i) => i.role === "beneficiary");
  assert(new Set(beneficiaries.map((i) => i.start)).size > 2);
  assert(beneficiaries.some((i) => i.end));
});

Deno.test("fixture has sources, placeholder media, bios, and pronouns", () => {
  assert(a.sources.length >= 3);
  assert(a.media.length >= 3 && a.media.every((m) => m.src === undefined));
  assert(a.people.filter((p) => p.bio).length > a.people.length / 2);
  assert(a.people.some((p) => p.pronouns));
});
