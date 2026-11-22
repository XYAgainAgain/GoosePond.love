import { assert, assertEquals } from "@std/assert";
import { archiveBuilder } from "../records/builder.ts";
import { indexArchive, neighborhood } from "../records/queries.ts";
import { generate } from "../sources/generate.ts";
import { ringSpots } from "./rings.ts";

const center = { x: 500, y: -200 };
const away = (p: { x: number; y: number }) =>
  Math.round(Math.hypot(p.x - center.x, p.y - center.y));

Deno.test("each ring holds exactly the people that many ties away", () => {
  const a = generate(120, 7);
  const ix = indexArchive(a);
  const root = a.people[40].id;
  const { spots, rings } = ringSpots(ix, root, center, new Map());
  assertEquals(spots.size, a.people.length);
  assertEquals(
    rings.map((r) => Math.round(r.radius)),
    [...new Set([...spots.values()].map(away))].sort((x, y) => x - y).slice(1),
  );
  const radii = [...new Set([...spots.values()].map(away))].sort((x, y) => x - y);
  assertEquals(radii[0], 0);
  for (let k = 1; k < radii.length; k++) {
    const ring = a.people.filter((p) => away(spots.get(p.id)!) === radii[k]).map((p) => p.id);
    const inner = neighborhood(ix, root, k - 1), outer = neighborhood(ix, root, k);
    const expected = a.people.filter((p) => outer.has(p.id) && !inner.has(p.id)).map((p) => p.id);
    if (expected.length === 0) continue;
    assertEquals(new Set(ring), new Set(expected), `ring ${k}`);
  }
});

Deno.test("parents sit above, children below, and the unconnected go on the outside", () => {
  const b = archiveBuilder("rings", true);
  const mum = b.person("Mira"), kid = b.person("Kit"), baby = b.person("Bo");
  const loner = b.person("Lone");
  b.parents("biological_parent", kid, mum);
  b.parents("biological_parent", baby, kid);
  const ix = indexArchive(b.archive);
  const { spots, rings } = ringSpots(ix, kid, center, new Map());
  assertEquals(rings.map((r) => r.away), [1, null]);
  assert(spots.get(mum)!.y < center.y);
  assert(spots.get(baby)!.y > center.y);
  assertEquals(away(spots.get(mum)!), away(spots.get(baby)!));
  assert(away(spots.get(loner)!) > away(spots.get(mum)!));
  assertEquals(spots.get(kid), center);
});

Deno.test("a big ring widens so neighbors keep their spacing", () => {
  const b = archiveBuilder("crowd", true);
  const hub = b.person("Hub");
  const kids = Array.from({ length: 40 }, (_, i) => b.person(`Kid ${i}`));
  for (const k of kids) b.parents("biological_parent", k, hub);
  const { spots } = ringSpots(indexArchive(b.archive), hub, center, new Map());
  const [p, q] = [spots.get(kids[0])!, spots.get(kids[1])!];
  assert(Math.hypot(p.x - q.x, p.y - q.y) >= 99);
});
