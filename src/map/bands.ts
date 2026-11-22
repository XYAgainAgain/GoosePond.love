import { NODE, SLOT } from "../arrange/geometry.ts";
import type { Rows } from "../arrange/rows.ts";
import { COPY } from "../copy.ts";
import { dateSpan } from "../records/dates.ts";
import { type Index, lifeDates } from "../records/queries.ts";
import type { Id } from "../records/types.ts";
import { branchTones, ringColor } from "./branches.ts";

export interface Band {
  top: number;
  bottom: number;
  label: string;
}

export interface Region {
  /* Left to right along one row */
  ids: Id[];
  color: string;
}

/* Model px from a row's node centers up to where its band starts, clearing the lanes above it */
const ABOVE = NODE / 2 + 26;

/* Each band holds its row's people and the lines down to their children */
export function rowBands(ix: Index, rows: Rows, rowY: number[]): Band[] {
  const span = rowY.map(() => ({ lo: Infinity, hi: -Infinity }));
  for (const [id, r] of rows.row) {
    const born = dateSpan(lifeDates(ix, id).born);
    if (!born || !span[r]) continue;
    span[r].lo = Math.min(span[r].lo, born.earliest);
    span[r].hi = Math.max(span[r].hi, born.latest);
  }
  return rowY.map((y, r) => ({
    top: y - ABOVE,
    bottom: r + 1 < rowY.length ? rowY[r + 1] - ABOVE : y + NODE / 2 + 60,
    label: span[r].lo <= span[r].hi ? COPY.map.bornSpan(span[r].lo, span[r].hi) : "",
  }));
}

/* Runs of neighbors on a row who share a branch's first tone */
export function branchRegions(ix: Index, rows: Rows, x: Map<Id, number>): Region[] {
  const tones = branchTones(ix.archive.people);
  const byRow = new Map<number, Id[]>();
  for (const [id, r] of rows.row) if (x.has(id)) byRow.set(r, [...(byRow.get(r) ?? []), id]);
  const regions: Region[] = [];
  for (const ids of byRow.values()) {
    ids.sort((a, b) => x.get(a)! - x.get(b)!);
    let run: Id[] = [];
    const close = () => {
      const tone = tones.get(run[0])?.[0];
      if (run.length > 1 && tone) regions.push({ ids: run, color: ringColor(tone) });
    };
    for (const id of ids) {
      const prev = run.at(-1);
      const same = prev !== undefined && tones.get(prev)?.[0] === tones.get(id)?.[0] &&
        x.get(id)! - x.get(prev)! <= SLOT * 1.5;
      if (!same) {
        if (run.length) close();
        run = [];
      }
      run.push(id);
    }
    if (run.length) close();
  }
  return regions;
}
