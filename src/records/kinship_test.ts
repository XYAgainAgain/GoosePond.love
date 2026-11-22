import { assert, assertEquals } from "@std/assert";
import { COPY } from "../copy.ts";
import { generate } from "../sources/generate.ts";
import { archiveBuilder } from "./builder.ts";
import { kinName, kinNameFor, kinPath } from "./kinship.ts";
import { indexArchive } from "./queries.ts";
import type { Archive, Tie } from "./types.ts";

const he = { pronouns: "he/him" };
const she = { pronouns: "she/her" };
const they = { pronouns: "they/them" };

function branches() {
  const b = archiveBuilder("branches", true);
  const root = b.person("Orla Venn", she);
  const descend = (names: [string, object][]) => {
    let parent = root;
    return names.map(([name, init]) => {
      const id = b.person(name, init);
      b.parents("biological_parent", id, parent);
      return (parent = id);
    });
  };
  const [l1, l2, l3, l4] = descend([["Lark", she], ["Lio", he], ["Lumi", they], ["Lev", he]]);
  const [r1, r2, r3, r4] = descend([["Rhea", she], ["Rolf", he], ["Rue", she], ["Ravi", he]]);
  return { ix: indexArchive(b.archive), root, l1, l2, l3, l4, r1, r2, r3, r4 };
}

function household() {
  const b = archiveBuilder("household", true);
  const mum = b.person("Mira", she);
  const dad = b.person("Dov", he);
  const other = b.person("Otto", he);
  const me = b.person("Juno");
  const sister = b.person("Sela", she);
  const half = b.person("Hal", he);
  const stepmum = b.person("Sten", she);
  const stepson = b.person("Kip", he);
  const partner = b.person("Pia", she);
  const partnerKid = b.person("Quill", she);
  b.parents("biological_parent", me, mum, dad);
  b.parents("biological_parent", sister, mum, dad);
  b.parents("biological_parent", half, mum, other);
  b.parents("step_parent", me, stepmum);
  b.parents("biological_parent", stepson, stepmum);
  b.tie("partner", dad, partner);
  b.parents("biological_parent", partnerKid, partner);
  return {
    ix: indexArchive(b.archive),
    mum,
    dad,
    me,
    sister,
    half,
    stepmum,
    stepson,
    partner,
    partnerKid,
  };
}

function inLaws() {
  const b = archiveBuilder("in-laws", true);
  const husband = b.person("Hugo", he);
  const wife = b.person("Wila", she);
  const hisMum = b.person("Hesper", she);
  const hisSister = b.person("Hana", she);
  const hersMum = b.person("Wren", she);
  const herBrother = b.person("Wade", he);
  const herSibling = b.person("Wynn");
  const gran = b.person("Gale", she);
  const greatAunt = b.person("Hollis", she);
  const cousin = b.person("Corin", they);
  const cousinKid = b.person("Cass", she);
  const ex = b.person("Ewan", he);
  b.tie("spouse", husband, wife);
  b.tie("spouse", ex, hisSister, { start: "1990", end: "1999" });
  b.parents("biological_parent", husband, hisMum);
  b.parents("biological_parent", hisSister, hisMum);
  b.parents("biological_parent", wife, hersMum);
  b.parents("biological_parent", herBrother, hersMum);
  b.parents("biological_parent", herSibling, hersMum);
  b.parents("biological_parent", hisMum, gran);
  b.parents("biological_parent", greatAunt, gran);
  b.parents("biological_parent", cousin, greatAunt);
  b.parents("biological_parent", cousinKid, cousin);
  return {
    ix: indexArchive(b.archive),
    husband,
    wife,
    hisMum,
    hisSister,
    hersMum,
    herBrother,
    herSibling,
    cousinKid,
    ex,
  };
}

Deno.test("kinPath is empty for the same person and null for people with no tie between them", () => {
  const b = archiveBuilder("apart", true);
  const a = b.person("Ash");
  const z = b.person("Zed");
  const ix = indexArchive(b.archive);
  assertEquals(kinPath(ix, a, a), []);
  assertEquals(kinPath(ix, a, z), null);
  assertEquals(kinName(ix, a, z), null);
  assertEquals(kinName(ix, a, a), null);
  assertEquals(kinNameFor(ix, a, a), "you");
  assertEquals(kinNameFor(ix, a, z), null);
});

Deno.test("kinPath reads a sibling as one step up to a shared parent and one step down", () => {
  const h = household();
  const path = kinPath(h.ix, h.me, h.sister)!;
  assertEquals(path.map((s) => s.direction), ["up", "down"]);
  assert(path[0].person === h.mum || path[0].person === h.dad);
  assertEquals(path[1].person, h.sister);
});

Deno.test("kinPath prefers a blood parent over a foster parent when both chains are as short", () => {
  const b = archiveBuilder("tie-break", true);
  const foster = b.person("Fenn");
  const mum = b.person("Maud");
  const me = b.person("Ira");
  const sib = b.person("Ode");
  b.parents("foster_parent", me, foster);
  b.parents("foster_parent", sib, foster);
  b.parents("biological_parent", me, mum);
  b.parents("biological_parent", sib, mum);
  const ix = indexArchive(b.archive);
  assertEquals(kinPath(ix, me, sib)!.map((s) => s.tie.kind), [
    "biological_parent",
    "biological_parent",
  ]);
  assertEquals(kinName(ix, me, sib), "sibling");
});

Deno.test("kinPath prefers a parent and child chain over chosen-family links of the same length", () => {
  const b = archiveBuilder("chosen", true);
  const me = b.person("Ivo");
  const friend = b.person("Fay");
  const dad = b.person("Dar");
  const sib = b.person("Sim", she);
  b.tie("chosen_family", friend, me);
  b.tie("chosen_family", friend, sib);
  b.parents("biological_parent", me, dad);
  b.parents("biological_parent", sib, dad);
  const ix = indexArchive(b.archive);
  assertEquals(kinPath(ix, me, sib)!.map((s) => s.direction), ["up", "down"]);
  assertEquals(kinName(ix, me, sib), "sister");
  assertEquals(kinName(ix, me, friend), "chosen family");
});

Deno.test("kinName names parents and children with words from pronouns, or neutral words", () => {
  const h = household();
  assertEquals(kinName(h.ix, h.me, h.mum), "mother");
  assertEquals(kinName(h.ix, h.me, h.dad), "father");
  assertEquals(kinName(h.ix, h.mum, h.me), "child");
  assertEquals(kinName(h.ix, h.mum, h.sister), "daughter");
  assertEquals(kinName(h.ix, h.mum, h.half), "son");
  const b = archiveBuilder("neutral", true);
  const p = b.person("Pat");
  const c = b.person("Cy", they);
  b.parents("biological_parent", c, p);
  const ix = indexArchive(b.archive);
  assertEquals(kinName(ix, c, p), "parent");
  assertEquals(kinName(ix, p, c), "child");
});

Deno.test("kinName gives each kind of parent tie its own word in both directions", () => {
  const b = archiveBuilder("flavors", true);
  const kid = b.person("Nell", she);
  const birth = b.person("Bree", she);
  const adoptive = b.person("Abe", he);
  const step = b.person("Sol", he);
  const foster = b.person("Fern");
  const guardian = b.person("Gus", he);
  const donor = b.person("Dex", he);
  const carrier = b.person("Cara", she);
  b.parents("biological_parent", kid, birth);
  b.parents("adoptive_parent", kid, adoptive);
  b.parents("step_parent", kid, step);
  b.parents("foster_parent", kid, foster);
  b.parents("guardian", kid, guardian);
  b.parents("gamete_donor", kid, donor);
  b.parents("gestational_carrier", kid, carrier);
  const ix = indexArchive(b.archive);
  const up = (id: string) => kinName(ix, kid, id);
  const down = (id: string) => kinName(ix, id, kid);
  assertEquals(up(birth), "birth mother");
  assertEquals(down(birth), "daughter");
  assertEquals(up(adoptive), "adoptive father");
  assertEquals(down(adoptive), "adopted daughter");
  assertEquals(up(step), "stepfather");
  assertEquals(down(step), "stepdaughter");
  assertEquals(up(foster), "foster parent");
  assertEquals(down(foster), "foster daughter");
  assertEquals(up(guardian), "guardian");
  assertEquals(down(guardian), "ward");
  assertEquals(up(donor), "donor");
  assertEquals(down(donor), "donor-conceived daughter");
  assertEquals(up(carrier), "gestational carrier");
  assertEquals(down(carrier), "child they carried");
});

Deno.test("kinName tells full, half, and step siblings apart", () => {
  const h = household();
  assertEquals(kinName(h.ix, h.me, h.sister), "sister");
  assertEquals(kinName(h.ix, h.sister, h.me), "sibling");
  assertEquals(kinName(h.ix, h.me, h.half), "half-brother");
  assertEquals(kinName(h.ix, h.half, h.sister), "half-sister");
  assertEquals(kinName(h.ix, h.me, h.stepson), "stepbrother");
  assertEquals(kinName(h.ix, h.stepson, h.me), "step-sibling");
});

Deno.test("kinName calls siblings half only when each has a parent the other lacks", () => {
  const b = archiveBuilder("half", true);
  const mum = b.person("Moll", she);
  const dad = b.person("Dace", he);
  const both = b.person("Bex", she);
  const oneSided = b.person("Odo", he);
  const adopted = b.person("Ady", she);
  b.parents("biological_parent", both, mum, dad);
  b.parents("biological_parent", oneSided, mum);
  b.parents("adoptive_parent", adopted, mum);
  const ix = indexArchive(b.archive);
  assertEquals(kinName(ix, both, oneSided), "brother");
  assertEquals(kinName(ix, oneSided, both), "sister");
  assertEquals(kinName(ix, oneSided, adopted), "sister");
});

Deno.test("kinName makes a parent's partner a step-parent and their child a step-sibling", () => {
  const h = household();
  assertEquals(kinName(h.ix, h.me, h.partner), "stepmother");
  assertEquals(kinName(h.ix, h.partner, h.me), "stepchild");
  assertEquals(kinName(h.ix, h.me, h.partnerKid), "stepsister");
  assertEquals(kinName(h.ix, h.partnerKid, h.me), "step-sibling");
});

Deno.test("kinName names twins and identical twins", () => {
  const b = archiveBuilder("twins", true);
  const a = b.person("Arlo", he);
  const z = b.person("Zia", she);
  const c = b.person("Cleo", she);
  const e = b.person("Edie", she);
  const kid = b.person("Kit");
  b.tie("twin", a, z);
  b.tie("identical_twin", c, e);
  b.parents("biological_parent", kid, z);
  const ix = indexArchive(b.archive);
  assertEquals(kinName(ix, a, z), "twin sister");
  assertEquals(kinName(ix, z, a), "twin brother");
  assertEquals(kinName(ix, c, e), "identical twin sister");
  assertEquals(kinName(ix, kid, a), "uncle");
  assertEquals(kinName(ix, a, kid), "niece or nephew");
  assertEquals(kinName(ix, kid, z), "mother");
});

Deno.test("kinName counts grandparents and grandchildren with any number of greats", () => {
  const t = branches();
  assertEquals(kinName(t.ix, t.l2, t.root), "grandmother");
  assertEquals(kinName(t.ix, t.l3, t.root), "great-grandmother");
  assertEquals(kinName(t.ix, t.l4, t.root), "great-great-grandmother");
  assertEquals(kinName(t.ix, t.root, t.l2), "grandson");
  assertEquals(kinName(t.ix, t.root, t.l3), "great-grandchild");
  assertEquals(kinName(t.ix, t.root, t.l4), "great-great-grandson");
  assertEquals(kinName(t.ix, t.l2, t.l2), null);
  assertEquals(kinName(t.ix, t.r4, t.r2), "grandfather");
});

Deno.test("kinName names aunts, uncles, nieces, and nephews, with greats", () => {
  const t = branches();
  assertEquals(kinName(t.ix, t.l2, t.r1), "aunt");
  assertEquals(kinName(t.ix, t.r1, t.l2), "nephew");
  assertEquals(kinName(t.ix, t.l3, t.r1), "great-aunt");
  assertEquals(kinName(t.ix, t.r1, t.l3), "great-niece or great-nephew");
  assertEquals(kinName(t.ix, t.l4, t.r1), "great-great-aunt");
  assertEquals(kinName(t.ix, t.r1, t.l4), "great-great-nephew");
  assertEquals(kinName(t.ix, t.l1, t.r3), "great-niece");
});

Deno.test("kinName counts cousins by degree and by times removed, the same both ways", () => {
  const t = branches();
  assertEquals(kinName(t.ix, t.l2, t.r2), "first cousin");
  assertEquals(kinName(t.ix, t.l3, t.r3), "second cousin");
  assertEquals(kinName(t.ix, t.l4, t.r4), "third cousin");
  assertEquals(kinName(t.ix, t.l3, t.r2), "first cousin once removed");
  assertEquals(kinName(t.ix, t.r2, t.l3), "first cousin once removed");
  assertEquals(kinName(t.ix, t.l4, t.r2), "first cousin twice removed");
  assertEquals(kinName(t.ix, t.r4, t.l3), "second cousin once removed");
});

Deno.test("kinName names spouses, partners, and a former spouse", () => {
  const w = inLaws();
  assertEquals(kinName(w.ix, w.wife, w.husband), "husband");
  assertEquals(kinName(w.ix, w.husband, w.wife), "wife");
  assertEquals(kinName(w.ix, w.hisSister, w.ex), "former husband");
  assertEquals(kinName(w.ix, w.ex, w.hisSister), "former wife");
  const h = household();
  assertEquals(kinName(h.ix, h.dad, h.partner), "partner");
  const b = archiveBuilder("ends", true);
  const pat = b.person("Pell", they);
  const ren = b.person("Ren");
  const widow = b.person("Vada", she);
  const late = b.person("Lyle", he);
  b.event("death", [late], { date: "2001" });
  b.tie("partner", pat, ren, { end: "2010" });
  b.tie("spouse", widow, late, { end: "2001" });
  const ix = indexArchive(b.archive);
  assertEquals(kinName(ix, ren, pat), "former partner");
  assertEquals(kinName(ix, widow, late), "husband");
  assertEquals(kinName(ix, late, widow), "wife");
});

Deno.test("kinName falls back to neutral words for aunts, uncles, and grandparents", () => {
  const b = archiveBuilder("neutral kin", true);
  const gp = b.person("Gray");
  const parent = b.person("Parr", she);
  const aunt = b.person("Ash");
  const kid = b.person("Kai", he);
  b.parents("biological_parent", parent, gp);
  b.parents("biological_parent", aunt, gp);
  b.parents("biological_parent", kid, parent);
  const ix = indexArchive(b.archive);
  assertEquals(kinName(ix, kid, gp), "grandparent");
  assertEquals(kinName(ix, kid, aunt), "aunt or uncle");
  assertEquals(kinNameFor(ix, aunt, kid), "your nephew");
});

Deno.test("kinName names parents-in-law and children-in-law", () => {
  const w = inLaws();
  assertEquals(kinName(w.ix, w.wife, w.hisMum), "mother-in-law");
  assertEquals(kinName(w.ix, w.hisMum, w.wife), "daughter-in-law");
  assertEquals(kinName(w.ix, w.hersMum, w.husband), "son-in-law");
  assertEquals(kinName(w.ix, w.ex, w.hisMum), "former mother-in-law");
});

Deno.test("kinName names siblings-in-law through a partner's sibling or a sibling's partner", () => {
  const w = inLaws();
  assertEquals(kinName(w.ix, w.wife, w.hisSister), "sister-in-law");
  assertEquals(kinName(w.ix, w.hisSister, w.wife), "sister-in-law");
  assertEquals(kinName(w.ix, w.husband, w.herBrother), "brother-in-law");
  assertEquals(kinName(w.ix, w.herBrother, w.husband), "brother-in-law");
  assertEquals(kinName(w.ix, w.husband, w.herSibling), "sibling-in-law");
});

Deno.test("kinName names chosen family and siblings by custom", () => {
  const b = archiveBuilder("custom", true);
  const a = b.person("Ana");
  const z = b.person("Zuri", she);
  const c = b.person("Cole");
  b.tie("sibling_by_custom", a, z);
  b.tie("chosen_family", a, c);
  const ix = indexArchive(b.archive);
  assertEquals(kinName(ix, a, z), "sister by custom");
  assertEquals(kinName(ix, z, c), "sibling by custom's chosen family");
  assertEquals(kinName(ix, c, a), "chosen family");
});

Deno.test("kinName falls back to a readable chain for longer or stranger relations", () => {
  const w = inLaws();
  assertEquals(kinName(w.ix, w.wife, w.cousinKid), "husband's first cousin once removed");
  const b = archiveBuilder("chains", true);
  const ward = b.person("Wes");
  const guardian = b.person("Gil");
  const gran = b.person("Gert", she);
  const donor = b.person("Dov");
  const donorKid = b.person("Dan", he);
  b.parents("guardian", ward, guardian);
  b.parents("biological_parent", guardian, gran);
  b.parents("gamete_donor", ward, donor);
  b.parents("biological_parent", donorKid, donor);
  const ix = indexArchive(b.archive);
  assertEquals(kinName(ix, ward, gran), "guardian's mother");
  assertEquals(kinName(ix, ward, donorKid), "donor's son");
});

Deno.test("kinNameFor says the relation as the viewer would", () => {
  const t = branches();
  assertEquals(kinNameFor(t.ix, t.l3, t.l3), "you");
  assertEquals(kinNameFor(t.ix, t.l3, t.r1), "your great-aunt");
  assertEquals(kinNameFor(t.ix, t.l3, t.r4), "your second cousin once removed");
  const w = inLaws();
  assertEquals(kinNameFor(w.ix, w.wife, w.cousinKid), "your husband's first cousin once removed");
});

Deno.test("kinName finishes when parent ties loop back on themselves", () => {
  const b = archiveBuilder("loop", true);
  const a = b.person("Ava");
  const z = b.person("Zev");
  const c = b.person("Cy");
  b.parents("biological_parent", z, a);
  b.parents("biological_parent", a, z);
  b.parents("biological_parent", c, z);
  const ix = indexArchive(b.archive);
  assertEquals(kinPath(ix, a, c)!.length, 2);
  assert(kinName(ix, a, c));
  assert(kinName(ix, c, a));
});

Deno.test("kinNameFor names everyone in a generated family of a few hundred quickly", () => {
  const archive = generate(400, 11);
  const ix = indexArchive(archive);
  const viewer = archive.home ?? archive.people[0].id;
  const started = performance.now();
  let named = 0;
  for (const p of archive.people) if (kinNameFor(ix, viewer, p.id)) named++;
  const ms = performance.now() - started;
  assert(named > archive.people.length / 2, `only ${named} named`);
  assert(ms < 2000, `took ${ms.toFixed(0)} ms`);
});

type Raw = [Tie["kind"], string, string, Partial<Tie>?];

function raw(people: string[], ties: Raw[], events: Archive["events"] = []) {
  return indexArchive({
    people: people.map((id) => ({ id, name: id, pronouns: id === "B" ? "she/her" : undefined })),
    ties: ties.map(([kind, from, to, init], i) => ({ id: String(i), kind, from, to, ...init })),
    events,
  } as Archive);
}

const bio = "biological_parent";

Deno.test("kinPath ignores ties to people missing from the archive", () => {
  const ix = raw(["A", "B"], [[bio, "M", "A"], [bio, "M", "B"]]);
  assertEquals(kinPath(ix, "A", "B"), null);
  assertEquals(kinName(ix, "A", "B"), null);
  assertEquals(kinPath(ix, "A", "M"), null);
  assertEquals(kinPath(ix, "M", "M"), null);
});

Deno.test("kinName keeps siblings with both birth parents in common full despite separate adopters", () => {
  const ix = raw(["A", "B", "P", "Q", "X", "Y"], [
    [bio, "P", "A"],
    [bio, "Q", "A"],
    [bio, "P", "B"],
    [bio, "Q", "B"],
    ["adoptive_parent", "X", "A"],
    ["adoptive_parent", "Y", "B"],
  ]);
  assertEquals(kinName(ix, "A", "B"), "sister");
});

Deno.test("kinName calls a partnership former when its end can't be a partner's death", () => {
  const death = (date: string) =>
    [{ id: "d", kind: "death", people: ["B"], date }] as Archive["events"];
  const spouses: Raw[] = [["spouse", "A", "B", { start: "1990", end: "2010" }]];
  assertEquals(kinName(raw(["A", "B"], spouses, death("2000")), "A", "B"), "former wife");
  assertEquals(kinName(raw(["A", "B"], spouses, death("2010")), "A", "B"), "wife");
});

Deno.test("kinName ignores a self-tie when telling half siblings apart", () => {
  const ix = raw(["A", "B", "P", "Q"], [[bio, "P", "A"], [bio, "P", "B"], [bio, "A", "A"], [
    bio,
    "Q",
    "B",
  ]]);
  assertEquals(kinName(ix, "A", "B"), "sister");
});

Deno.test("kinName chains in the fewest pieces, counting in-law and step names as one", () => {
  const ix = raw(["A", "B", "P", "S"], [["spouse", "A", "S"], [bio, "P", "S"], [
    "chosen_family",
    "P",
    "B",
  ]]);
  assertEquals(kinName(ix, "A", "B"), "parent-in-law's chosen family");
});

Deno.test("kinName gives cousin ordinals past the word list English suffixes", () => {
  const ties: Raw[] = [];
  for (const side of ["L", "R"]) {
    let parent = "P";
    for (let i = 0; i < 22; i++) {
      ties.push([bio, parent, side + i]);
      parent = side + i;
    }
    ties.push([bio, parent, side === "L" ? "A" : "B"]);
  }
  const people = ["A", "B", "P", ...ties.map(([, , to]) => to)];
  assertEquals(kinName(raw(people, ties), "A", "B"), "22nd cousin");
  const ordinals = [1, 2, 3, 4, 11, 12, 13, 21, 23, 101, 111, 112, 122].map(COPY.kinship.ordinal);
  assertEquals(ordinals, [
    "1st",
    "2nd",
    "3rd",
    "4th",
    "11th",
    "12th",
    "13th",
    "21st",
    "23rd",
    "101st",
    "111th",
    "112th",
    "122nd",
  ]);
});
