import { COPY } from "../copy.ts";
import { dateSpan, formatDate } from "../records/dates.ts";
import type { Index } from "../records/queries.ts";
import type { Id } from "../records/types.ts";
import { h } from "./dom.ts";
import { certaintyNote, EVENT_LABEL, period, ROLE_LABEL } from "./labels.ts";

export interface PlaceActions {
  pick(id: Id): void;
  setMarked(on: boolean): void;
}

/* Past holders included */
export function interestHolders(ix: Index): Set<Id> {
  return new Set(ix.archive.interests.map((i) => i.holder).filter((id) => ix.person(id)));
}

export function renderPlace(ix: Index, marked: boolean, act: PlaceActions): HTMLElement {
  const a = ix.archive;
  const entities = new Map(a.entities.map((e) => [e.id, e]));
  const held = new Set(a.interests.map((i) => i.place));
  const properties = a.places.filter((p) => held.has(p.id));
  const others = a.places.filter((p) => !held.has(p.id));

  if (a.places.length === 0 && a.entities.length === 0) {
    return h(
      "div",
      { class: "place" },
      h("h2", { tabIndex: -1 }, COPY.place.title),
      h("p", {}, COPY.place.none),
    );
  }

  const holder = (id: Id) =>
    ix.person(id)
      ? h(
        "button",
        { type: "button", class: "link", onclick: () => act.pick(id) },
        ix.person(id)!.name,
      )
      : h("span", {}, entities.get(id)?.name ?? COPY.place.holderNotOnRecord);

  const blocks = properties.map((p) => {
    const rows = a.interests
      .filter((i) => i.place === p.id)
      .sort((x, y) =>
        (dateSpan(x.start)?.earliest ?? -Infinity) - (dateSpan(y.start)?.earliest ?? -Infinity)
      )
      .map((i) =>
        h(
          "li",
          {},
          h("span", { class: "role" }, ROLE_LABEL[i.role] ?? COPY.roles.fallback),
          holder(i.holder),
          h(
            "span",
            { class: "muted" },
            [
              period(i.start, i.end),
              i.share ? COPY.roles.share(i.share) : "",
              certaintyNote(i.certainty),
            ].filter(Boolean).join(" · "),
          ),
        )
      );
    const events = a.events
      .filter((e) => e.place === p.id)
      .sort((x, y) =>
        (dateSpan(x.date)?.earliest ?? Infinity) - (dateSpan(y.date)?.earliest ?? Infinity)
      )
      .slice(0, 12)
      .map((e) =>
        h(
          "li",
          {},
          h("span", { class: "role" }, EVENT_LABEL[e.kind] ?? COPY.events.fallback),
          h("span", {}, e.date ? formatDate(e.date) : COPY.dates.eventUnknown),
          e.note && h("span", { class: "muted" }, e.note),
        )
      );
    return h(
      "section",
      {},
      h("h3", {}, p.name),
      !!p.aliases?.length && h("p", { class: "muted" }, COPY.place.alsoCalled(p.aliases)),
      p.note && h("p", {}, p.note),
      h("h4", {}, COPY.place.heldRole),
      h("ul", {}, ...rows),
      events.length > 0 && h("h4", {}, COPY.place.happened),
      events.length > 0 && h("ul", {}, ...events),
    );
  });

  return h(
    "div",
    { class: "place" },
    h("h2", { tabIndex: -1 }, properties.length === 1 ? properties[0].name : COPY.place.title),
    h("p", { class: "muted" }, COPY.place.rolesNote),
    h("button", {
      type: "button",
      onclick: () => act.setMarked(!marked),
      attrs: { "aria-pressed": String(marked) },
    }, COPY.place.ring),
    ...blocks,
    a.entities.length > 0 && h(
      "section",
      {},
      h("h3", {}, COPY.place.bodies),
      h(
        "ul",
        {},
        ...a.entities.map((e) =>
          h("li", {}, h("span", {}, e.name), e.note && h("span", { class: "muted" }, e.note))
        ),
      ),
    ),
    others.length > 0 && h(
      "section",
      {},
      h("h3", {}, COPY.place.otherPlaces),
      h(
        "ul",
        {},
        ...others.map((p) =>
          h("li", {}, h("span", {}, p.name), p.note && h("span", { class: "muted" }, p.note))
        ),
      ),
    ),
  );
}
