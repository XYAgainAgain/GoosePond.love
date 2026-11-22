import { assert, assertEquals } from "@std/assert";
import { COPY } from "../copy.ts";
import { archiveBuilder } from "../records/builder.ts";
import type { Id } from "../records/types.ts";
import { familyConnectors } from "./connectors.ts";
import { LANE_STEP, LANE_TOP, ROW_GAP } from "./geometry.ts";
import { descentRows } from "./rows.ts";

const spread = (ids: Id[], step = 84) => new Map(ids.map((id, i) => [id, i * step]));

Deno.test("a couple's children hang from one point between them, on one bar", () => {
  const b = archiveBuilder("test", true);
  const mother = b.person("Mother");
  const father = b.person("Father");
  const kids = [b.person("One"), b.person("Two"), b.person("Three")];
  b.tie("spouse", mother, father);
  for (const k of kids) b.parents("biological_parent", k, mother, father);
  const c = familyConnectors(b.archive, descentRows(b.archive), spread([mother, father, ...kids]));
  assertEquals(c.joints.length, 1);
  assertEquals(c.joints[0].x, 42);
  const drops = c.lines.filter((l) => l.source === c.joints[0].id);
  assertEquals(drops.map((l) => l.target).sort(), [...kids].sort());
  assertEquals(new Set(drops.map((l) => l.turn)), new Set([LANE_TOP]));
  assertEquals(c.covered.size, 6);
});

Deno.test("parents without a partnership each drop to the family bar", () => {
  const b = archiveBuilder("test", true);
  const mother = b.person("Mother");
  const father = b.person("Father");
  const kid = b.person("Kid");
  b.parents("biological_parent", kid, mother, father);
  const c = familyConnectors(b.archive, descentRows(b.archive), spread([mother, father, kid]));
  const joint = c.joints[0];
  assertEquals(joint.y, LANE_TOP - 1);
  const ups = c.lines.filter((l) => l.target === joint.id).map((l) => l.source).sort();
  assertEquals(ups, [mother, father].sort());
});

Deno.test("a child of partners seated apart hangs from their bar, not the seat between them", () => {
  const b = archiveBuilder("test", true);
  const [p1, p2, p3, p4] = ["A", "B", "C", "D"].map((n) => b.person(n));
  for (const other of [p1, p3, p4]) b.tie("partner", p2, other);
  const kid = b.person("Kid");
  b.parents("biological_parent", kid, p2, p4);
  const c = familyConnectors(b.archive, descentRows(b.archive), spread([p1, p2, p3, p4, kid]));
  assertEquals(c.joints[0].y, LANE_TOP - 1);
  assertEquals(c.lines.filter((l) => l.target === c.joints[0].id).length, 2);
});

Deno.test("connector ids never take a record's id", () => {
  const b = archiveBuilder("test", true);
  const parent = b.person("Parent");
  const kid = b.person("Kid");
  b.archive.people[0].id = "bus:0";
  b.parents("biological_parent", kid, "bus:0");
  const c = familyConnectors(b.archive, descentRows(b.archive), spread(["bus:0", kid]));
  assertEquals(parent, "p1");
  assert(c.joints.every((j) => j.id !== "bus:0" && !j.id.startsWith("bus:0:")));
});

Deno.test("overlapping bars in one gap take separate lanes, and a busy gap grows", () => {
  const b = archiveBuilder("test", true);
  const people: Id[] = [];
  const x = new Map<Id, number>();
  for (let i = 0; i < 8; i++) {
    const parent = b.person(`Parent ${i}`);
    const kid = b.person(`Kid ${i}`);
    b.parents("biological_parent", kid, parent);
    x.set(parent, i * 10);
    x.set(kid, 500 + i * 10);
    people.push(parent, kid);
  }
  const c = familyConnectors(b.archive, descentRows(b.archive), x);
  const turns = c.lines.map((l) => l.turn);
  assertEquals(new Set(turns).size, 8);
  assertEquals(Math.max(...(turns as number[])), LANE_TOP + 7 * LANE_STEP);
  assert(c.rowY[1] > ROW_GAP);
});

Deno.test("a quiet gap keeps the standard row height", () => {
  const b = archiveBuilder("test", true);
  const parent = b.person("Parent");
  const kid = b.person("Kid");
  b.parents("biological_parent", kid, parent);
  const c = familyConnectors(b.archive, descentRows(b.archive), spread([parent, kid]));
  assertEquals(c.rowY, [0, ROW_GAP]);
});

Deno.test("twins fork from one point, identical twins get a bar, and the ties are drawn", () => {
  const b = archiveBuilder("test", true);
  const mother = b.person("Mother");
  const father = b.person("Father");
  const helen = b.person("Helen");
  const susan = b.person("Susan");
  const kid = b.person("Kid");
  b.tie("spouse", mother, father);
  for (const k of [helen, susan, kid]) b.parents("biological_parent", k, mother, father);
  const twinTie = b.tie("identical_twin", helen, susan);
  const c = familyConnectors(
    b.archive,
    descentRows(b.archive),
    spread([mother, father, helen, susan, kid]),
  );
  const fork = c.joints.find((j) => /:twins\d+$/.test(j.id))!;
  const legs = c.lines.filter((l) => l.source === fork.id).map((l) => l.target).sort();
  assertEquals(legs, [helen, susan].sort());
  assertEquals(c.joints.find((j) => j.label)?.label, COPY.map.bornTogether(2));
  assert(c.lines.some((l) => l.kind === "identical_twin"));
  assert(c.covered.has(twinTie));
});

Deno.test("each donor gets a separate connector", () => {
  const b = archiveBuilder("test", true);
  const mother = b.person("Mother");
  const donor = b.person("Donor");
  const kid = b.person("Kid");
  b.parents("biological_parent", kid, mother);
  b.parents("gamete_donor", kid, donor);
  const c = familyConnectors(b.archive, descentRows(b.archive), spread([mother, donor, kid]));
  assertEquals(c.joints.length, 2);
  assertEquals(new Set(c.joints.map((j) => j.family)), new Set(["lineage", "assisted"]));
});

Deno.test("a tie in a ranking loop is left as a plain line", () => {
  const b = archiveBuilder("test", true);
  const one = b.person("One");
  const two = b.person("Two");
  const up = b.tie("biological_parent", one, two);
  const down = b.tie("biological_parent", two, one);
  const c = familyConnectors(b.archive, descentRows(b.archive), spread([one, two]));
  assertEquals([c.covered.has(up), c.covered.has(down)].filter(Boolean).length, 1);
});

Deno.test("triplets share one fork, and an identical pair among them gets the bar", () => {
  const b = archiveBuilder("test", true);
  const mother = b.person("Mother");
  const father = b.person("Father");
  const kids = [b.person("Ola"), b.person("Per"), b.person("Siv")];
  b.tie("spouse", mother, father);
  for (const k of kids) b.parents("biological_parent", k, mother, father);
  b.tie("identical_twin", kids[0], kids[1]);
  b.tie("twin", kids[1], kids[2]);
  const c = familyConnectors(b.archive, descentRows(b.archive), spread([mother, father, ...kids]));
  const fork = c.joints.find((j) => /:twins\d+$/.test(j.id))!;
  assertEquals(c.lines.filter((l) => l.source === fork.id).length, 3);
  assertEquals(c.joints.find((j) => j.label)?.label, COPY.map.bornTogether(3));
  assertEquals(c.lines.filter((l) => l.kind === "identical_twin").length, 1);
});
