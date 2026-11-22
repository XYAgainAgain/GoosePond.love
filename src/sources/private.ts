import { COPY } from "../copy.ts";
import { type Archive, emptyArchive } from "../records/types.ts";
import { type Issue, validate } from "../records/validate.ts";

const DB = "goosepond-love";
const STORE = "private";
const KEY = "archive";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store<T>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = act(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? request.error);
      tx.onerror = () => reject(tx.error ?? request.error);
    });
  } finally {
    db.close();
  }
}

type Row = Record<string, unknown>;

/* A record missing one of these strings makes the whole file unreadable */
const REQUIRED: Record<string, string[]> = {
  people: ["id", "name"],
  ties: ["id", "kind", "from", "to"],
  events: ["id", "kind"],
  places: ["id", "name"],
  entities: ["id", "name", "kind"],
  interests: ["id", "holder", "place", "role"],
  sources: ["id", "title"],
  media: ["id", "kind", "title"],
  claims: ["id", "about", "statement", "certainty"],
};

/* Optional fields dropped when they aren't the type named here */
const OPTIONAL: Record<string, Record<string, "string" | "boolean" | "strings">> = {
  people: {
    birthName: "string",
    surname: "string",
    badge: "string",
    aliases: "strings",
    pronouns: "string",
    living: "boolean",
    bio: "string",
    portrait: "string",
  },
  ties: { start: "string", end: "string", note: "string", certainty: "string", sources: "strings" },
  events: {
    date: "string",
    place: "string",
    note: "string",
    certainty: "string",
    sources: "strings",
  },
  places: { aliases: "strings", note: "string" },
  entities: { note: "string" },
  interests: {
    share: "string",
    start: "string",
    end: "string",
    certainty: "string",
    sources: "strings",
  },
  sources: { citation: "string", providedBy: "string", obtained: "string" },
  media: { date: "string", credit: "string", src: "string" },
  claims: { sources: "strings" },
};

const EMBEDDED_IMAGE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

function fits(value: unknown, type: "string" | "boolean" | "strings"): boolean {
  if (type === "strings") return strings(value);
  return type === "string" ? typeof value === "string" : typeof value === "boolean";
}

/* Throws a plain-words Error for anything that isn't a version 1 family file */
export function checkArchive(raw: unknown): Archive {
  if (typeof raw !== "object" || raw === null || (raw as Row).version !== 1) {
    throw new Error(COPY.errors.notVersion1);
  }
  const given = raw as Row;
  const archive = emptyArchive(
    typeof given.title === "string" ? given.title : COPY.file.defaultTitle,
    false,
  );
  const lists = archive as unknown as Record<string, Row[]>;
  for (const list of Object.keys(REQUIRED)) {
    const value = given[list];
    if (value === undefined) continue;
    if (!Array.isArray(value)) throw new Error(COPY.errors.notList(list));
    lists[list] = value.map((item: unknown, i) => {
      if (typeof item !== "object" || item === null) {
        throw new Error(COPY.errors.notRecord(i + 1, list));
      }
      const row: Row = { ...item };
      for (const key of REQUIRED[list]) {
        if (typeof row[key] !== "string" || row[key] === "") {
          throw new Error(COPY.errors.missingField(i + 1, list, key));
        }
      }
      for (const [key, type] of Object.entries(OPTIONAL[list])) {
        if (key in row && !fits(row[key], type)) delete row[key];
      }
      if (list === "events" || list === "media") {
        if (!strings(row.people)) row.people = [];
      }
      if (list === "media" && typeof row.src === "string" && !EMBEDDED_IMAGE.test(row.src)) {
        delete row.src;
      }
      return row;
    });
  }
  if (typeof given.home === "string") archive.home = given.home;
  return archive;
}

export async function readPrivateFile(file: File): Promise<{ archive: Archive; issues: Issue[] }> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error(COPY.errors.notJson);
  }
  const archive = checkArchive(raw);
  return { archive, issues: validate(archive) };
}

export async function rememberPrivate(a: Archive): Promise<void> {
  await store("readwrite", (s) => s.put(a, KEY));
}

/* undefined when nothing is stored; throws when what is stored can't be read as a family file */
export async function recallPrivate(): Promise<Archive | undefined> {
  const raw = await store<unknown>("readonly", (s) => s.get(KEY));
  return raw === undefined ? undefined : checkArchive(raw);
}

/* Unchecked, for saving a damaged file off the device */
export function recallRaw(): Promise<unknown> {
  return store<unknown>("readonly", (s) => s.get(KEY));
}

export async function forgetPrivate(): Promise<void> {
  await store("readwrite", (s) => s.delete(KEY));
}
