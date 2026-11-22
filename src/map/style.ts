import type cytoscape from "cytoscape";
import { NODE } from "../arrange/geometry.ts";
import { KINDS, type TieFamily, type TieKind } from "../records/kinds.ts";

export interface LineStyle {
  color: string;
  line: "solid" | "dashed" | "dotted";
  dash?: number[];
  width: number;
}

const FAMILY_STYLE: Record<TieFamily, LineStyle> = {
  lineage: { color: "#c4c4c4", line: "solid", width: 2 },
  legal: { color: "#6fbf94", line: "dashed", dash: [9, 5], width: 2 },
  care: { color: "#d1a35c", line: "dotted", width: 2.5 },
  assisted: { color: "#b497e0", line: "dashed", dash: [12, 4, 2, 4], width: 2 },
  partnership: { color: "#e06c6c", line: "solid", width: 4.5 },
  chosen: { color: "#5fb3e0", line: "dotted", width: 4.5 },
  other: { color: "#8a9097", line: "solid", width: 1.5 },
};

/* The same hues, darkened to read on a light background */
const ON_LIGHT: Record<TieFamily, string> = {
  lineage: "#6e6e6e",
  legal: "#2e8a5a",
  care: "#9a6418",
  assisted: "#7a52bd",
  partnership: "#c23a3a",
  chosen: "#1e7db3",
  other: "#5e646b",
};

export type Ground = "dark" | "light";

export function lineStyle(kind: TieKind, ground: Ground = "dark"): LineStyle {
  const family = KINDS[kind].family;
  const base = ground === "light"
    ? { ...FAMILY_STYLE[family], color: ON_LIGHT[family] }
    : FAMILY_STYLE[family];
  return kind === "partner" ? { ...base, line: "dashed", dash: [10, 6] } : base;
}

export interface MapColors {
  ink: string;
  labelBg: string;
  border: string;
  muted: string;
  ground: Ground;
}

/* Labels are drawn on canvas, so CSS never reaches them */
export interface LabelText {
  scale: number;
  family: string;
}

export function mapStyle(
  colors: MapColors,
  text: LabelText = { scale: 1, family: "National Park" },
): cytoscape.StylesheetJson {
  const sheet: cytoscape.StylesheetJson = [
    {
      selector: "node",
      style: {
        width: NODE,
        height: NODE,
        "background-color": "#5d6a61",
        "border-width": 2,
        "border-color": colors.border,
        "font-family": `"${text.family}", system-ui, sans-serif`,
        "font-size": 11 * text.scale,
        color: colors.ink,
        "text-valign": "bottom",
        "text-margin-y": 10, // clears the branch ring's underlay and the selected border
        // Scaled with font-size, so READABLE in view.ts (their ratio) holds at every text size
        "min-zoomed-font-size": 7 * text.scale,
        "text-background-color": colors.labelBg,
        "text-background-opacity": 0.8,
        "text-background-padding": "1px",
        "text-wrap": "wrap",
        "text-max-width": "78px",
      },
    },
    { selector: "node[label]", style: { label: "data(label)" } },
    { selector: "node.brief[short]", style: { label: "data(short)" } },
    { selector: "node.brief[label]:selected", style: { label: "data(label)" } },
    {
      selector: "node[portrait]",
      style: { "background-image": "data(portrait)", "background-fit": "cover" },
    },
    {
      selector: "node[branch]",
      style: {
        "underlay-color": "data(branch)",
        "underlay-padding": 5,
        "underlay-opacity": 1,
        "underlay-shape": "ellipse",
      },
    },
    {
      selector: "node[blend]",
      style: {
        "underlay-fill": "linear-gradient",
        "underlay-gradient-stop-colors": (n: cytoscape.NodeSingular) => n.data("blend"),
        "underlay-gradient-direction": "to-right",
      },
    },
    {
      selector: "node.marked",
      style: {
        "border-width": 4,
        "border-color": colors.ground === "light" ? "#b07a00" : "#ffd166",
      },
    },
    { selector: "node.trail", style: { "border-width": 4, "border-color": colors.ink } },
    { selector: "node:selected", style: { "border-width": 5, "border-color": "#ff9d5c" } },
    {
      selector: "edge",
      style: { "curve-style": "bezier", "control-point-step-size": 26, "arrow-scale": 0.9 },
    },
  ];
  for (const kind of Object.keys(KINDS) as TieKind[]) {
    const s = lineStyle(kind, colors.ground);
    sheet.push({
      selector: `edge[kind = "${kind}"]`,
      style: {
        width: s.width,
        "line-color": s.color,
        "line-style": s.line,
        ...(s.dash ? { "line-dash-pattern": s.dash } : {}),
        "target-arrow-shape": KINDS[kind].directed ? "triangle" : "none",
        "target-arrow-color": s.color,
      },
    });
  }
  sheet.push(
    {
      selector: "node.bus",
      style: {
        width: 1,
        height: 1,
        "background-opacity": 0,
        "border-width": 0,
        events: "no",
        "font-size": 9 * text.scale,
        color: colors.muted,
        "text-valign": "center",
        "text-margin-y": 0,
        "text-background-opacity": 0,
      },
    },
    {
      selector: "edge.taxi",
      style: {
        "curve-style": "round-taxi",
        "taxi-direction": "vertical",
        "taxi-radius": 10,
        "target-arrow-shape": "none",
      },
    },
    {
      selector: "edge.bus",
      style: { "curve-style": "straight", "target-arrow-shape": "none", events: "no" },
    },
    {
      selector: "edge.bus[turn]",
      style: {
        "curve-style": "round-taxi",
        "taxi-direction": "downward",
        "taxi-turn": "data(turn)",
        "taxi-turn-min-distance": 0,
        "taxi-radius": 10,
        "edge-distances": "node-position",
      },
    },
    {
      selector: "edge[arc]",
      style: {
        "curve-style": "unbundled-bezier",
        "control-point-distances": (e: cytoscape.EdgeSingular) => e.data("arc"),
        "control-point-weights": 0.5,
      },
    },
    { selector: "edge[?ended]", style: { width: 2, opacity: 0.5 } },
    { selector: "edge.calm", style: { width: 1.25, opacity: 0.3, "target-arrow-shape": "none" } },
    { selector: "edge.calm.lit", style: { width: 2.5, opacity: 0.95 } },
    { selector: "edge.calm.lit[?directed]", style: { "target-arrow-shape": "triangle" } },
    { selector: ".bus.hush", style: { opacity: 0.4 } },
    { selector: "edge.bus.lit", style: { width: 3 } },
    { selector: ".dim", style: { opacity: 0.1 } },
    // Width as well as opacity, so a lit chain still reads in each tie kind's own line style
    { selector: "edge.trail", style: { width: 4.5, opacity: 1 } },
    { selector: "node.bus.trail", style: { opacity: 1 } },
    { selector: ".off, .away", style: { display: "none" } },
  );
  return sheet;
}
