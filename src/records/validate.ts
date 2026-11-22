import { COPY } from "../copy.ts";
import { dateSpan, isValidDate } from "./dates.ts";
import { KINDS } from "./kinds.ts";
import { indexArchive, lifeDates } from "./queries.ts";
import type { Archive, FuzzyDate, Id } from "./types.ts";

export interface Issue {
  level: "error" | "warning";
  code: string;
  message: string;
  ids: Id[];
}

export function validate(a: Archive): Issue[] {
  const issues: Issue[] = [];
  const error = (code: string, message: string, ...ids: Id[]) =>
    issues.push({ level: "error", code, message, ids });
  const warning = (code: string, message: string, ...ids: Id[]) =>
    issues.push({ level: "warning", code, message, ids });

  const refName = COPY.checks.refNames;
  const people = new Set(a.people.map((p) => p.id));
  const places = new Set(a.places.map((p) => p.id));
  const entities = new Set(a.entities.map((e) => e.id));
  const sources = new Set(a.sources.map((s) => s.id));
  const media = new Set(a.media.map((m) => m.id));

  const all = new Set<Id>();
  const records: { id: Id }[] = [
    ...a.people,
    ...a.ties,
    ...a.events,
    ...a.places,
    ...a.entities,
    ...a.interests,
    ...a.sources,
    ...a.media,
    ...a.claims,
  ];
  for (const r of records) {
    if (all.has(r.id)) error("duplicate_id", COPY.checks.duplicateId(r.id), r.id);
    all.add(r.id);
  }

  const ref = (owner: Id, target: Id | undefined, pool: ReadonlySet<Id>, what: string) => {
    if (target !== undefined && !pool.has(target)) {
      error("dangling_ref", COPY.checks.dangling(owner, what, target), owner, target);
    }
  };
  const refs = (owner: Id, targets: Id[] | undefined, pool: ReadonlySet<Id>, what: string) => {
    for (const t of targets ?? []) ref(owner, t, pool, what);
  };
  const date = (owner: Id, d: FuzzyDate | undefined) => {
    if (d !== undefined && !isValidDate(d)) {
      error("bad_date", COPY.checks.badDate(owner, d), owner);
    }
  };
  const ordered = (owner: Id, start: FuzzyDate | undefined, end: FuzzyDate | undefined) => {
    const s = dateSpan(start), e = dateSpan(end);
    if (s && e && e.latest < s.earliest) {
      error("date_order", COPY.checks.endsBeforeStarts(owner), owner);
    }
  };

  for (const p of a.people) ref(p.id, p.portrait, media, refName.media);
  ref("home", a.home, people, refName.person);

  for (const t of a.ties) {
    ref(t.id, t.from, people, refName.person);
    ref(t.id, t.to, people, refName.person);
    refs(t.id, t.sources, sources, refName.source);
    if (t.from === t.to) error("self_tie", COPY.checks.selfTie(t.id), t.id, t.from);
    if (!(t.kind in KINDS)) error("unknown_kind", COPY.checks.unknownKind(t.id, t.kind), t.id);
    date(t.id, t.start);
    date(t.id, t.end);
    ordered(t.id, t.start, t.end);
  }

  for (const e of a.events) {
    refs(e.id, e.people, people, refName.person);
    ref(e.id, e.place, places, refName.place);
    refs(e.id, e.sources, sources, refName.source);
    date(e.id, e.date);
  }

  const holders = new Set([...people, ...entities]);
  for (const i of a.interests) {
    ref(i.id, i.holder, holders, refName.holder);
    ref(i.id, i.place, places, refName.place);
    refs(i.id, i.sources, sources, refName.source);
    date(i.id, i.start);
    date(i.id, i.end);
    ordered(i.id, i.start, i.end);
  }

  for (const s of a.sources) date(s.id, s.obtained);

  for (const m of a.media) {
    refs(m.id, m.people, people, refName.person);
    date(m.id, m.date);
  }

  for (const c of a.claims) {
    ref(c.id, c.about, all, refName.record);
    refs(c.id, c.sources, sources, refName.source);
  }

  const ix = indexArchive(a);
  for (const p of a.people) {
    const { born, died } = lifeDates(ix, p.id);
    const b = dateSpan(born), d = dateSpan(died);
    if (b && d && d.latest < b.earliest) {
      error("date_order", COPY.checks.diesBeforeBorn(p.name), p.id);
    }
    if (!b) continue;

    const parents = ix.tiesOf(p.id)
      .filter((t) => t.to === p.id && t.kind === "biological_parent")
      .map((t) => t.from);
    let lastDeath = -Infinity;
    let allDied = parents.length > 0;
    for (const parent of parents) {
      const dates = lifeDates(ix, parent);
      const pb = dateSpan(dates.born), pd = dateSpan(dates.died);
      if (pb && b.latest < pb.earliest) {
        error(
          "born_before_parent",
          COPY.checks.bornBeforeParent(p.name),
          p.id,
          parent,
        );
      }
      if (pd) lastDeath = Math.max(lastDeath, pd.latest);
      else allDied = false;
    }
    if (allDied && b.earliest > lastDeath + 1) {
      warning(
        "born_after_parents_died",
        COPY.checks.bornAfterParentsDied(p.name),
        p.id,
      );
    }
  }

  return issues;
}
