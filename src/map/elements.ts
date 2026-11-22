import type cytoscape from "cytoscape";
import type { Connectors } from "../arrange/connectors.ts";
import type { Rows } from "../arrange/rows.ts";
import { COPY } from "../copy.ts";
import { dateSpan } from "../records/dates.ts";
import { KINDS } from "../records/kinds.ts";
import { type Index, lifeDates } from "../records/queries.ts";
import type { FuzzyDate, Id, Person } from "../records/types.ts";
import { branchTones, ringColor } from "./branches.ts";
import { placeholderPortrait } from "./portraits.ts";

function year(d: FuzzyDate | undefined): string | undefined {
  const span = dateSpan(d);
  if (!span) return undefined;
  const text = span.earliest === span.latest
    ? String(span.earliest)
    : `${span.earliest}/${span.latest}`;
  return span.approximate ? COPY.dates.roughYear(text) : text;
}

/* "1921–1998", "b. 1946", "d. 1998", or nothing when neither is known */
export function yearsLabel(ix: Index, id: Id): string {
  const { born, died } = lifeDates(ix, id);
  const b = year(born), d = year(died);
  if (b && d) return COPY.dates.lifespan(b, d);
  if (b) return COPY.dates.bornYear(b);
  if (d) return COPY.dates.diedYear(d);
  return "";
}

export const shownName = (p: Person) => p.badge ? `${p.badge} ${p.name}` : p.name;

export function toElements(
  ix: Index,
  rows: Rows,
  portraits: boolean,
): cytoscape.ElementDefinition[] {
  const media = new Map(ix.archive.media.map((m) => [m.id, m]));
  const tones = branchTones(ix.archive.people);
  const nodes = ix.archive.people.map((p) => {
    const years = yearsLabel(ix, p.id);
    const tint = tones.get(p.id) ?? [];
    const src = p.portrait ? media.get(p.portrait)?.src : undefined;
    const portrait = portraits ? src ?? placeholderPortrait(p.name, tint) : undefined;
    return {
      data: {
        id: p.id,
        label: years ? `${shownName(p)}\n${years}` : shownName(p),
        short: p.badge ? `${p.badge} ${p.name.split(/\s+/)[0]}` : p.name.split(/\s+/)[0],
        row: rows.row.get(p.id) ?? 0,
        ...(portrait ? { portrait } : {}),
        ...(tint.length ? { branch: ringColor(tint[0]) } : {}),
        ...(tint.length > 1 ? { blend: tint.map(ringColor).join(" ") } : {}),
      },
    };
  });
  const edges = ix.archive.ties
    .filter((t) => ix.person(t.from) && ix.person(t.to) && t.kind in KINDS)
    .map((t) => ({
      data: {
        id: t.id,
        source: t.from,
        target: t.to,
        kind: t.kind,
        family: KINDS[t.kind].family,
        directed: KINDS[t.kind].directed,
        ...(KINDS[t.kind].pairs && t.end ? { ended: true } : {}),
      },
    }));
  return [...nodes, ...edges];
}

/* Hidden until the generations view has settled */
export function connectorElements(c: Connectors): cytoscape.ElementDefinition[] {
  return [
    ...c.joints.map((j) => ({
      group: "nodes" as const,
      data: {
        id: j.id,
        family: j.family,
        lit: j.lit,
        ...(j.label ? { label: j.label } : {}),
        ...(j.ties ? { ties: j.ties } : {}),
        ...(j.twins?.length ? { twins: j.twins } : {}),
      },
      position: { x: j.x, y: j.y },
      classes: "bus away",
    })),
    ...c.lines.map((l) => ({
      group: "edges" as const,
      data: {
        id: l.id,
        source: l.source,
        target: l.target,
        kind: l.kind,
        family: l.family,
        lit: l.lit,
        ...(l.turn !== undefined ? { turn: l.turn } : {}),
        ...(l.ties ? { ties: l.ties } : {}),
        ...(l.twins?.length ? { twins: l.twins } : {}),
      },
      classes: "bus away",
    })),
  ];
}
