import { COPY } from "../copy.ts";
import { branchTones, ringColor } from "../map/branches.ts";
import { shownName } from "../map/elements.ts";
import { placeholderPortrait } from "../map/portraits.ts";
import { dateSpan, formatDate } from "../records/dates.ts";
import { FAMILIES, FAMILY_ORDER, isParentFigure, KINDS } from "../records/kinds.ts";
import { kinNameFor } from "../records/kinship.ts";
import { type Index, lifeDates, type Reach, siblingsOf } from "../records/queries.ts";
import type { Id, Tie } from "../records/types.ts";
import { h } from "./dom.ts";
import type { LightboxItem } from "./lightbox.ts";
import { certaintyNote, EVENT_LABEL, period, ROLE_LABEL } from "./labels.ts";

export interface PersonActions {
  pick(id: Id): void;
  center(): void;
  setFocus(on: boolean): void;
  setReach(reach: Reach): void;
  lookAs(id: Id): void;
  connect(): void;
  trace(from: Id, to: Id): void;
  /* Present only when the family shown can be edited */
  edit?: () => void;
  view?: (items: LightboxItem[], index: number) => void;
}

export interface Looking {
  /* Who "your" means, if anyone */
  viewer: Id | null;
  /* Picked with "That's me", rather than the home person standing in */
  chosen: Id | null;
  /* Waiting for a second pick to connect to */
  pairing: boolean;
}

export interface FocusState {
  on: boolean;
  reach: Reach;
}

function section(title: string, ...body: (Node | string | false)[]): HTMLElement | false {
  const kept = body.filter((b): b is Node | string => !!b);
  return kept.length > 0 && h("section", {}, h("h3", {}, title), ...kept);
}

function detail(...parts: string[]): HTMLElement | false {
  const text = parts.filter(Boolean).join(" · ");
  return !!text && h("span", { class: "muted" }, text);
}

const REACHES: [Reach, string][] = [
  [1, COPY.person.closeFamily],
  [2, COPY.person.twoSteps],
  ["up", COPY.person.ancestors],
  ["down", COPY.person.descendants],
  ["both", COPY.person.bothLines],
];

export function renderPerson(
  ix: Index,
  id: Id,
  focus: FocusState,
  looking: Looking,
  act: PersonActions,
): HTMLElement {
  const person = ix.person(id);
  if (!person) return h("div", {}, COPY.person.missing);
  const a = ix.archive;
  const name = (pid: Id) => ix.person(pid)?.name ?? COPY.person.notOnRecord;
  const link = (pid: Id) =>
    ix.person(pid)
      ? h("button", { type: "button", class: "link", onclick: () => act.pick(pid) }, name(pid))
      : h("span", {}, name(pid));

  const { born, died } = lifeDates(ix, id);
  const media = new Map(a.media.map((m) => [m.id, m]));
  const tones = branchTones(a.people);
  const face = (pid: Id) => {
    const p = ix.person(pid)!;
    return (p.portrait && media.get(p.portrait)?.src) ||
      placeholderPortrait(p.name, tones.get(pid));
  };
  const portrait = face(id);
  const { viewer } = looking;
  const relation = viewer && viewer !== id ? kinNameFor(ix, viewer, id) : null;
  const ring = tones.get(id)?.[0];
  const facts = [
    born && COPY.person.born(formatDate(born)),
    died && COPY.person.died(formatDate(died)),
    !born && !died && COPY.person.datesUnknown,
    person.living === true && COPY.person.living,
    person.pronouns,
  ].filter((f): f is string => !!f);

  const head = h(
    "header",
    { class: "person-head" },
    h("img", {
      src: portrait,
      alt: "",
      width: 104,
      height: 104,
      attrs: ring ? { style: `border-color: ${ringColor(ring)}` } : {},
    }),
    h(
      "div",
      {},
      h("h2", { tabIndex: -1 }, shownName(person)),
      relation && h("button", {
        type: "button",
        class: "link kin-line",
        title: COPY.person.showHow,
        onclick: () => act.trace(viewer!, id),
      }, relation),
      h("p", { class: "muted" }, facts.join(" · ")),
      person.birthName && h("p", { class: "muted" }, COPY.person.bornAs(person.birthName)),
      !!person.aliases?.length &&
        h("p", { class: "muted" }, COPY.person.alsoKnownAs(person.aliases)),
    ),
  );

  const actions = h(
    "div",
    { class: "row" },
    h("button", { type: "button", onclick: act.center }, COPY.person.centerOnMap),
    act.edit && h("button", { type: "button", onclick: act.edit }, COPY.person.edit),
    h("button", {
      type: "button",
      onclick: () => act.lookAs(id),
      attrs: { "aria-pressed": String(looking.chosen === id) },
    }, COPY.person.thatsMe),
    h("button", {
      type: "button",
      onclick: act.connect,
      attrs: { "aria-pressed": String(looking.pairing) },
    }, COPY.person.connect),
    h("button", {
      type: "button",
      onclick: () => act.setFocus(!focus.on),
      attrs: { "aria-pressed": String(focus.on) },
    }, COPY.person.dimOthers),
    focus.on && h(
      "span",
      { class: "segmented", attrs: { role: "group", "aria-label": COPY.person.howFar } },
      ...REACHES.map(([reach, label]) =>
        h("button", {
          type: "button",
          onclick: () => act.setReach(reach),
          attrs: { "aria-pressed": String(focus.reach === reach) },
        }, label)
      ),
    ),
  );

  const ties = ix.tiesOf(id).filter((t) => t.kind in KINDS);
  const kin = (pick: (t: Tie) => Id | undefined) => [
    ...new Set(ties.flatMap((t) => pick(t) ?? []).filter((p) => ix.person(p))),
  ];
  const faceButton = (pid: Id) =>
    h(
      "li",
      {},
      h(
        "button",
        { type: "button", class: "kin", onclick: () => act.pick(pid) },
        h("img", { src: face(pid), alt: "", width: 48, height: 48, loading: "lazy" }),
        h("span", {}, ix.person(pid)!.name.split(/\s+/)[0]),
      ),
    );
  const strip = [
    [
      COPY.person.stripParents,
      kin((t) => t.to === id && isParentFigure(t.kind) ? t.from : undefined),
    ],
    [
      COPY.person.stripPartners,
      kin((t) =>
        KINDS[t.kind].family === "partnership" ? (t.from === id ? t.to : t.from) : undefined
      ),
    ],
    [
      COPY.person.stripChildren,
      kin((t) => t.from === id && isParentFigure(t.kind) ? t.to : undefined),
    ],
  ] as const;
  const shownStrip = strip.some(([, ids]) => ids.length) && h(
    "nav",
    { class: "strip", attrs: { "aria-label": COPY.person.stripLabel(person.name) } },
    ...strip.flatMap(([title, ids]) =>
      ids.length
        ? [
          h("div", { class: "strip-row" }, h("h4", {}, title), h("ul", {}, ...ids.map(faceButton))),
        ]
        : []
    ),
  );
  const tieItem = (t: Tie) => {
    const other = t.to === id ? t.from : t.to;
    const role = t.to === id ? KINDS[t.kind].fromRole : KINDS[t.kind].toRole;
    return h(
      "li",
      {},
      h("span", { class: "role" }, role),
      link(other),
      detail(period(t.start, t.end), t.note ?? "", certaintyNote(t.certainty)),
    );
  };
  const family = FAMILY_ORDER.flatMap((f) => {
    const group = ties.filter((t) => KINDS[t.kind].family === f);
    return group.length ? [h("h4", {}, FAMILIES[f].label), h("ul", {}, ...group.map(tieItem))] : [];
  });

  const siblings = siblingsOf(ix, id).map((s) =>
    h(
      "li",
      {},
      link(s.id),
      detail(COPY.person.shares(s.shared.map(name))),
    )
  );

  const events = [...ix.eventsOf(id)]
    .sort((x, y) =>
      (dateSpan(x.date)?.earliest ?? Infinity) - (dateSpan(y.date)?.earliest ?? Infinity)
    )
    .map((e) => {
      const others = e.people.filter((p) => p !== id);
      const place = a.places.find((p) => p.id === e.place)?.name;
      return h(
        "li",
        {},
        h("span", { class: "role" }, EVENT_LABEL[e.kind] ?? COPY.events.fallback),
        h("span", {}, e.date ? formatDate(e.date) : COPY.dates.eventUnknown),
        detail(
          others.length ? COPY.person.with(others.map(name)) : "",
          place ? COPY.person.at(place) : "",
          e.note ?? "",
          certaintyNote(e.certainty),
        ),
      );
    });

  const interests = a.interests.filter((i) => i.holder === id).map((i) =>
    h(
      "li",
      {},
      h("span", { class: "role" }, ROLE_LABEL[i.role] ?? COPY.roles.fallback),
      h("span", {}, a.places.find((p) => p.id === i.place)?.name ?? COPY.person.placeNotOnRecord),
      detail(
        period(i.start, i.end),
        i.share ? COPY.roles.share(i.share) : "",
        certaintyNote(i.certainty),
      ),
    )
  );

  const shown = a.media.filter((m) => m.people.includes(id));
  const viewable = shown.filter((m) => m.src);
  const slides = viewable.map((m): LightboxItem => ({
    src: m.src!,
    title: m.title,
    detail: [m.date && formatDate(m.date), m.credit].filter(Boolean).join(" · ") || undefined,
  }));
  const photos = shown.map((m) =>
    h(
      "li",
      { class: "media" },
      m.src
        ? act.view
          ? h(
            "button",
            {
              type: "button",
              class: "media-open",
              onclick: () => act.view!(slides, viewable.indexOf(m)),
              attrs: { "aria-label": m.title },
            },
            h("img", { src: m.src, alt: "", loading: "lazy" }),
          )
          : h("img", { src: m.src, alt: m.title, loading: "lazy" })
        : h(
          "div",
          { class: "media-blank" },
          m.kind === "photo" ? COPY.person.photoToCome : COPY.person.scanToCome,
        ),
      h("span", {}, m.title),
      detail(m.date ? formatDate(m.date) : "", m.credit ?? ""),
    )
  );

  const mine = new Set<Id>([id, ...ties.map((t) => t.id), ...ix.eventsOf(id).map((e) => e.id)]);
  const claims = a.claims.filter((c) => mine.has(c.about)).map((c) =>
    h("li", {}, h("span", {}, c.statement), detail(certaintyNote(c.certainty)))
  );

  const cited = new Set<Id>([
    ...ties.flatMap((t) => t.sources ?? []),
    ...ix.eventsOf(id).flatMap((e) => e.sources ?? []),
    ...a.interests.filter((i) => i.holder === id).flatMap((i) => i.sources ?? []),
    ...a.claims.filter((c) => mine.has(c.about)).flatMap((c) => c.sources ?? []),
  ]);
  const sources = a.sources.filter((s) => cited.has(s.id)).map((s) =>
    h(
      "li",
      {},
      h("span", {}, s.title),
      detail(s.citation ?? "", s.providedBy ? COPY.person.from(s.providedBy) : ""),
    )
  );

  const list = (items: HTMLElement[], cls = "") =>
    items.length > 0 && h("ul", { class: cls }, ...items);

  return h(
    "div",
    { class: "person" },
    head,
    actions,
    shownStrip,
    person.bio && h("p", { class: "bio" }, person.bio),
    section(COPY.person.familyAndTies, ...family),
    section(
      COPY.person.siblings,
      siblings.length > 0 && h("p", { class: "muted" }, COPY.person.siblingsNote),
      list(siblings),
    ),
    section(COPY.person.lifeEvents, list(events)),
    section(COPY.person.property, list(interests)),
    section(COPY.person.photos, list(photos, "media-grid")),
    section(COPY.person.accounts, list(claims)),
    section(COPY.person.sources, list(sources)),
  );
}
