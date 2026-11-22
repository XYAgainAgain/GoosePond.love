import { assert, assertEquals } from "@std/assert";
import { archiveBuilder } from "../records/builder.ts";
import { KINDS, type TieKind } from "../records/kinds.ts";
import { descentRows } from "./rows.ts";

const rankingKinds = (Object.keys(KINDS) as TieKind[]).filter((k) => KINDS[k].ranks);

Deno.test("partners share a row", () => {
  const b = archiveBuilder("test", true);
  const elder = b.person("Elder");
  const kid = b.person("Kid");
  const spouse = b.person("Spouse");
  const partner = b.person("Partner");
  b.parents("biological_parent", kid, elder);
  b.tie("spouse", kid, spouse);
  b.tie("partner", spouse, partner);
  const { row } = descentRows(b.archive);
  assertEquals(row.get(kid), 1);
  assertEquals(row.get(spouse), 1);
  assertEquals(row.get(partner), 1);
});

Deno.test("a child sits below every ranking parent", () => {
  assert(rankingKinds.includes("gamete_donor") && rankingKinds.includes("gestational_carrier"));
  for (const kind of rankingKinds) {
    const b = archiveBuilder("test", true);
    const elder = b.person("Elder");
    const kid = b.person("Kid");
    b.parents(kind, kid, elder);
    const { row } = descentRows(b.archive);
    assert(row.get(kid)! > row.get(elder)!, kind);
  }
});

Deno.test("a three-generation chain gives rows 0, 1, 2", () => {
  const b = archiveBuilder("test", true);
  const first = b.person("First");
  const second = b.person("Second");
  const third = b.person("Third");
  b.parents("biological_parent", second, first);
  b.parents("adoptive_parent", third, second);
  const { row, looped } = descentRows(b.archive);
  assertEquals([row.get(first), row.get(second), row.get(third)], [0, 1, 2]);
  assertEquals(looped, false);
});

Deno.test("a married-in person's parents sink beside the in-laws' generation", () => {
  const b = archiveBuilder("test", true);
  const grand = b.person("Grand");
  const inLaw = b.person("In-law");
  const kid = b.person("Kid");
  const marriedIn = b.person("Married in");
  const mother = b.person("Mother");
  const father = b.person("Father");
  b.parents("biological_parent", inLaw, grand);
  b.parents("biological_parent", kid, inLaw);
  b.tie("spouse", kid, marriedIn);
  b.parents("biological_parent", marriedIn, mother, father);
  const { row } = descentRows(b.archive);
  assertEquals(row.get(marriedIn), 2);
  assertEquals(row.get(mother), 1);
  assertEquals(row.get(father), 1);
  assertEquals(row.get(grand), 0);
});

Deno.test("a ranking loop sets looped and still returns a row for everyone", () => {
  const b = archiveBuilder("test", true);
  const x = b.person("X");
  const y = b.person("Y");
  const z = b.person("Z");
  const loner = b.person("Loner");
  b.parents("biological_parent", y, x);
  b.parents("guardian", z, y);
  b.parents("step_parent", x, z);
  const rows = descentRows(b.archive);
  assertEquals(rows.looped, true);
  for (const id of [x, y, z, loner]) assert(Number.isFinite(rows.row.get(id)));
});

Deno.test("a chain of partners keeps the middle partner between the others", () => {
  for (const flip of [false, true]) {
    const b = archiveBuilder("test", true);
    const pa = b.person("A");
    const pb = b.person("B");
    const pc = b.person("C");
    if (flip) {
      b.tie("partner", pc, pb);
      b.tie("spouse", pb, pa);
    } else {
      b.tie("spouse", pa, pb);
      b.tie("partner", pb, pc);
    }
    b.tie("spouse", pa, pb);
    const [members] = [...descentRows(b.archive).groups.values()];
    assertEquals(members.length, 3);
    assertEquals(members[1], pb);
  }
});

Deno.test("everyone sits in exactly one group, and group edges are clean", () => {
  const b = archiveBuilder("test", true);
  const p1 = b.person("P1");
  const p2 = b.person("P2");
  const k1 = b.person("K1");
  const k2 = b.person("K2");
  const solo = b.person("Solo");
  b.tie("spouse", p1, p2);
  b.parents("biological_parent", k1, p1, p2);
  b.parents("biological_parent", k2, p1, p2);
  b.parents("legal_parent", k2, p1);
  b.tie("partner", k1, k2);
  b.parents("step_parent", p2, p1);
  b.tie("chosen_family", solo, k1);
  const { groups, groupEdges, row } = descentRows(b.archive);
  const all = [...groups.values()].flat();
  assertEquals(all.length, b.archive.people.length);
  assertEquals(new Set(all).size, b.archive.people.length);
  assertEquals(row.size, b.archive.people.length);
  const keys = groupEdges.map(([up, down]) => `${up}>${down}`);
  assertEquals(new Set(keys).size, keys.length);
  assert(groupEdges.length > 0);
  for (const [up, down] of groupEdges) {
    assert(up !== down);
    assert(groups.has(up) && groups.has(down));
  }
});

Deno.test("ties to people not on record are ignored", () => {
  const b = archiveBuilder("test", true);
  const one = b.person("One");
  const two = b.person("Two");
  b.tie("spouse", one, "missing");
  b.tie("spouse", two, "missing");
  b.parents("biological_parent", one, "ghost");
  const { groups, row, groupEdges } = descentRows(b.archive);
  assertEquals(groups.size, 2);
  assertEquals(row.get(one), 0);
  assertEquals(groupEdges, []);
});

const groupOf = (groups: Map<string, string[]>, id: string) =>
  [...groups.values()].find((members) => members.includes(id))!;

Deno.test("parents of the same child sit side by side without a partnership", () => {
  const b = archiveBuilder("test", true);
  const mother = b.person("Mother");
  const father = b.person("Father");
  const later = b.person("Later spouse");
  const kid = b.person("Kid");
  b.parents("biological_parent", kid, mother, father);
  b.tie("spouse", mother, later);
  const seated = groupOf(descentRows(b.archive).groups, mother);
  assertEquals(seated.length, 3);
  assertEquals(Math.abs(seated.indexOf(mother) - seated.indexOf(father)), 1);
});

Deno.test("a donor is not seated with the parents", () => {
  const b = archiveBuilder("test", true);
  const mother = b.person("Mother");
  const donor = b.person("Donor");
  const kid = b.person("Kid");
  b.parents("biological_parent", kid, mother);
  b.parents("gamete_donor", kid, donor);
  assertEquals(groupOf(descentRows(b.archive).groups, mother), [mother]);
});

Deno.test("twins sit side by side, next to a spouse", () => {
  const b = archiveBuilder("test", true);
  const one = b.person("One");
  const two = b.person("Two");
  const spouse = b.person("Spouse");
  b.tie("identical_twin", one, two);
  b.tie("spouse", one, spouse);
  const seated = groupOf(descentRows(b.archive).groups, one);
  assertEquals(seated.length, 3);
  assertEquals(seated.indexOf(one), 1);
});

Deno.test("a grandparent who shares guardianship with a parent keeps their row", () => {
  const b = archiveBuilder("test", true);
  const grand = b.person("Grand");
  const parent = b.person("Parent");
  const kid = b.person("Kid");
  b.parents("biological_parent", parent, grand);
  b.parents("guardian", kid, grand, parent);
  const { row, looped } = descentRows(b.archive);
  assertEquals([row.get(grand), row.get(parent), row.get(kid)], [0, 1, 2]);
  assertEquals(looped, false);
});

Deno.test("chosen family with no other ties sits on the row of the person they're tied to", () => {
  const b = archiveBuilder("test", true);
  const elder = b.person("Elder");
  const kid = b.person("Kid");
  const friend = b.person("Friend");
  const friendsFriend = b.person("Friend's Friend");
  b.parents("biological_parent", kid, elder);
  b.tie("chosen_family", kid, friend);
  b.tie("sibling_by_custom", friendsFriend, friend);
  const { row } = descentRows(b.archive);
  assertEquals(row.get(friend), 1);
  assertEquals(row.get(friendsFriend), 1);
});
