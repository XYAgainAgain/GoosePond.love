import { COPY } from "../copy.ts";
import type { ViewName } from "../map/view.ts";
import type { TieFamily } from "../records/kinds.ts";
import { h } from "./dom.ts";

export type Dataset = "shire" | "fixture" | "generated" | "private";

export interface Settings {
  dataset: Dataset;
  size: number;
  seed: number;
  view: ViewName;
  portraits: boolean;
  webgl: boolean;
  lightCanvas: boolean;
  hidden: TieFamily[];
}

export interface DevInfo {
  readout: string[];
  movement: string;
}

export interface DevActions {
  change(patch: Partial<Settings>): void;
  rerun(): void;
  fit(): void;
  measure(): void;
  lock(): void;
}

const SIZES = [50, 250, 500, 1000];

export function renderDev(s: Settings, info: DevInfo, act: DevActions): HTMLElement {
  const dataset = h(
    "select",
    { id: "dev-dataset" },
    h("option", { value: "shire", selected: s.dataset === "shire" }, COPY.dev.shire),
    h("option", { value: "generated", selected: s.dataset === "generated" }, COPY.dev.generated),
    h("option", { value: "fixture", selected: s.dataset === "fixture" }, COPY.dev.fixture),
    s.dataset === "private" &&
      h("option", { value: "private", selected: true, disabled: true }, COPY.dev.private),
  );
  dataset.addEventListener("change", () => act.change({ dataset: dataset.value as Dataset }));

  const size = h(
    "select",
    { id: "dev-size", disabled: s.dataset !== "generated" },
    ...SIZES.map((n) =>
      h("option", { value: String(n), selected: s.size === n }, COPY.dev.people(n))
    ),
  );
  size.addEventListener("change", () => act.change({ size: Number(size.value) }));

  const seed = h("input", {
    id: "dev-seed",
    type: "number",
    min: "1",
    value: String(s.seed),
    disabled: s.dataset !== "generated",
  });
  seed.addEventListener("change", () => act.change({ seed: Math.max(1, Number(seed.value) || 1) }));

  const check = (label: string, on: boolean, set: (v: boolean) => void) => {
    const box = h("input", { type: "checkbox", checked: on });
    box.addEventListener("change", () => set(box.checked));
    return h("label", { class: "check" }, box, label);
  };

  return h(
    "div",
    { class: "dev" },
    h("h2", { tabIndex: -1 }, COPY.dev.title),
    h(
      "section",
      {},
      h("h3", {}, COPY.dev.familyShown),
      h("label", { htmlFor: "dev-dataset" }, COPY.dev.family),
      dataset,
      h("label", { htmlFor: "dev-size" }, COPY.dev.size),
      size,
      h("label", { htmlFor: "dev-seed" }, COPY.dev.seed),
      h(
        "div",
        { class: "row" },
        seed,
        h("button", {
          type: "button",
          disabled: s.dataset !== "generated",
          onclick: () => act.change({ seed: 1 + Math.floor(Math.random() * 99999) }),
        }, COPY.dev.newSeed),
      ),
    ),
    h(
      "section",
      {},
      h("h3", {}, COPY.dev.drawing),
      check(COPY.dev.portraits, s.portraits, (portraits) => act.change({ portraits })),
      check(COPY.dev.webgl, s.webgl, (webgl) => act.change({ webgl })),
      check(COPY.dev.lightCanvas, s.lightCanvas, (lightCanvas) => act.change({ lightCanvas })),
      h(
        "div",
        { class: "row" },
        h("button", { type: "button", onclick: act.rerun }, COPY.dev.rerun),
        h("button", { type: "button", onclick: act.fit }, COPY.dev.fit),
        h("button", { type: "button", onclick: act.measure }, COPY.dev.measure),
      ),
      ...info.readout.map((line) => h("p", { class: "readout" }, line)),
      h("p", { class: "readout", id: "dev-fps" }),
      info.movement && h("p", { class: "readout" }, info.movement),
    ),
    h(
      "section",
      {},
      h("h3", {}, COPY.dev.frontDoor),
      h("button", { type: "button", onclick: act.lock }, COPY.dev.lock),
    ),
    h(
      "p",
      { class: "readout" },
      COPY.dev.version(__BUILD__, Boolean(navigator.serviceWorker?.controller)),
    ),
  );
}
