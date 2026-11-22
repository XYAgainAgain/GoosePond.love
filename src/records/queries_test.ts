import { assertEquals } from "@std/assert";
import { archiveBuilder } from "./builder.ts";
import { indexArchive, lifeDates, neighborhood, siblingsOf } from "./queries.ts";

function household() {
  const b = archiveBuilder("test", true);
  const mum = b.person("Mum", { born: "1950" });
  const dad = b.person("Dad", { born: "1948", died: "2010~" });
  const step = b.person("Step");
  const donor = b.person("Donor");
  const full = b.person("Full");
  const me = b.person("Me", { born: "1980-02-11" });
  const half = b.person("Half");
  const stepKid = b.person("Step kid");
  const donorKid = b.person("Donor kid");
  b.tie("spouse", mum, dad);
  b.tie("spouse", mum, step);
  b.parents("biological_parent", me, mum, dad);
  b.parents("biological_parent", full, mum, dad);
  b.parents("biological_parent", half, mum);
  b.parents("step_parent", me, step);
  b.parents("biological_parent", stepKid, step);
  b.parents("gamete_donor", me, donor);
  b.parents("gamete_donor", donorKid, donor);
  return { ix: indexArchive(b.archive), mum, dad, step, donor, full, me, half, stepKid, donorKid };
}

Deno.test("lifeDates reads birth and death events", () => {
  const h = household();
  assertEquals(lifeDates(h.ix, h.dad), { born: "1948", died: "2010~" });
  assertEquals(lifeDates(h.ix, h.me), { born: "1980-02-11", died: undefined });
  assertEquals(lifeDates(h.ix, h.step), { born: undefined, died: undefined });
});

Deno.test("siblings come from shared parent figures, and say which", () => {
  const h = household();
  const byId = new Map(siblingsOf(h.ix, h.me).map((s) => [s.id, s.shared.toSorted()]));
  assertEquals(byId.get(h.full), [h.mum, h.dad].toSorted());
  assertEquals(byId.get(h.half), [h.mum]);
  assertEquals(byId.get(h.stepKid), [h.step]);
});

Deno.test("a shared donor does not make siblings", () => {
  const h = household();
  assertEquals(siblingsOf(h.ix, h.me).some((s) => s.id === h.donorKid), false);
  assertEquals(siblingsOf(h.ix, h.donorKid), []);
});

Deno.test("neighborhood grows one tie per hop and includes the start", () => {
  const h = household();
  assertEquals(neighborhood(h.ix, h.donorKid, 0), new Set([h.donorKid]));
  assertEquals(neighborhood(h.ix, h.donorKid, 1), new Set([h.donorKid, h.donor]));
  assertEquals(neighborhood(h.ix, h.donorKid, 2), new Set([h.donorKid, h.donor, h.me]));
});

Deno.test("an unknown person has no ties or events", () => {
  const h = household();
  assertEquals(h.ix.person("nobody"), undefined);
  assertEquals(h.ix.tiesOf("nobody"), []);
  assertEquals(h.ix.eventsOf("nobody"), []);
});

Deno.test("lifeDates reads only events whose first person is the subject", () => {
  const b = archiveBuilder("test", true);
  const twin = b.person("Twin");
  const parent = b.person("Parent", { born: "1960" });
  b.event("birth", [twin, parent], { date: "1990" });
  b.event("death", [parent, twin], { date: "2001" });
  const ix = indexArchive(b.archive);
  assertEquals(lifeDates(ix, parent), { born: "1960", died: "2001" });
  assertEquals(lifeDates(ix, twin), { born: "1990", died: undefined });
});
