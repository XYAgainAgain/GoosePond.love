import { assertEquals, assertThrows } from "@std/assert";
import { validate } from "../records/validate.ts";
import { fixture } from "./fixture.ts";
import { checkArchive } from "./private.ts";

const PIXEL = "data:image/png;base64,iVBORw0KGgo=";

Deno.test("a bare version 1 file becomes an empty private archive", () => {
  const a = checkArchive({ version: 1 });
  assertEquals(a.people, []);
  assertEquals(a.synthetic, false);
  assertEquals(a.title, "Family file");
});

Deno.test("anything that isn't a version 1 object is refused", () => {
  for (const raw of [null, 7, "x", [], {}, { version: 2 }, { version: 1, people: {} }]) {
    assertThrows(() => checkArchive(raw), Error);
  }
});

Deno.test("a record missing a required string is refused", () => {
  assertThrows(() => checkArchive({ version: 1, people: [{ id: "p1", name: 7 }] }), Error);
  assertThrows(() => checkArchive({ version: 1, people: [{ name: "Wren" }] }), Error);
  assertThrows(() => checkArchive({ version: 1, people: ["Wren"] }), Error);
  assertThrows(
    () => checkArchive({ version: 1, ties: [{ id: "t1", kind: "spouse", from: "p1" }] }),
    Error,
  );
});

Deno.test("optional fields of the wrong type are dropped, not kept", () => {
  const a = checkArchive({
    version: 1,
    people: [{ id: "p1", name: "Wren", bio: 9, aliases: "W", living: "yes", pronouns: "they" }],
    events: [{ id: "e1", kind: "birth", people: "p1", date: 1950 }],
  });
  assertEquals(a.people[0], { id: "p1", name: "Wren", pronouns: "they" });
  assertEquals(a.events[0], { id: "e1", kind: "birth", people: [] });
});

Deno.test("only embedded images survive as a media source", () => {
  const media = (src: unknown) =>
    checkArchive({
      version: 1,
      media: [{ id: "m1", kind: "photo", title: "Wren", people: [], src }],
    }).media[0].src;
  assertEquals(media(PIXEL), PIXEL);
  assertEquals(media("https://example.com/wren.jpg"), undefined);
  assertEquals(media("javascript:alert(1)"), undefined);
  assertEquals(media("data:text/html;base64,PGI+"), undefined);
  assertEquals(media("data:image/svg+xml;base64,PHN2Zz4="), undefined);
});

Deno.test("the home person and title carry through", () => {
  const a = checkArchive({
    version: 1,
    title: "Ours",
    home: "p1",
    people: [{ id: "p1", name: "Wren" }],
  });
  assertEquals(a.home, "p1");
  assertEquals(a.title, "Ours");
});

Deno.test("a saved copy of the fixture reads back with no errors", () => {
  const copy = checkArchive(JSON.parse(JSON.stringify(fixture())));
  assertEquals(validate(copy).filter((i) => i.level === "error"), []);
  assertEquals(copy.people.length, fixture().people.length);
});

Deno.test("a family name and a mark survive the file check, and wrong types are dropped", () => {
  const a = checkArchive({
    version: 1,
    people: [
      { id: "p1", name: "Wren", surname: "Hart-Lowe", badge: "★" },
      { id: "p2", name: "Ash", surname: 5, badge: ["♛"] },
    ],
  });
  assertEquals(a.people[0], { id: "p1", name: "Wren", surname: "Hart-Lowe", badge: "★" });
  assertEquals(a.people[1], { id: "p2", name: "Ash" });
});
