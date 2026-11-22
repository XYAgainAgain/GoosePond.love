import { assert, assertEquals } from "@std/assert";
import { indexArchive, lifeDates } from "../records/queries.ts";
import type { TieKind } from "../records/kinds.ts";
import type { Id } from "../records/types.ts";
import { validate } from "../records/validate.ts";
import { shire } from "./shire.ts";

const a = shire();
const ix = indexArchive(a);

function who(name: string, born?: string): Id {
  const found = a.people.filter((p) =>
    p.name === name && (born === undefined || lifeDates(ix, p.id).born === born)
  );
  assertEquals(found.length, 1, `exactly one ${name} ${born ?? ""}`);
  return found[0].id;
}

const parentsOf = (child: Id, kind: TieKind = "biological_parent") =>
  a.ties.filter((t) => t.kind === kind && t.to === child).map((t) => t.from).toSorted();

const married = (x: Id, y: Id) =>
  a.ties.some((t) =>
    t.kind === "spouse" && ((t.from === x && t.to === y) || (t.from === y && t.to === x))
  );

const born = (id: Id) => lifeDates(ix, id).born;

Deno.test("validate reports no errors", () => {
  assertEquals(validate(a).filter((i) => i.level === "error"), []);
});

Deno.test("no two people share both a name and a birth year", () => {
  const seen = new Set<string>();
  for (const p of a.people) {
    const key = `${p.name}|${born(p.id) ?? "?"}`;
    assert(!seen.has(key), key);
    seen.add(key);
  }
});

Deno.test("every tie's endpoints exist", () => {
  const people = new Set(a.people.map((p) => p.id));
  for (const t of a.ties) assert(people.has(t.from) && people.has(t.to), t.id);
});

Deno.test("home is Frodo Baggins", () => {
  assertEquals(a.home, who("Frodo Baggins"));
});

Deno.test("the archive is synthetic and titled The Shire", () => {
  assertEquals(a.title, "The Shire");
  assert(a.synthetic);
});

Deno.test("Frodo is the child of Drogo Baggins and Primula Brandybuck", () => {
  assertEquals(
    parentsOf(who("Frodo Baggins")),
    [who("Drogo Baggins"), who("Primula Brandybuck")].toSorted(),
  );
});

Deno.test("Bilbo is the child of Bungo Baggins and Belladonna Took", () => {
  assertEquals(
    parentsOf(who("Bilbo Baggins")),
    [who("Bungo Baggins"), who("Belladonna Took")].toSorted(),
  );
});

Deno.test("Pippin is the child of Paladin Took II and Eglantine Banks", () => {
  assertEquals(
    parentsOf(who("Peregrin Took I")),
    [who("Paladin Took II"), who("Eglantine Banks")].toSorted(),
  );
});

Deno.test("Merry is the child of Saradoc Brandybuck and Esmeralda Took", () => {
  assertEquals(
    parentsOf(who("Meriadoc Brandybuck")),
    [who("Saradoc Brandybuck"), who("Esmeralda Took")].toSorted(),
  );
});

Deno.test("Samwise is the child of Hamfast Gamgee and Bell Goodchild", () => {
  assertEquals(
    parentsOf(who("Samwise Gamgee")),
    [who("Hamfast Gamgee"), who("Bell Goodchild")].toSorted(),
  );
});

Deno.test("Primula's mother was Mirabella Took", () => {
  assert(parentsOf(who("Primula Brandybuck")).includes(who("Mirabella Took")));
});

Deno.test("Mirabella Took is a daughter of Gerontius, the Old Took", () => {
  assert(parentsOf(who("Mirabella Took")).includes(who("Gerontius Took")));
});

Deno.test("Bilbo's mother Belladonna is a daughter of Gerontius Took", () => {
  assert(parentsOf(who("Belladonna Took")).includes(who("Gerontius Took")));
});

Deno.test("Drogo is the son of Fosco Baggins and Ruby Bolger", () => {
  assertEquals(
    parentsOf(who("Drogo Baggins")),
    [who("Fosco Baggins"), who("Ruby Bolger")].toSorted(),
  );
});

Deno.test("Lotho is the son of Otho Sackville-Baggins and Lobelia", () => {
  assertEquals(
    parentsOf(who("Lotho Sackville-Baggins")),
    [who("Otho Sackville-Baggins"), who("Lobelia Bracegirdle")].toSorted(),
  );
});

Deno.test("Rose Cotton is the daughter of Tolman Cotton and Lily Brown", () => {
  assertEquals(
    parentsOf(who("Rose Cotton")),
    [who("Tolman Cotton", "1341"), who("Lily Brown")].toSorted(),
  );
});

Deno.test("Samwise married Rose Cotton in 1420", () => {
  const tie = a.ties.find((t) =>
    t.kind === "spouse" && t.from === who("Samwise Gamgee") && t.to === who("Rose Cotton")
  );
  assertEquals(tie?.start, "1420-05-01");
});

Deno.test("Merry married Estella Bolger", () => {
  assert(married(who("Meriadoc Brandybuck"), who("Estella Bolger")));
});

Deno.test("Pippin married Diamond of Long Cleeve", () => {
  assert(married(who("Peregrin Took I"), who("Diamond of Long Cleeve")));
});

Deno.test("Samwise's daughter Goldilocks married Pippin's son Faramir", () => {
  assert(parentsOf(who("Goldilocks Gardner")).includes(who("Samwise Gamgee")));
  assert(parentsOf(who("Faramir Took I")).includes(who("Peregrin Took I")));
  assert(married(who("Faramir Took I"), who("Goldilocks Gardner")));
});

Deno.test("Marigold Gamgee married Tolman Cotton the younger", () => {
  assert(married(who("Marigold Gamgee"), who("Tolman Cotton", "1380")));
});

Deno.test("Bilbo was born in 1290", () => assertEquals(born(who("Bilbo Baggins")), "1290"));
Deno.test("Frodo was born in 1368", () => assertEquals(born(who("Frodo Baggins")), "1368"));
Deno.test("Samwise was born in 1380", () => assertEquals(born(who("Samwise Gamgee")), "1380"));
Deno.test("Merry was born in 1382", () => assertEquals(born(who("Meriadoc Brandybuck")), "1382"));
Deno.test("Pippin was born in 1390", () => assertEquals(born(who("Peregrin Took I")), "1390"));
Deno.test("Gerontius Took was born in 1190", () => {
  assertEquals(born(who("Gerontius Took")), "1190");
});

Deno.test("Drogo and Primula both died in 1380", () => {
  assertEquals(lifeDates(ix, who("Drogo Baggins")).died, "1380");
  assertEquals(lifeDates(ix, who("Primula Brandybuck")).died, "1380");
});

Deno.test("Rose Cotton died in 1482", () => {
  assertEquals(lifeDates(ix, who("Rose Cotton")).died, "1482");
});

Deno.test("the Gaffer goes by Ham and the Gaffer", () => {
  const gaffer = ix.person(who("Hamfast Gamgee"));
  assert(gaffer?.aliases?.includes("the Gaffer"));
  assert(gaffer?.aliases?.includes("Ham"));
});

Deno.test("Pippin's alias is Pippin and Merry's is Merry", () => {
  assert(ix.person(who("Peregrin Took I"))?.aliases?.includes("Pippin"));
  assert(ix.person(who("Meriadoc Brandybuck"))?.aliases?.includes("Merry"));
});

Deno.test("those who sailed West have no death event", () => {
  for (const name of ["Bilbo Baggins", "Frodo Baggins", "Samwise Gamgee"]) {
    assertEquals(lifeDates(ix, who(name)).died, undefined, name);
  }
});

Deno.test("Bilbo adopted Frodo as his heir in 1389", () => {
  assertEquals(parentsOf(who("Frodo Baggins"), "adoptive_parent"), [who("Bilbo Baggins")]);
  const tie = a.ties.find((t) => t.kind === "adoptive_parent");
  assertEquals(tie?.start, "1389");
});

Deno.test("Frodo joined the Brandy Hall household of Rorimac, marked uncertain", () => {
  const tie = a.ties.find((t) => t.kind === "incorporated_into_household");
  assertEquals(tie?.from, who("Rorimac Brandybuck"));
  assertEquals(tie?.to, who("Frodo Baggins"));
  assertEquals(tie?.certainty, "uncertain");
});

Deno.test("Bag End passes Bungo, Bilbo, Frodo, Lobelia, Frodo, Samwise", () => {
  const bagEnd = a.places.find((p) => p.name === "Bag End")!.id;
  const owners = a.interests.filter((i) => i.place === bagEnd && i.role === "recorded_owner");
  assertEquals(owners.map((i) => i.holder), [
    who("Bungo Baggins"),
    who("Bilbo Baggins"),
    who("Frodo Baggins"),
    who("Lobelia Bracegirdle"),
    who("Frodo Baggins"),
    who("Samwise Gamgee"),
  ]);
  assertEquals(owners.map((i) => [i.start, i.end]), [
    [undefined, "1326"],
    [undefined, "1401"],
    ["1401", "1418"],
    ["1418", "1419"],
    ["1419", "1421"],
    ["1421", undefined],
  ]);
});

Deno.test("the drowning carries the Gaffer's account and Sandyman's rumor", () => {
  const drowning = a.events.find((e) =>
    e.kind === "other" && e.people[0] === who("Drogo Baggins")
  )!;
  assertEquals(drowning.date, "1380");
  const claims = a.claims.filter((c) => c.about === drowning.id);
  assertEquals(claims.map((c) => c.certainty).toSorted(), ["disputed", "family_account"]);
});

Deno.test("the Grey Havens departure is an event, not a death", () => {
  const sailing = a.events.find((e) => e.date === "1421-09-29");
  assertEquals(sailing?.kind, "other");
  assertEquals(sailing?.people[0], who("Frodo Baggins"));
});

Deno.test("no one carries a bio, pronouns, or a portrait, and there is no media", () => {
  assertEquals(a.media, []);
  for (const p of a.people) assert(!p.bio && !p.pronouns && !p.portrait, p.name);
});
