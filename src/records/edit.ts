import { COPY } from "../copy.ts";
import { isValidDate } from "./dates.ts";
import { isParentFigure, KINDS, type TieKind } from "./kinds.ts";
import type { Archive, Claim, EventKind, FuzzyDate, Id, LifeEvent, Person, Tie } from "./types.ts";

const ID_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

export function newId(prefix: string): Id {
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  let id = prefix;
  for (const b of bytes) id += ID_CHARS[b % 36];
  return id;
}

export interface PersonDraft {
  name: string;
  born?: FuzzyDate;
  died?: FuzzyDate;
  living?: boolean;
  pronouns?: string;
  birthName?: string;
  surname?: string;
  badge?: string;
  bio?: string;
}

export interface TieDraft {
  start?: FuzzyDate;
  end?: FuzzyDate;
  note?: string;
}

function text(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

function date(d: FuzzyDate | undefined, what: string): FuzzyDate | undefined {
  const t = text(d);
  if (t !== undefined && !isValidDate(t)) throw new Error(COPY.errors.badDate(what, t));
  return t;
}

function personOf(a: Archive, id: Id): Person {
  const p = a.people.find((p) => p.id === id);
  if (!p) throw new Error(COPY.errors.personMissing);
  return p;
}

const isOwn = (e: LifeEvent, id: Id) => e.people.length === 1 && e.people[0] === id;

function personFields(draft: PersonDraft) {
  const name = draft.name.trim();
  if (!name) throw new Error(COPY.errors.needsName);
  const born = date(draft.born, COPY.errors.dateNames.birth);
  const died = date(draft.died, COPY.errors.dateNames.death);
  const fields: Omit<Person, "id"> = { name };
  const living = died ? false : draft.living;
  if (living !== undefined) fields.living = living;
  const pronouns = text(draft.pronouns), birthName = text(draft.birthName), bio = text(draft.bio);
  if (pronouns) fields.pronouns = pronouns;
  if (birthName) fields.birthName = birthName;
  const surname = text(draft.surname), badge = text(draft.badge);
  if (surname) fields.surname = surname;
  if (badge) fields.badge = badge;
  if (bio) fields.bio = bio;
  return { fields, born, died };
}

function setOwnEvent(
  events: LifeEvent[],
  id: Id,
  kind: EventKind,
  d: FuzzyDate | undefined,
): LifeEvent[] {
  const mine = (e: LifeEvent) => e.kind === kind && isOwn(e, id);
  const first = events.find(mine);
  if (!d) return first ? events.filter((e) => !mine(e)) : events;
  if (!first) return [...events, { id: newId("e"), kind, people: [id], date: d }];
  return events.flatMap((e) => e === first ? [{ ...e, date: d }] : mine(e) ? [] : [e]);
}

function withLifeEvents(a: Archive, id: Id, born?: FuzzyDate, died?: FuzzyDate): LifeEvent[] {
  return setOwnEvent(setOwnEvent(a.events, id, "birth", born), id, "death", died);
}

export function addPerson(a: Archive, draft: PersonDraft): { archive: Archive; id: Id } {
  const { fields, born, died } = personFields(draft);
  const id = newId("p");
  const archive = { ...a, people: [...a.people, { id, ...fields }] };
  archive.events = withLifeEvents(archive, id, born, died);
  return { archive, id };
}

/* Rewrites the person's fields and their birth and death events to match the draft */
export function updatePerson(a: Archive, id: Id, draft: PersonDraft): Archive {
  const old = personOf(a, id);
  const { fields, born, died } = personFields(draft);
  const person: Person = { id, ...fields };
  if (old.aliases) person.aliases = old.aliases;
  if (old.portrait) person.portrait = old.portrait;
  return {
    ...a,
    people: a.people.map((p) => p.id === id ? person : p),
    events: withLifeEvents(a, id, born, died),
  };
}

function dropClaims(claims: Claim[], removed: Set<Id>): Claim[] {
  for (;;) {
    const kept = claims.filter((c) => !removed.has(c.about));
    if (kept.length === claims.length) return claims;
    for (const c of claims) if (removed.has(c.about)) removed.add(c.id);
    claims = kept;
  }
}

function withoutMedia(a: Archive, media: Id): Archive {
  return {
    ...a,
    media: a.media.filter((m) => m.id !== media),
    people: a.people.map((p) => {
      if (p.portrait !== media) return p;
      const { portrait: _, ...rest } = p;
      return rest;
    }),
    claims: dropClaims(a.claims, new Set([media])),
  };
}

export function removePerson(a: Archive, id: Id): Archive {
  const person = personOf(a, id);
  let b = person.portrait ? withoutMedia(a, person.portrait) : a;
  const removed = new Set<Id>([id]);
  const drop = <T extends { id: Id }>(list: T[], gone: (r: T) => boolean) =>
    list.filter((r) => {
      if (!gone(r)) return true;
      removed.add(r.id);
      return false;
    });
  const ties = drop(b.ties, (t) => t.from === id || t.to === id);
  const subject = (e: LifeEvent) =>
    isOwn(e, id) || ((e.kind === "birth" || e.kind === "death") && e.people[0] === id);
  const events = drop(b.events, subject).map((e) =>
    e.people.includes(id) ? { ...e, people: e.people.filter((p) => p !== id) } : e
  );
  const interests = drop(b.interests, (i) => i.holder === id);
  const media = b.media.map((m) =>
    m.people.includes(id) ? { ...m, people: m.people.filter((p) => p !== id) } : m
  );
  b = {
    ...b,
    people: b.people.filter((p) => p.id !== id),
    ties,
    events,
    interests,
    media,
  };
  b.claims = dropClaims(b.claims, removed);
  if (b.home === id) delete b.home;
  return b;
}

function tieFields(draft: TieDraft): Pick<Tie, "start" | "end" | "note"> {
  const fields: Pick<Tie, "start" | "end" | "note"> = {};
  const start = date(draft.start, COPY.errors.dateNames.start);
  const end = date(draft.end, COPY.errors.dateNames.end), note = text(draft.note);
  if (start) fields.start = start;
  if (end) fields.end = end;
  if (note) fields.note = note;
  return fields;
}

/* Throws a plain-words Error for a self-tie, a missing person, or an exact duplicate */
export function addTie(
  a: Archive,
  kind: TieKind,
  from: Id,
  to: Id,
  draft: TieDraft = {},
): { archive: Archive; id: Id } {
  if (!(kind in KINDS)) throw new Error(COPY.errors.unknownKind);
  personOf(a, from);
  personOf(a, to);
  if (from === to) throw new Error(COPY.errors.selfTie);
  const undirected = !KINDS[kind].directed;
  const duplicate = a.ties.some((t) =>
    t.kind === kind &&
    ((t.from === from && t.to === to) || (undirected && t.from === to && t.to === from))
  );
  if (duplicate) throw new Error(COPY.errors.duplicateTie(KINDS[kind].label));
  const id = newId("t");
  return { archive: { ...a, ties: [...a.ties, { id, kind, from, to, ...tieFields(draft) }] }, id };
}

export type Relative = "parent" | "partner" | "child" | "sibling";

/* A new person tied to `to`; a sibling gets each of their parents, and throws when there are none */
export function addRelative(
  a: Archive,
  to: Id,
  relative: Relative,
  draft: PersonDraft,
): { archive: Archive; id: Id } {
  personOf(a, to);
  const parents = a.ties.filter((t) => t.to === to && isParentFigure(t.kind));
  if (relative === "sibling" && parents.length === 0) throw new Error(COPY.errors.noParents);
  const made = addPerson(a, draft);
  let b = made.archive;
  const tie = (kind: TieKind, from: Id, onto: Id) => (b = addTie(b, kind, from, onto).archive);
  if (relative === "parent") tie("biological_parent", made.id, to);
  else if (relative === "child") tie("biological_parent", to, made.id);
  else if (relative === "partner") tie("partner", to, made.id);
  else for (const p of parents) tie(p.kind, p.from, made.id);
  return { archive: b, id: made.id };
}

export function updateTie(a: Archive, id: Id, draft: TieDraft): Archive {
  const old = a.ties.find((t) => t.id === id);
  if (!old) throw new Error(COPY.errors.tieMissing);
  const { start: _s, end: _e, note: _n, ...kept } = old;
  const tie: Tie = { ...kept, ...tieFields(draft) };
  return { ...a, ties: a.ties.map((t) => t.id === id ? tie : t) };
}

export function removeTie(a: Archive, id: Id): Archive {
  if (!a.ties.some((t) => t.id === id)) return a;
  const b = { ...a, ties: a.ties.filter((t) => t.id !== id) };
  b.claims = dropClaims(b.claims, new Set([id]));
  return b;
}

/* `src` is an image data URL; null removes the portrait and its media record */
export function setPortrait(a: Archive, person: Id, src: string | null): Archive {
  const p = personOf(a, person);
  const current = p.portrait ? a.media.find((m) => m.id === p.portrait) : undefined;
  if (src === null) return p.portrait ? withoutMedia(a, p.portrait) : a;
  if (current) {
    return {
      ...a,
      media: a.media.map((m) => m === current ? { ...m, title: p.name, src } : m),
    };
  }
  const id = newId("m");
  return {
    ...a,
    media: [...a.media, { id, kind: "photo", title: p.name, people: [person], src }],
    people: a.people.map((q) => q.id === person ? { ...q, portrait: id } : q),
  };
}

export function setHome(a: Archive, person: Id | null): Archive {
  if (person === null) {
    const { home: _, ...rest } = a;
    return rest;
  }
  personOf(a, person);
  return { ...a, home: person };
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function monthNumber(word: string): number | undefined {
  if (word.length < 3) return undefined;
  const i = MONTH_NAMES.findIndex((m) => m.startsWith(word));
  return i < 0 ? undefined : i + 1;
}

const pad = (n: number) => String(n).padStart(2, "0");

function exact(t: string): string | undefined {
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})$/.exec(t))) return m[1];
  if ((m = /^(\d{4})-(\d{1,2})$/.exec(t))) return `${m[1]}-${pad(+m[2])}`;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) return `${m[3]}-${pad(+m[1])}-${pad(+m[2])}`;
  if ((m = /^([a-z]+)\.?,? (\d{4})$/.exec(t))) {
    const month = monthNumber(m[1]);
    return month ? `${m[2]}-${pad(month)}` : undefined;
  }
  if ((m = /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/.exec(t))) {
    const month = monthNumber(m[1]);
    return month ? `${m[3]}-${pad(month)}-${pad(+m[2])}` : undefined;
  }
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z]+)\.?,? (\d{4})$/.exec(t))) {
    const month = monthNumber(m[2]);
    return month ? `${m[3]}-${pad(month)}-${pad(+m[1])}` : undefined;
  }
  return undefined;
}

function loosePoint(t: string): string | undefined {
  let m = /^(?:about|around|circa|approximately|approx\.?|ca\.?|c\.?|~) ?(.+)$/.exec(t);
  if (!m) m = /^(.+?) ?[~?]$/.exec(t);
  if (m) {
    const p = exact(m[1]);
    return p && `${p}~`;
  }
  return exact(t);
}

/* No `date` for empty text; `ok` is false when the text can't be read */
export function parseLooseDate(input: string): { date?: FuzzyDate; ok: boolean } {
  const t = input.trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
  if (!t) return { ok: true };
  const range = /^between (.+) and (.+)$/.exec(t) ?? /^(.+?) to (.+)$/.exec(t) ??
    /^(\d{4}) ?[-/] ?(\d{4})$/.exec(t);
  let d: string | undefined;
  if (range) {
    const from = loosePoint(range[1]), to = loosePoint(range[2]);
    d = from && to ? `${from}/${to}` : undefined;
  } else {
    d = loosePoint(t);
  }
  return d && isValidDate(d) ? { date: d, ok: true } : { ok: false };
}
