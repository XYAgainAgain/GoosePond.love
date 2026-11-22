import { assertEquals } from "@std/assert";
import { archiveBuilder } from "./builder.ts";
import type { TieKind } from "./kinds.ts";
import { validate } from "./validate.ts";

const codes = (b: { archive: Parameters<typeof validate>[0] }) =>
  validate(b.archive).map((i) => i.code).toSorted();

Deno.test("a clean archive with many kinds of parents raises nothing", () => {
  const b = archiveBuilder("test", true);
  const child = b.person("Child", { born: "1990" });
  const kinds: TieKind[] = [
    "biological_parent",
    "biological_parent",
    "adoptive_parent",
    "adoptive_parent",
    "step_parent",
    "foster_parent",
    "guardian",
    "gamete_donor",
    "gestational_carrier",
  ];
  for (const kind of kinds) b.parents(kind, child, b.person("Elder", { born: "1960~" }));
  assertEquals(validate(b.archive), []);
});

Deno.test("duplicate ids are reported", () => {
  const b = archiveBuilder("test", true);
  const p = b.person("One");
  b.archive.people.push({ id: p, name: "Two" });
  assertEquals(codes(b), ["duplicate_id"]);
});

Deno.test("references to missing records are reported", () => {
  const b = archiveBuilder("test", true);
  const p = b.person("One");
  b.tie("spouse", p, "ghost");
  b.event("residence", [p], { place: "nowhere" });
  b.archive.claims.push({ id: "c1", about: "missing", statement: "?", certainty: "uncertain" });
  b.archive.interests.push({ id: "i1", holder: "nobody", place: "nowhere", role: "trustee" });
  assertEquals(codes(b), Array(5).fill("dangling_ref"));
});

Deno.test("a tie to oneself and an unknown kind are reported", () => {
  const b = archiveBuilder("test", true);
  const p = b.person("One");
  const q = b.person("Two");
  b.tie("spouse", p, p);
  b.tie("nemesis" as TieKind, p, q);
  assertEquals(codes(b), ["self_tie", "unknown_kind"]);
});

Deno.test("unreadable dates are reported wherever they sit", () => {
  const b = archiveBuilder("test", true);
  const p = b.person("One", { born: "long ago" });
  const q = b.person("Two");
  b.tie("spouse", p, q, { start: "1923/1919" });
  assertEquals(codes(b), ["bad_date", "bad_date"]);
});

Deno.test("an ending before its start is reported", () => {
  const b = archiveBuilder("test", true);
  const p = b.person("One", { born: "1950", died: "1949" });
  const q = b.person("Two");
  b.tie("spouse", p, q, { start: "1980", end: "1975" });
  assertEquals(codes(b), ["date_order", "date_order"]);
});

Deno.test("overlapping uncertain dates are not an ordering error", () => {
  const b = archiveBuilder("test", true);
  const p = b.person("One");
  const q = b.person("Two");
  b.tie("partner", p, q, { start: "1975/1982", end: "1980~" });
  assertEquals(codes(b), []);
});

Deno.test("a child born before a biological parent is an error", () => {
  const b = archiveBuilder("test", true);
  const child = b.person("Child", { born: "1900" });
  b.parents("biological_parent", child, b.person("Parent", { born: "1930" }));
  assertEquals(codes(b), ["born_before_parent"]);
});

Deno.test("an adoptive parent may be younger than the child", () => {
  const b = archiveBuilder("test", true);
  const child = b.person("Child", { born: "1900" });
  b.parents("adoptive_parent", child, b.person("Parent", { born: "1930" }));
  assertEquals(codes(b), []);
});

Deno.test("birth long after every biological parent died is a warning", () => {
  const b = archiveBuilder("test", true);
  const child = b.person("Child", { born: "1990" });
  b.parents(
    "biological_parent",
    child,
    b.person("A", { born: "1930", died: "1980" }),
    b.person("B", { born: "1932", died: "1985" }),
  );
  const issues = validate(b.archive);
  assertEquals(issues.map((i) => [i.level, i.code]), [["warning", "born_after_parents_died"]]);
});

Deno.test("birth within a year of the last parent's death is fine", () => {
  const b = archiveBuilder("test", true);
  const child = b.person("Child", { born: "1986" });
  b.parents(
    "biological_parent",
    child,
    b.person("A", { born: "1930", died: "1985" }),
    b.person("B", { born: "1932" }),
  );
  assertEquals(codes(b), []);
});

Deno.test("a home person who isn't on record is a dangling reference", () => {
  const b = archiveBuilder("test", true);
  b.archive.home = b.person("One");
  assertEquals(codes(b), []);
  b.archive.home = "ghost";
  assertEquals(codes(b), ["dangling_ref"]);
});
