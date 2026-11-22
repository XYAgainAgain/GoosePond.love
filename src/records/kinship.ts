import { COPY } from "../copy.ts";
import { KINDS, type TieFamily, type TieKind } from "./kinds.ts";
import { dateSpan } from "./dates.ts";
import { type Index, lifeDates } from "./queries.ts";
import type { Id, Tie } from "./types.ts";

export type KinDirection = "up" | "down" | "partner" | "across";

export interface KinStep {
  tie: Tie;
  person: Id;
  direction: KinDirection;
}

/* Breaks ties between equally short chains */
const COST: Record<TieFamily, number> = {
  lineage: 0,
  legal: 1,
  partnership: 1,
  care: 3,
  assisted: 3,
  chosen: 5,
  other: 8,
};

const usable = (ix: Index, tie: Tie) =>
  Object.hasOwn(KINDS, tie.kind) && tie.from !== tie.to && !!ix.person(tie.from) &&
  !!ix.person(tie.to);

function directionOf(tie: Tie, at: Id): KinDirection {
  const kind = KINDS[tie.kind];
  if (kind.ranks) return tie.to === at ? "up" : "down";
  return kind.family === "partnership" ? "partner" : "across";
}

/* `[]` for the same person, null when unconnected or either isn't in the archive */
export function kinPath(ix: Index, from: Id, to: Id): KinStep[] | null {
  if (!ix.person(from) || !ix.person(to)) return null;
  if (from === to) return [];
  const depth = new Map<Id, number>([[from, 0]]);
  const best = new Map<Id, { cost: number; prev: Id; step: KinStep }>();
  let frontier = [from];
  for (let d = 0; frontier.length && !depth.has(to); d++) {
    const next: Id[] = [];
    for (const at of frontier) {
      const base = at === from ? 0 : best.get(at)!.cost;
      for (const tie of ix.tiesOf(at)) {
        if (!usable(ix, tie)) continue;
        const other = tie.from === at ? tie.to : tie.from;
        const cost = base + COST[KINDS[tie.kind].family];
        const seen = depth.get(other);
        if (seen === undefined) {
          depth.set(other, d + 1);
          next.push(other);
        } else if (seen !== d + 1 || cost >= best.get(other)!.cost) continue;
        best.set(other, {
          cost,
          prev: at,
          step: { tie, person: other, direction: directionOf(tie, at) },
        });
      }
    }
    frontier = next;
  }
  if (!best.has(to)) return null;
  const path: KinStep[] = [];
  for (let at = to; at !== from;) {
    const { prev, step } = best.get(at)!;
    path.push(step);
    at = prev;
  }
  return path.reverse();
}

type Gender = "he" | "she" | "they";
type Word = { he: string; she: string; they?: string };
interface Link {
  step: KinStep;
  before: Id;
}

const K = COPY.kinship;

const map = (w: Word, f: (noun: string) => string): Word => ({
  he: f(w.he),
  she: f(w.she),
  they: w.they === undefined ? undefined : f(w.they),
});
const plain = (noun: string): Word => ({ he: noun, she: noun, they: noun });
const repeat = (w: Word, f: (noun: string) => string, n: number) => {
  for (let i = 0; i < n; i++) w = map(w, f);
  return w;
};

function genderOf(ix: Index, id: Id): Gender {
  const first = ix.person(id)?.pronouns?.trim().toLowerCase().split(/[\s/,]+/)[0];
  if (first === "he" || first === "him") return "he";
  if (first === "she" || first === "her") return "she";
  return "they";
}

const say = (w: Word, g: Gender) => g === "they" ? w.they ?? K.either(w.she, w.he) : w[g];

const isTwin = (kind: TieKind) => kind === "twin" || kind === "identical_twin";

function parentWord(ix: Index, tie: Tie, child: Id): Word {
  switch (tie.kind) {
    case "biological_parent": {
      const adopted = ix.tiesOf(child).some((t) =>
        t.to === child && t.kind === "adoptive_parent" && usable(ix, t)
      );
      return adopted ? map(K.parent, K.birth) : K.parent;
    }
    case "adoptive_parent":
      return map(K.parent, K.adoptive);
    case "step_parent":
      return map(K.parent, K.step);
    case "foster_parent":
      return map(K.parent, K.foster);
    case "guardian":
      return plain(K.guardian);
    case "gamete_donor":
      return plain(K.donor);
    case "gestational_carrier":
      return plain(K.carrier);
    default:
      return K.parent;
  }
}

function childWord(kind: TieKind): Word {
  switch (kind) {
    case "adoptive_parent":
      return map(K.child, K.adopted);
    case "step_parent":
      return map(K.child, K.step);
    case "foster_parent":
      return map(K.child, K.foster);
    case "guardian":
      return plain(K.ward);
    case "gamete_donor":
      return map(K.child, K.donorConceived);
    case "gestational_carrier":
      return plain(K.carried);
    default:
      return K.child;
  }
}

function single(ix: Index, { step, before }: Link): Word {
  const { tie } = step;
  switch (step.direction) {
    case "up":
      return parentWord(ix, tie, before);
    case "down":
      return childWord(tie.kind);
    case "partner": {
      const w = tie.kind === "spouse" ? K.spouse : K.partner;
      return isFormer(ix, tie) ? map(w, K.former) : w;
    }
  }
  switch (tie.kind) {
    case "twin":
      return map(K.sibling, K.twin);
    case "identical_twin":
      return map(K.sibling, K.identicalTwin);
    case "sibling_by_custom":
      return map(K.sibling, K.byCustom);
    case "chosen_family":
      return plain(K.chosen);
    case "incorporated_into_household":
      return plain(K.household);
    default:
      return plain(K.connection);
  }
}

/* A twin tie counts as one up and one down */
function shape(links: Link[]) {
  let ups = 0, downs = 0, twin = false;
  for (const { step } of links) {
    if (step.direction === "up") {
      if (downs || twin) return null;
      ups++;
    } else if (step.direction === "down") downs++;
    else if (step.direction === "across" && isTwin(step.tie.kind) && !twin && !downs) twin = true;
    else return null;
  }
  return { ups, twin, a: ups + (twin ? 1 : 0), b: downs + (twin ? 1 : 0) };
}

type Line = "blood" | "step" | "foster";

function lineOf(kind: TieKind): Line | null {
  switch (kind) {
    case "biological_parent":
    case "adoptive_parent":
    case "legal_parent":
    case "intended_parent":
    case "twin":
    case "identical_twin":
      return "blood";
    case "step_parent":
      return "step";
    case "foster_parent":
      return "foster";
    default:
      return null;
  }
}

/* null when guardians, donors, carriers, or mixed flavors are in the run */
function lineOfRun(links: Link[]): Line | null {
  let line: Line = "blood";
  for (const { step } of links) {
    const l = lineOf(step.tie.kind);
    if (!l) return null;
    if (l === "blood") continue;
    if (line !== "blood" && line !== l) return null;
    line = l;
  }
  return line;
}

function parentsOf(ix: Index, id: Id, families: TieFamily[]): Set<Id> {
  return new Set(
    ix.tiesOf(id)
      .filter((t) =>
        t.to === id && usable(ix, t) && KINDS[t.kind].ranks &&
        families.includes(KINDS[t.kind].family)
      )
      .map((t) => t.from),
  );
}

/* Half only when each has a parent the other lacks; a shared birth parent means only birth
   parents are compared */
function isHalf(ix: Index, links: Link[], ups: number): boolean {
  const ids = [links[ups - 1].before, links[ups].step.person];
  let [a, b] = ids.map((id) => parentsOf(ix, id, ["lineage"]));
  if (![...a].some((p) => b.has(p))) {
    [a, b] = ids.map((id) => parentsOf(ix, id, ["lineage", "legal"]));
  }
  return [...a].some((p) => !b.has(p)) && [...b].some((p) => !a.has(p));
}

/* A partnership whose end could be a partner's death isn't a former one */
function isFormer(ix: Index, tie: Tie): boolean {
  if (!tie.end) return false;
  const end = dateSpan(tie.end);
  if (!end) return true;
  return ![tie.from, tie.to].some((id) => {
    const died = dateSpan(lifeDates(ix, id).died);
    return died !== undefined && died.earliest <= end.latest && died.latest >= end.earliest;
  });
}

function cousin(a: number, b: number): string {
  const degree = Math.min(a, b) - 1, removed = Math.abs(a - b);
  const c = K.cousin(K.ordinals[degree - 1] ?? K.ordinal(degree));
  if (!removed) return c;
  return K.removed(c, removed === 1 ? K.once : removed === 2 ? K.twice : K.times(removed));
}

function nameRun(ix: Index, links: Link[]): Word | null {
  if (links.length === 1) return single(ix, links[0]);
  const s = shape(links);
  const line = s && lineOfRun(links);
  if (!s || !line) return null;
  const { a, b } = s;
  let w: Word;
  if (b === 0) w = repeat(map(K.parent, K.grand), K.great, a - 2);
  else if (a === 0) w = repeat(map(K.child, K.grand), K.great, b - 2);
  else if (a === 1 && b === 1) w = K.sibling;
  else if (b === 1) w = repeat(K.auntOrUncle, K.great, a - 2);
  else if (a === 1) w = repeat(K.nieceOrNephew, K.great, b - 2);
  else w = plain(cousin(a, b));
  const sideways = a > 0 && b > 0 && Math.min(a, b) === 1;
  if (line !== "blood") {
    if (a > 0 && b > 0 && !(a === 1 && b === 1)) return null;
    return map(w, line === "step" ? K.step : K.foster);
  }
  return sideways && !s.twin && isHalf(ix, links, s.ups) ? map(w, K.half) : w;
}

function bloodShape(links: Link[]): [number, number] | null {
  const s = shape(links);
  return s && lineOfRun(links) === "blood" ? [s.a, s.b] : null;
}

function nameWhole(ix: Index, links: Link[]): Word | null {
  const at = links.findIndex((l) => l.step.direction === "partner");
  if (at < 0) return nameRun(ix, links);
  if (links.findIndex((l, i) => i > at && l.step.direction === "partner") >= 0) return null;
  if (links.length === 1) return single(ix, links[0]);
  const before = bloodShape(links.slice(0, at)) ?? [-1, -1];
  const after = bloodShape(links.slice(at + 1)) ?? [-1, -1];
  const is = ([a, b]: number[], x: number, y: number) => a === x && b === y;
  let w: Word | null = null;
  if (at === 0) {
    if (is(after, 1, 0)) w = map(K.parent, K.inLaw);
    else if (is(after, 1, 1)) w = map(K.sibling, K.inLaw);
    else if (is(after, 0, 1)) w = map(K.child, K.step);
    else if (after[0] === 0) w = map(repeat(map(K.child, K.grand), K.great, after[1] - 2), K.step);
  } else if (at === links.length - 1) {
    if (is(before, 1, 1)) w = map(K.sibling, K.inLaw);
    else if (is(before, 0, 1)) w = map(K.child, K.inLaw);
    else if (is(before, 1, 0)) w = map(K.parent, K.step);
    else if (before[1] === 0 && before[0] > 1) {
      w = map(repeat(map(K.parent, K.grand), K.great, before[0] - 2), K.step);
    }
  } else if (is(before, 1, 0) && is(after, 0, 1)) w = map(K.sibling, K.step);
  return w && isFormer(ix, links[at].step.tie) ? map(w, K.former) : w;
}

function greedy(ix: Index, links: Link[], name: typeof nameRun): string[] {
  const out: string[] = [];
  for (let i = 0; i < links.length;) {
    let j = links.length;
    let w = name(ix, links.slice(i, j));
    while (!w) w = name(ix, links.slice(i, --j));
    out.push(say(w, genderOf(ix, links[j - 1].step.person)));
    i = j;
  }
  return out;
}

/* The fewer pieces wins; on a tie, partners stay separate pieces ("husband's cousin") */
function chainOf(ix: Index, links: Link[]): string[] {
  const runs = greedy(ix, links, nameRun), wholes = greedy(ix, links, nameWhole);
  return wholes.length < runs.length ? wholes : runs;
}

/* "Ann is Bo's ___" is kinName(ix, bo, ann); null when unconnected or the same person */
export function kinName(ix: Index, from: Id, to: Id): string | null {
  const path = kinPath(ix, from, to);
  if (!path?.length) return null;
  const links = path.map((step, i) => ({ step, before: i ? path[i - 1].person : from }));
  const whole = nameWhole(ix, links);
  return whole ? say(whole, genderOf(ix, to)) : K.chain(chainOf(ix, links));
}

/* null when unconnected */
export function kinNameFor(ix: Index, viewer: Id, person: Id): string | null {
  if (viewer === person) return K.you;
  const name = kinName(ix, viewer, person);
  return name === null ? null : K.your(name);
}
