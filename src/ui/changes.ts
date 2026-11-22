import { COPY } from "../copy.ts";
import type { Archive, Id } from "../records/types.ts";

function added<T extends { id: Id }>(before: T[], after: T[]): T[] {
  const had = new Set(before.map((r) => r.id));
  return after.filter((r) => !had.has(r.id));
}

function altered<T extends { id: Id }>(before: T[], after: T[]): T[] {
  const old = new Map(before.map((r) => [r.id, JSON.stringify(r)]));
  return after.filter((r) => old.has(r.id) && old.get(r.id) !== JSON.stringify(r));
}

export function describeChange(before: Archive, after: Archive): string {
  const name = (a: Archive, id: Id) =>
    a.people.find((p) => p.id === id)?.name ?? COPY.changes.someone;
  const joined = added(before.people, after.people);
  const left = added(after.people, before.people);
  if (joined.length === 1 && left.length === 0) return COPY.changes.added(joined[0].name);
  if (left.length === 1 && joined.length === 0) return COPY.changes.removed(left[0].name);
  if (joined.length || left.length) return COPY.changes.generic;

  const tied = added(before.ties, after.ties);
  const untied = added(after.ties, before.ties);
  if (tied.length === 1 && untied.length === 0) {
    return COPY.changes.tied(name(after, tied[0].from), name(after, tied[0].to));
  }
  if (untied.length === 1 && tied.length === 0) {
    return COPY.changes.untied(name(before, untied[0].from), name(before, untied[0].to));
  }
  if (tied.length || untied.length) return COPY.changes.generic;
  const retied = altered(before.ties, after.ties);
  if (retied.length === 1) {
    return COPY.changes.tieUpdated(name(after, retied[0].from), name(after, retied[0].to));
  }

  const touched = new Set(altered(before.people, after.people).map((p) => p.id));
  const events = [
    ...added(before.events, after.events),
    ...added(after.events, before.events),
    ...altered(before.events, after.events),
  ];
  for (const e of events) e.people.forEach((p) => touched.add(p));
  const media = [...added(before.media, after.media), ...altered(before.media, after.media)];
  for (const m of media) m.people.forEach((p) => touched.add(p));
  if (touched.size === 1) return COPY.changes.updated(name(after, [...touched][0]));
  if (touched.size === 0 && after.home && before.home !== after.home) {
    return COPY.changes.home(name(after, after.home));
  }
  return COPY.changes.generic;
}
