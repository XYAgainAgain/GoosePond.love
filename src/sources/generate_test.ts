import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { KINDS, type TieKind } from "../records/kinds.ts";
import { indexArchive, lifeDates } from "../records/queries.ts";
import type { Archive, EventKind, Id } from "../records/types.ts";
import { validate } from "../records/validate.ts";
import { generate } from "./generate.ts";

const SIZES = [50, 250, 500, 1000];
const SEEDS = [1, 2, 3, 4, 5];

function hasDescentLoop(a: Archive): boolean {
  const children = new Map<Id, Id[]>();
  for (const t of a.ties) {
    if (KINDS[t.kind].ranks) children.set(t.from, [...(children.get(t.from) ?? []), t.to]);
  }
  const state = new Map<Id, "open" | "done">();
  const visit = (id: Id): boolean => {
    if (state.get(id) === "open") return true;
    if (state.get(id) === "done") return false;
    state.set(id, "open");
    const loop = (children.get(id) ?? []).some(visit);
    state.set(id, "done");
    return loop;
  };
  return a.people.some((p) => visit(p.id));
}

Deno.test("the same seed gives the same archive", () => {
  assertEquals(generate(250, 7), generate(250, 7));
});

Deno.test("different seeds give different archives", () => {
  assertNotEquals(generate(250, 1), generate(250, 2));
});

for (const size of SIZES) {
  Deno.test(`size ${size}: people land within 15% for seeds 1 to 5`, () => {
    for (const seed of SEEDS) {
      const n = generate(size, seed).people.length;
      assert(Math.abs(n - size) <= size * 0.15, `seed ${seed} gave ${n}`);
    }
  });

  Deno.test(`size ${size}: seeds 1 to 5 validate without errors`, () => {
    for (const seed of SEEDS) {
      const errors = validate(generate(size, seed)).filter((i) => i.level === "error");
      assertEquals(errors, [], `seed ${seed}`);
    }
  });

  Deno.test(`size ${size}: no descent loops, and interests resolve`, () => {
    for (const seed of SEEDS) {
      const a = generate(size, seed);
      assert(!hasDescentLoop(a), `seed ${seed}`);
      const holders = new Set([...a.people, ...a.entities].map((r) => r.id));
      const places = new Set(a.places.map((p) => p.id));
      for (const i of a.interests) assert(holders.has(i.holder) && places.has(i.place), i.id);
    }
  });
}

Deno.test("generated archives are synthetic and carry the property and trust", () => {
  const a = generate(500, 3);
  assert(a.synthetic);
  assert(a.places.some((p) => p.name === "Tamarack Landing"));
  assertEquals(a.entities.map((e) => e.name), ["Tamarack Landing Family Trust"]);
  const trustees = a.interests.filter((i) => i.role === "trustee");
  assert(new Set(trustees.map((i) => i.holder)).size > 1);
  assert(a.interests.some((i) => i.role === "beneficiary"));
});

Deno.test("generated archives have dated lives, households, and hard cases", () => {
  const a = generate(1000, 1);
  const ix = indexArchive(a);
  const kinds = new Set(a.ties.map((t) => t.kind));
  const tieKinds: TieKind[] = [
    "spouse",
    "biological_parent",
    "adoptive_parent",
    "step_parent",
    "gamete_donor",
  ];
  for (const k of tieKinds) assert(kinds.has(k), k);
  const events = new Set(a.events.map((e) => e.kind));
  const eventKinds: EventKind[] = ["birth", "death", "marriage", "divorce"];
  for (const k of eventKinds) assert(events.has(k), k);
  assert(a.ties.some((t) => t.kind === "spouse" && t.start && t.end));
  assert(a.sources.length > 0 && a.media.length > 0 && a.claims.length > 1);
  for (const p of a.people) {
    if (lifeDates(ix, p.id).died) assertEquals(p.living, false, p.id);
  }
});

Deno.test("generate(1000) is fast", () => {
  const t0 = performance.now();
  generate(1000, 1);
  assert(performance.now() - t0 < 500);
});
