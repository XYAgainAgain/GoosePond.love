import { assertEquals } from "@std/assert";
import { surnameParts } from "./surnames.ts";

const parts = (name: string, extra: { birthName?: string; surname?: string } = {}) =>
  surnameParts({ id: "p", name, ...extra });

Deno.test("the last word of the name is the family name", () => {
  assertEquals(parts("Frodo Baggins"), ["baggins"]);
  assertEquals(parts("Mary Ellen Smith"), ["smith"]);
});

Deno.test("a hyphenated name gives each piece", () => {
  assertEquals(parts("Lotho Sackville-Baggins"), ["sackville", "baggins"]);
  assertEquals(parts("Ada Hart-Lowe"), ["hart", "lowe"]);
});

Deno.test("generational numbers and suffixes are skipped", () => {
  assertEquals(parts("Peregrin Took I"), ["took"]);
  assertEquals(parts("Isumbras Took IV"), ["took"]);
  assertEquals(parts("John Smith, Jr."), ["smith"]);
});

Deno.test("a place or an epithet is not a family name", () => {
  assertEquals(parts("Diamond of Long Cleeve"), []);
  assertEquals(parts("Harding of the Hill"), []);
  assertEquals(parts("Holman the greenhanded"), []);
  assertEquals(parts("Hamfast of Gamwich"), []);
});

Deno.test("a single name has no family name", () => {
  assertEquals(parts("May"), []);
});

Deno.test("the name at birth wins over the current name", () => {
  assertEquals(parts("Ada Lowe", { birthName: "Ada Hart" }), ["hart"]);
});

Deno.test("a recorded family name wins over both", () => {
  assertEquals(parts("Ada Lowe", { birthName: "Ada Hart", surname: "Hart-Lowe" }), [
    "hart",
    "lowe",
  ]);
  assertEquals(parts("Diamond of Long Cleeve", { surname: "Cleeve" }), ["cleeve"]);
});

Deno.test("lowercase particles stay with the family name", () => {
  assertEquals(parts("Juan de la Cruz"), ["de la cruz"]);
  assertEquals(parts("Ana Cruz"), ["cruz"]);
});

Deno.test("a name written family-first takes the part before the comma", () => {
  assertEquals(parts("Smith, Mary Ellen"), ["smith"]);
  assertEquals(parts("de la Cruz, Juan"), ["de la cruz"]);
});
