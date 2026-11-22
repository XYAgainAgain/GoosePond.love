import type { TieKind } from "./kinds.ts";
import { type Archive, emptyArchive, type EventKind, type FuzzyDate, type Id } from "./types.ts";
import type { LifeEvent, Person, Tie } from "./types.ts";

export interface PersonInit extends Partial<Omit<Person, "id" | "name">> {
  born?: FuzzyDate;
  died?: FuzzyDate;
}

export interface ArchiveBuilder {
  archive: Archive;
  /* Ids count up from 1 across every record kind, so the same calls give the same ids */
  id(prefix: string): Id;
  /* `born` and `died` become birth and death events */
  person(name: string, init?: PersonInit): Id;
  tie(
    kind: TieKind,
    from: Id,
    to: Id,
    extra?: Partial<Omit<Tie, "id" | "kind" | "from" | "to">>,
  ): Id;
  parents(kind: TieKind, child: Id, ...parents: Id[]): void;
  event(
    kind: EventKind,
    people: Id[],
    extra?: Partial<Omit<LifeEvent, "id" | "kind" | "people">>,
  ): Id;
}

export function archiveBuilder(title: string, synthetic: boolean): ArchiveBuilder {
  const archive = emptyArchive(title, synthetic);
  let count = 0;
  const id = (prefix: string) => `${prefix}${++count}`;
  const event: ArchiveBuilder["event"] = (kind, people, extra = {}) => {
    const eid = id("e");
    archive.events.push({ id: eid, kind, people, ...extra });
    return eid;
  };
  const tie: ArchiveBuilder["tie"] = (kind, from, to, extra = {}) => {
    const tid = id("t");
    archive.ties.push({ id: tid, kind, from, to, ...extra });
    return tid;
  };
  return {
    archive,
    id,
    event,
    tie,
    person(name, init = {}) {
      const { born, died, ...rest } = init;
      const pid = id("p");
      archive.people.push({ id: pid, name, ...rest });
      if (born) event("birth", [pid], { date: born });
      if (died) event("death", [pid], { date: died });
      return pid;
    },
    parents(kind, child, ...parents) {
      for (const p of parents) tie(kind, p, child);
    },
  };
}
