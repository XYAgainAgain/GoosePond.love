import { assertEquals } from "@std/assert";
import { COPY } from "../copy.ts";
import { archiveBuilder } from "../records/builder.ts";
import {
  addPerson,
  addTie,
  removePerson,
  removeTie,
  setHome,
  updatePerson,
} from "../records/edit.ts";
import { describeChange } from "./changes.ts";

function family() {
  const b = archiveBuilder("Test", true);
  const ann = b.person("Ann", { born: "1950" });
  const bo = b.person("Bo");
  const tie = b.tie("spouse", ann, bo);
  return { a: b.archive, ann, bo, tie };
}

Deno.test("a new relative reads as the person added, not the tie that came with them", () => {
  const { a, ann } = family();
  const made = addPerson(a, { name: "Cy" });
  const next = addTie(made.archive, "biological_parent", ann, made.id).archive;
  assertEquals(describeChange(a, next), COPY.changes.added("Cy"));
});

Deno.test("ties added, removed, and people removed are named", () => {
  const { a, ann, bo, tie } = family();
  assertEquals(describeChange(a, removeTie(a, tie)), COPY.changes.untied("Ann", "Bo"));
  const back = addTie(removeTie(a, tie), "partner", bo, ann).archive;
  assertEquals(describeChange(removeTie(a, tie), back), COPY.changes.tied("Bo", "Ann"));
  assertEquals(describeChange(a, removePerson(a, bo)), COPY.changes.removed("Bo"));
});

Deno.test("a changed birth year names the person whose event moved", () => {
  const { a, ann } = family();
  const next = updatePerson(a, ann, { name: "Ann", born: "1951" });
  assertEquals(describeChange(a, next), COPY.changes.updated("Ann"));
});

Deno.test("moving the home person says where the map opens", () => {
  const { a, bo } = family();
  assertEquals(describeChange(a, setHome(a, bo)), COPY.changes.home("Bo"));
});
