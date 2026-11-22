import { COPY } from "../copy.ts";
import type { Index } from "../records/queries.ts";
import type { Id, Person } from "../records/types.ts";
import { yearsLabel } from "../map/elements.ts";
import { clear, h } from "./dom.ts";

const LIMIT = 8;

export interface Search {
  el: HTMLElement;
  setIndex(ix: Index): void;
}

function names(p: Person): string[] {
  return [p.name, p.birthName ?? "", ...(p.aliases ?? [])].map((n) => n.toLowerCase());
}

export function createSearch(onPick: (id: Id) => void): Search {
  let ix: Index | undefined;
  let hits: Person[] = [];
  let active = -1;

  const input = h("input", {
    type: "search",
    placeholder: COPY.search.placeholder,
    autocomplete: "off",
    attrs: {
      role: "combobox",
      "aria-label": COPY.search.label,
      "aria-expanded": "false",
      "aria-controls": "search-results",
      "aria-autocomplete": "list",
    },
  });
  const list = h("ul", { id: "search-results", hidden: true, attrs: { role: "listbox" } });
  const el = h("div", { class: "search" }, input, list);

  function close() {
    hits = [];
    active = -1;
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function pick(p: Person) {
    input.value = "";
    close();
    onPick(p.id);
  }

  function highlight() {
    [...list.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
    if (active >= 0) input.setAttribute("aria-activedescendant", `search-hit-${active}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function render() {
    clear(list);
    const index = ix;
    if (!index) return;
    hits.forEach((p, i) => {
      const years = yearsLabel(index, p.id);
      const li = h(
        "li",
        { id: `search-hit-${i}`, attrs: { role: "option", "aria-selected": "false" } },
        h("span", {}, p.name),
        years && h("span", { class: "muted" }, years),
      );
      li.addEventListener("pointerdown", (e) => e.preventDefault());
      li.addEventListener("click", () => pick(p));
      list.append(li);
    });
    list.hidden = hits.length === 0;
    input.setAttribute("aria-expanded", String(hits.length > 0));
    highlight();
  }

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!ix || !q) return close(), clear(list);
    const starts: Person[] = [];
    const holds: Person[] = [];
    for (const p of ix.archive.people) {
      const all = names(p);
      if (all.some((n) => n.startsWith(q) || n.includes(` ${q}`))) starts.push(p);
      else if (all.some((n) => n.includes(q))) holds.push(p);
      if (starts.length >= LIMIT) break;
    }
    hits = [...starts, ...holds].slice(0, LIMIT);
    active = hits.length ? 0 : -1;
    render();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      close();
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(hits[active]);
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && hits.length) {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      active = (active + step + hits.length) % hits.length;
      highlight();
    }
  });
  input.addEventListener("blur", close);

  return {
    el,
    setIndex(next) {
      ix = next;
      input.value = "";
      close();
    },
  };
}
