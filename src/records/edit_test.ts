import { assert, assertEquals, assertThrows } from "@std/assert";
import { archiveBuilder } from "./builder.ts";
import {
  addPerson,
  addRelative,
  addTie,
  newId,
  parseLooseDate,
  removePerson,
  removeTie,
  setHome,
  setPortrait,
  updatePerson,
  updateTie,
} from "./edit.ts";
import { indexArchive, lifeDates } from "./queries.ts";
import type { Archive, Id } from "./types.ts";
import { validate } from "./validate.ts";

function household() {
  const b = archiveBuilder("test", false);
  const ada = b.person("Ada Brill", { born: "1950", died: "2012" });
  const bo = b.person("Bo Brill", { born: "1948" });
  const cy = b.person("Cy Brill", { born: "1980" });
  b.tie("spouse", ada, bo);
  b.parents("biological_parent", cy, ada, bo);
  const wedding = b.event("marriage", [ada, bo], { date: "1975" });
  const home = b.id("pl");
  b.archive.places.push({ id: home, name: "Wren" });
  b.archive.interests.push({ id: "i1", holder: ada, place: home, role: "trustee" });
  b.archive.media.push({ id: "m1", kind: "photo", title: "Ada", people: [ada], src: "data:," });
  b.archive.media.push({ id: "m2", kind: "photo", title: "All", people: [ada, bo, cy] });
  b.archive.people[0].portrait = "m1";
  b.archive.claims.push(
    { id: "c1", about: ada, statement: "Kept bees", certainty: "family_account" },
    { id: "c2", about: "i1", statement: "Per the deed", certainty: "documented" },
    { id: "c3", about: "c2", statement: "Deed seen", certainty: "uncertain" },
    { id: "c4", about: bo, statement: "Sang", certainty: "uncertain" },
  );
  b.archive.home = ada;
  return { a: b.archive, ada, bo, cy, wedding };
}

function unchanged<T>(input: T, run: (input: T) => unknown) {
  const before = structuredClone(input);
  run(input);
  assertEquals(input, before);
}

const own = (a: Archive, id: Id) =>
  a.events.filter((e) => e.people.length === 1 && e.people[0] === id).map((e) => [e.kind, e.date]);

Deno.test("newId gives distinct ids with the prefix", () => {
  const ids = new Set(Array.from({ length: 1000 }, () => newId("p")));
  assertEquals(ids.size, 1000);
  for (const id of ids) assert(/^p[0-9a-z]{10}$/.test(id), id);
});

Deno.test("addPerson trims, drops empty strings, and makes birth and death events", () => {
  const { a } = household();
  const { archive, id } = addPerson(a, {
    name: "  Dee Fenn ",
    born: "1990",
    died: "2020",
    living: true,
    pronouns: " ",
    bio: "",
    birthName: " Dee Holt ",
  });
  assertEquals(archive.people.at(-1), {
    id,
    name: "Dee Fenn",
    living: false,
    birthName: "Dee Holt",
  });
  assertEquals(own(archive, id), [["birth", "1990"], ["death", "2020"]]);
  assertEquals(lifeDates(indexArchive(archive), id), { born: "1990", died: "2020" });
});

Deno.test("addPerson and updatePerson reject an empty name", () => {
  const { a, cy } = household();
  assertThrows(() => addPerson(a, { name: "   " }), Error, "name");
  assertThrows(() => updatePerson(a, cy, { name: "" }), Error, "name");
});

Deno.test("updatePerson creates, changes, and removes their own life events", () => {
  const { a, ada, bo, wedding } = household();
  let b = updatePerson(a, bo, { name: "Bo Brill", born: "1949", died: "2015" });
  assertEquals(own(b, bo), [["birth", "1949"], ["death", "2015"]]);
  assertEquals(b.people.find((p) => p.id === bo)?.living, false);
  b = updatePerson(b, bo, { name: "Bo Brill", living: true });
  assertEquals(own(b, bo), []);
  assertEquals(b.people.find((p) => p.id === bo), { id: bo, name: "Bo Brill", living: true });
  assertEquals(b.events.find((e) => e.id === wedding), a.events.find((e) => e.id === wedding));
  b = updatePerson(b, ada, { name: "Ada Brill", born: "1950" });
  assertEquals(own(b, ada), [["birth", "1950"]]);
  assertEquals(b.people.find((p) => p.id === ada)?.portrait, "m1");
});

Deno.test("updatePerson leaves events that list other people alone", () => {
  const { a, ada, bo } = household();
  a.events.push({ id: "shared", kind: "birth", people: [bo, ada], date: "1948" });
  const b = updatePerson(a, ada, { name: "Ada Brill" });
  assertEquals(b.events.find((e) => e.id === "shared"), a.events.at(-1));
});

Deno.test("removePerson clears every trace of them", () => {
  const { a, ada, bo, cy, wedding } = household();
  const b = removePerson(a, ada);
  assertEquals(b.people.map((p) => p.id), [bo, cy]);
  assertEquals(b.ties.filter((t) => t.from === ada || t.to === ada), []);
  assertEquals(b.events.some((e) => e.people.includes(ada)), false);
  assertEquals(b.events.find((e) => e.id === wedding)?.people, [bo]);
  assertEquals(b.interests, []);
  assertEquals(b.media.map((m) => [m.id, m.people]), [["m2", [bo, cy]]]);
  assertEquals(b.claims.map((c) => c.id), ["c4"]);
  assertEquals(b.home, undefined);
  assertEquals(validate(b), []);
});

Deno.test("removePerson drops a birth they are the subject of, even with others listed", () => {
  const { a, ada, bo } = household();
  a.events.push({ id: "twinBirth", kind: "birth", people: [ada, bo], date: "1950" });
  const b = removePerson(a, ada);
  assertEquals(b.events.some((e) => e.id === "twinBirth"), false);
  assertEquals(lifeDates(indexArchive(b), bo), { born: "1948", died: undefined });
});

Deno.test("removePerson keeps home when it points at someone else", () => {
  const { a, bo, cy } = household();
  assertEquals(removePerson(setHome(a, bo), cy).home, bo);
});

Deno.test("addTie rejects self-ties, missing people, and duplicates", () => {
  const { a, ada, bo, cy } = household();
  assertThrows(() => addTie(a, "spouse", ada, ada), Error, "themselves");
  assertThrows(() => addTie(a, "spouse", ada, "ghost"), Error, "isn't in");
  assertThrows(() => addTie(a, "spouse", bo, ada), Error, "already");
  assertThrows(() => addTie(a, "biological_parent", ada, cy), Error, "already");
  const { archive, id } = addTie(a, "partner", bo, ada, { start: " 1970 ", note: "" });
  assertEquals(archive.ties.at(-1), { id, kind: "partner", from: bo, to: ada, start: "1970" });
  const reversed = addTie(a, "biological_parent", cy, ada);
  assertEquals(reversed.archive.ties.at(-1)?.from, cy);
});

Deno.test("updateTie rewrites its dates and note, and removeTie drops it and its claims", () => {
  const { a, ada, bo } = household();
  const tie = a.ties[0].id;
  a.claims.push({ id: "ct", about: tie, statement: "Eloped", certainty: "uncertain" });
  let b = updateTie(a, tie, { start: "1975", end: "1990", note: "Met at the lake" });
  assertEquals(b.ties[0], {
    id: tie,
    kind: "spouse",
    from: ada,
    to: bo,
    start: "1975",
    end: "1990",
    note: "Met at the lake",
  });
  b = updateTie(b, tie, { start: "1976" });
  assertEquals(b.ties[0], { id: tie, kind: "spouse", from: ada, to: bo, start: "1976" });
  b = removeTie(b, tie);
  assertEquals(b.ties.some((t) => t.id === tie), false);
  assertEquals(b.claims.some((c) => c.id === "ct"), false);
});

Deno.test("setPortrait creates, replaces, and removes one photo record", () => {
  const { a, cy } = household();
  let b = setPortrait(a, cy, "data:image/png;base64,AAAA");
  const portrait = b.people.find((p) => p.id === cy)?.portrait;
  assert(portrait);
  assertEquals(b.media.at(-1), {
    id: portrait,
    kind: "photo",
    title: "Cy Brill",
    people: [cy],
    src: "data:image/png;base64,AAAA",
  });
  b = setPortrait(b, cy, "data:image/png;base64,BBBB");
  assertEquals(b.media.length, a.media.length + 1);
  assertEquals(b.media.find((m) => m.id === portrait)?.src, "data:image/png;base64,BBBB");
  b = setPortrait(b, cy, null);
  assertEquals(b.media, a.media);
  assertEquals(b.people.find((p) => p.id === cy)?.portrait, undefined);
});

Deno.test("setHome sets and clears the home person", () => {
  const { a, bo } = household();
  assertEquals(setHome(a, bo).home, bo);
  assertEquals("home" in setHome(a, null), false);
  assertThrows(() => setHome(a, "ghost"), Error);
});

Deno.test("no edit changes its input", () => {
  const { a, ada, bo, cy } = household();
  const tie = a.ties[0].id;
  unchanged(a, (x) => addPerson(x, { name: "New", born: "2000" }));
  unchanged(a, (x) => updatePerson(x, ada, { name: "Ada", born: "1951" }));
  unchanged(a, (x) => removePerson(x, ada));
  unchanged(a, (x) => addTie(x, "partner", bo, cy));
  unchanged(a, (x) => updateTie(x, tie, { note: "x" }));
  unchanged(a, (x) => removeTie(x, tie));
  unchanged(a, (x) => setPortrait(x, ada, "data:,new"));
  unchanged(a, (x) => setPortrait(x, ada, null));
  unchanged(a, (x) => setPortrait(x, cy, "data:,new"));
  unchanged(a, (x) => setHome(x, bo));
  unchanged(a, (x) => setHome(x, null));
});

Deno.test("a mixed run of edits leaves a valid archive", () => {
  const { a, ada, bo, cy } = household();
  let b = a;
  const kid = addPerson(b, { name: "Eli Brill", born: "2005" });
  b = kid.archive;
  b = addTie(b, "biological_parent", cy, kid.id).archive;
  const partner = addPerson(b, { name: "Fay Orr", born: "1982" });
  b = partner.archive;
  const ended = addTie(b, "partner", cy, partner.id, { start: "2001", end: "2009" });
  b = ended.archive;
  b = setPortrait(b, kid.id, "data:,kid");
  b = setHome(b, kid.id);
  b = updatePerson(b, bo, { name: "Bo Brill", born: "1948", died: "2019" });
  b = updateTie(b, ended.id, { start: "2002" });
  b = removePerson(b, ada);
  b = removeTie(b, b.ties.find((t) => t.from === bo && t.to === cy)!.id);
  b = setPortrait(b, kid.id, null);
  b = removePerson(b, kid.id);
  assertEquals(validate(b), []);
  assertEquals(b.home, undefined);
  assertEquals(b.people.map((p) => p.name), ["Bo Brill", "Cy Brill", "Fay Orr"]);
});

Deno.test("parseLooseDate reads what a relative might type", () => {
  const cases: [string, string][] = [
    ["1950", "1950"],
    ["1950-04", "1950-04"],
    ["1950-04-03", "1950-04-03"],
    ["about 1950", "1950~"],
    ["Around 1950", "1950~"],
    ["circa 1950", "1950~"],
    ["c. 1950", "1950~"],
    ["c1950", "1950~"],
    ["~1950", "1950~"],
    ["1950?", "1950~"],
    ["1950~", "1950~"],
    ["1948-1952", "1948/1952"],
    ["1948–1952", "1948/1952"],
    ["1948 to 1952", "1948/1952"],
    ["between 1948 and 1952", "1948/1952"],
    ["1948/1952", "1948/1952"],
    ["April 1950", "1950-04"],
    ["Apr 1950", "1950-04"],
    ["April 3, 1950", "1950-04-03"],
    ["3 April 1950", "1950-04-03"],
    ["4/3/1950", "1950-04-03"],
    ["  ABOUT   1950  ", "1950~"],
    ["between about 1948 and June 1952", "1948~/1952-06"],
    ["Feb 29, 2000", "2000-02-29"],
  ];
  for (const [text, date] of cases) assertEquals(parseLooseDate(text), { date, ok: true }, text);
});

Deno.test("parseLooseDate gives nothing for empty text and fails on the unreadable", () => {
  assertEquals(parseLooseDate(""), { ok: true });
  assertEquals(parseLooseDate("   "), { ok: true });
  for (
    const text of [
      "sometime",
      "13/45/1950",
      "1950-13",
      "1952-1948",
      "Feb 29, 1900",
      "Ma 1950",
      "50",
      "spring 1950",
    ]
  ) {
    assertEquals(parseLooseDate(text), { ok: false }, text);
  }
});

Deno.test("updatePerson keeps a family name and a mark, and drops them when emptied", () => {
  const { a, bo } = household();
  let b = updatePerson(a, bo, { name: "Bo Brill", surname: " Hart-Lowe ", badge: "★" });
  const saved = b.people.find((p) => p.id === bo)!;
  assertEquals([saved.surname, saved.badge], ["Hart-Lowe", "★"]);
  b = updatePerson(b, bo, { name: "Bo Brill", surname: "", badge: "" });
  const cleared = b.people.find((p) => p.id === bo)!;
  assertEquals(["surname" in cleared, "badge" in cleared], [false, false]);
});

Deno.test("quick relatives tie the right way round, and a sibling copies every parent", () => {
  const b = archiveBuilder("test", false);
  const mum = b.person("Mum"), dad = b.person("Dad"), kid = b.person("Kid");
  b.tie("biological_parent", mum, kid);
  b.tie("adoptive_parent", dad, kid);
  const a = b.archive;

  const sib = addRelative(a, kid, "sibling", { name: "Sib", born: "2001" });
  const sibTies = sib.archive.ties.filter((t) => t.to === sib.id);
  assertEquals(
    sibTies.map((t) => `${t.kind}:${t.from}`).sort(),
    [`adoptive_parent:${dad}`, `biological_parent:${mum}`],
  );
  assertEquals(lifeDates(indexArchive(sib.archive), sib.id).born, "2001");

  const child = addRelative(a, kid, "child", { name: "Grandkid" });
  assert(child.archive.ties.some((t) => t.from === kid && t.to === child.id));
  const parent = addRelative(a, mum, "parent", { name: "Gran" });
  assert(parent.archive.ties.some((t) => t.from === parent.id && t.to === mum));
  const partner = addRelative(a, kid, "partner", { name: "Pat" });
  assert(partner.archive.ties.some((t) => t.kind === "partner" && t.to === partner.id));
  assertThrows(() => addRelative(a, mum, "sibling", { name: "Nobody" }));
});
