import { COPY } from "../copy.ts";
import { lineStyle } from "../map/style.ts";
import { currentTheme } from "./settings.ts";
import { mapColors } from "./themes.ts";
import { FAMILIES, FAMILY_ORDER, KINDS, type TieFamily, type TieKind } from "../records/kinds.ts";
import { h } from "./dom.ts";

const SVG = "http://www.w3.org/2000/svg";

export function swatch(kind: TieKind): SVGElement {
  const s = lineStyle(kind, mapColors(currentTheme()).ground);
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 44 10");
  svg.setAttribute("width", "44");
  svg.setAttribute("height", "10");
  svg.setAttribute("aria-hidden", "true");
  const line = document.createElementNS(SVG, "line");
  line.setAttribute("x1", "2");
  line.setAttribute("x2", "42");
  line.setAttribute("y1", "5");
  line.setAttribute("y2", "5");
  line.setAttribute("stroke", s.color);
  line.setAttribute("stroke-width", String(Math.min(4, s.width)));
  if (s.line === "dotted") {
    line.setAttribute("stroke-dasharray", "0.1 6");
    line.setAttribute("stroke-linecap", "round");
  } else if (s.dash) {
    line.setAttribute("stroke-dasharray", s.dash.map((d) => d * 0.6).join(" "));
  }
  svg.append(line);
  return svg;
}

export function renderLayers(
  hidden: ReadonlySet<TieFamily>,
  onChange: (family: TieFamily, shown: boolean) => void,
): HTMLElement {
  const kinds = Object.keys(KINDS) as TieKind[];
  const rows = FAMILY_ORDER.map((family) => {
    const box = h("input", { type: "checkbox", checked: !hidden.has(family) });
    box.addEventListener("change", () => onChange(family, box.checked));
    const styles = new Map<string, TieKind[]>();
    for (const kind of kinds.filter((k) => KINDS[k].family === family)) {
      const s = lineStyle(kind);
      const key = `${s.line}${s.dash ?? ""}`;
      styles.set(key, [...(styles.get(key) ?? []), kind]);
    }
    return h(
      "li",
      {},
      h("label", {}, box, h("strong", {}, FAMILIES[family].label)),
      h(
        "ul",
        {},
        ...[...styles.values()].map((group) => {
          const li = h("li", { class: "swatch" });
          li.append(swatch(group[0]), group.map((k) => KINDS[k].label).join(", "));
          return li;
        }),
      ),
    );
  });
  return h(
    "div",
    { class: "layers" },
    h("h2", { tabIndex: -1 }, COPY.legend.title),
    h("p", { class: "muted" }, COPY.legend.note),
    h("ul", {}, ...rows),
  );
}
