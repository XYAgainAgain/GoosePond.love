import { COPY } from "../copy.ts";
import { branchKey, ringColor } from "../map/branches.ts";
import { lineStyle } from "../map/style.ts";
import { FAMILIES, FAMILY_ORDER, KINDS, type TieFamily, type TieKind } from "../records/kinds.ts";
import type { Person } from "../records/types.ts";
import { h } from "./dom.ts";
import { swatch } from "./legend.ts";

const OPEN = "goosepond.key";

function remembered(): boolean {
  try {
    return localStorage.getItem(OPEN) === "1";
  } catch {
    return false;
  }
}

/* One entry per distinct look among the shown kinds of line, named by family where that's enough */
export function keyLines(hidden: ReadonlySet<TieFamily>): { kind: TieKind; label: string }[] {
  const kinds = Object.keys(KINDS) as TieKind[];
  return FAMILY_ORDER.filter((f) => !hidden.has(f)).flatMap((family) => {
    const looks = new Map<string, TieKind[]>();
    for (const k of kinds.filter((k) => KINDS[k].family === family)) {
      const s = lineStyle(k);
      const look = `${s.line}${s.dash ?? ""}`;
      looks.set(look, [...(looks.get(look) ?? []), k]);
    }
    return [...looks.values()].map((group) => ({
      kind: group[0],
      label: looks.size > 1 ? group.map((k) => KINDS[k].label).join(", ") : FAMILIES[family].label,
    }));
  });
}

export function renderKey(
  people: readonly Person[],
  hidden: ReadonlySet<TieFamily>,
  picture: (whole: boolean) => void,
): HTMLDetailsElement {
  const lines = keyLines(hidden).map((l) => h("li", { class: "swatch" }, swatch(l.kind), l.label));
  const families = branchKey(people).map((b) =>
    h(
      "li",
      {},
      h("span", { class: "dot", attrs: { style: `background: ${ringColor(b.tone)}` } }),
      b.name,
    )
  );
  const details = h(
    "details",
    { class: "map-key", open: remembered() },
    h("summary", {}, COPY.key.title),
    h(
      "div",
      { class: "key-body" },
      h("h4", {}, COPY.key.lines),
      h("ul", {}, ...lines),
      h("h4", {}, COPY.key.families),
      families.length
        ? h("ul", { class: "families" }, ...families)
        : h("p", { class: "muted" }, COPY.key.noFamilies),
      h(
        "div",
        { class: "key-actions" },
        h("button", { type: "button", onclick: () => picture(false) }, COPY.picture.thisView),
        h("button", { type: "button", onclick: () => picture(true) }, COPY.picture.wholeMap),
      ),
    ),
  );
  details.addEventListener("toggle", () => {
    try {
      localStorage.setItem(OPEN, details.open ? "1" : "0");
    } catch {
      // private browsing
    }
  });
  return details;
}
