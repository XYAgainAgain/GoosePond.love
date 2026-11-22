import { assertEquals, assertMatch, assertNotEquals } from "@std/assert";
import type { Person } from "../records/types.ts";
import { branchKey, branchTones, oklchHex, ringColor } from "./branches.ts";

const people = (...names: string[]): Person[] => names.map((name, i) => ({ id: `p${i}`, name }));

Deno.test("branches keep their tones when a new family joins", () => {
  const before = branchTones(people("A Foley", "B Foley", "C Hankin"));
  const after = branchTones(
    people("A Foley", "B Foley", "C Hankin", "D Quill", "E Quill", "F Hankin", "G Hankin"),
  );
  assertEquals(after.get("p0"), before.get("p0"));
  assertEquals(after.get("p2"), before.get("p2"));
});

Deno.test("distinct branches get distinct tones, and a hyphenated name carries both", () => {
  const tones = branchTones(
    people("A Baggins", "B Baggins", "C Baggins", "D Took", "E Took", "F Took-Baggins"),
  );
  const baggins = tones.get("p0")!;
  const took = tones.get("p3")!;
  assertEquals(baggins.length, 1);
  assertNotEquals(baggins[0], took[0]);
  assertEquals(tones.get("p5"), [took[0], baggins[0]]);
});

Deno.test("a married-in spouse keeps the color of their family name at birth", () => {
  const list = people("A Foley", "B Foley", "C Hankin");
  list[2] = { ...list[2], name: "C Foley", birthName: "C Hankin" };
  const tones = branchTones(list);
  assertNotEquals(tones.get("p2"), tones.get("p0"));
});

Deno.test("no family name means no tone, and the palette runs out after 24 branches", () => {
  const names = Array.from({ length: 25 }, (_, i) => `Kid Family${String(i).padStart(2, "0")}`);
  const tones = branchTones([...people(...names), { id: "solo", name: "May" }]);
  assertEquals(tones.get("solo"), []);
  assertEquals(tones.get("p24"), []);
  assertEquals(tones.get("p23")!.length, 1);
});

Deno.test("OKLCH converts to sRGB hex", () => {
  assertEquals(oklchHex(0, 0, 0), "#000000");
  assertEquals(oklchHex(1, 0, 0), "#ffffff");
  assertMatch(ringColor({ h: 262, l: 0.76 }), /^#[0-9a-f]{6}$/);
});

Deno.test("the key lists each branch once, as first written, in its map tone", () => {
  const list = people("A Hankin-Foley", "B Foley", "C de la Cruz");
  const key = branchKey(list);
  assertEquals(key.map((k) => k.name), ["Hankin", "Foley", "de la Cruz"]);
  assertEquals(key[1].tone, branchTones(list).get("p1")![0]);
});
