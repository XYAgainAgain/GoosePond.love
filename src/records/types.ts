import type { TieKind } from "./kinds.ts";

export type Id = string;

/* EDTF subset: "1921", "1921-04", "1921-04-03", "1921~" (about), "1919/1923" (between) */
export type FuzzyDate = string;

export type Certainty = "documented" | "family_account" | "uncertain" | "disputed";

export interface Person {
  id: Id;
  name: string;
  birthName?: string;
  /* Family name at birth, hyphenated for more than one; overrides the one read from the name */
  surname?: string;
  /* Shown before the name on the map */
  badge?: string;
  aliases?: string[];
  pronouns?: string;
  /* undefined when unknown */
  living?: boolean;
  bio?: string;
  portrait?: Id;
}

export interface Tie {
  id: Id;
  kind: TieKind;
  from: Id;
  to: Id;
  start?: FuzzyDate;
  end?: FuzzyDate;
  note?: string;
  certainty?: Certainty;
  sources?: Id[];
}

export type EventKind =
  | "birth"
  | "death"
  | "marriage"
  | "divorce"
  | "separation"
  | "partnership"
  | "adoption"
  | "fostering"
  | "residence"
  | "immigration"
  | "property_transfer"
  | "reunion"
  | "other";

export interface LifeEvent {
  id: Id;
  kind: EventKind;
  people: Id[];
  date?: FuzzyDate;
  place?: Id;
  note?: string;
  certainty?: Certainty;
  sources?: Id[];
}

export interface Place {
  id: Id;
  name: string;
  aliases?: string[];
  note?: string;
}

export interface Entity {
  id: Id;
  name: string;
  kind: "trust" | "company" | "other";
  note?: string;
}

export type InterestRole =
  | "trustee"
  | "beneficiary"
  | "recorded_owner"
  | "stakeholder"
  | "caretaker"
  | "other";

export interface PropertyInterest {
  id: Id;
  /* a person or an entity */
  holder: Id;
  place: Id;
  role: InterestRole;
  /* Only as written in a document, never worked out */
  share?: string;
  start?: FuzzyDate;
  end?: FuzzyDate;
  certainty?: Certainty;
  sources?: Id[];
}

export interface Source {
  id: Id;
  title: string;
  citation?: string;
  providedBy?: string;
  obtained?: FuzzyDate;
}

export interface Media {
  id: Id;
  kind: "photo" | "document";
  title: string;
  people: Id[];
  date?: FuzzyDate;
  credit?: string;
  src?: string;
}

export interface Claim {
  id: Id;
  /* any record's id */
  about: Id;
  statement: string;
  certainty: Certainty;
  sources?: Id[];
}

export interface Archive {
  version: 1;
  title: string;
  synthetic: boolean;
  people: Person[];
  ties: Tie[];
  events: LifeEvent[];
  places: Place[];
  entities: Entity[];
  interests: PropertyInterest[];
  sources: Source[];
  media: Media[];
  claims: Claim[];
  /* the person the map opens on */
  home?: Id;
}

export function emptyArchive(title: string, synthetic: boolean): Archive {
  return {
    version: 1,
    title,
    synthetic,
    people: [],
    ties: [],
    events: [],
    places: [],
    entities: [],
    interests: [],
    sources: [],
    media: [],
    claims: [],
  };
}
