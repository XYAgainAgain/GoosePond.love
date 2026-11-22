import { COPY } from "../copy.ts";
import { branchTones } from "../map/branches.ts";
import { yearsLabel } from "../map/elements.ts";
import { placeholderPortrait } from "../map/portraits.ts";
import { dateSpan } from "../records/dates.ts";
import {
  addPerson,
  addRelative,
  addTie,
  parseLooseDate,
  type PersonDraft,
  type Relative,
  removePerson,
  removeTie,
  setHome,
  setPortrait,
  updatePerson,
} from "../records/edit.ts";
import { FAMILIES, FAMILY_ORDER, isParentFigure, KINDS, type TieKind } from "../records/kinds.ts";
import { type Index, lifeDates } from "../records/queries.ts";
import { familyName } from "../records/surnames.ts";
import type { Archive, Id } from "../records/types.ts";
import { h } from "./dom.ts";

export interface EditActions {
  /* Persists `next` and redraws; `select` picks who is shown afterward */
  save(next: Archive, select?: Id | null): void;
  cancel(): void;
}

const PORTRAIT = 256;

async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = Object.assign(document.createElement("canvas"), {
    width: PORTRAIT,
    height: PORTRAIT,
  });
  canvas.getContext("2d")!.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    PORTRAIT,
    PORTRAIT,
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const id = control.id || `f-${label.toLowerCase().replace(/\W+/g, "-")}`;
  control.id = id;
  return h(
    "div",
    { class: "field" },
    h("label", { htmlFor: id }, label),
    control,
    hint && h("p", { class: "muted" }, hint),
  );
}

/* A null `id` adds a new person */
export function renderPersonForm(ix: Index, id: Id | null, act: EditActions): HTMLElement {
  const a = ix.archive;
  const person = id ? ix.person(id) : undefined;
  const dates = id ? lifeDates(ix, id) : {};
  const media = new Map(a.media.map((m) => [m.id, m]));
  /* undefined keeps the stored portrait, null removes it */
  let photo: string | null | undefined;
  const stored = person?.portrait ? media.get(person.portrait)?.src : undefined;

  const name = h("input", { type: "text", value: person?.name ?? "", required: true });
  const born = h("input", {
    type: "text",
    value: dates.born ?? "",
    placeholder: COPY.editor.bornPlaceholder,
  });
  const died = h("input", { type: "text", value: dates.died ?? "" });
  const living = h(
    "select",
    {},
    h("option", { value: "", selected: person?.living === undefined }, COPY.editor.notRecorded),
    h("option", { value: "yes", selected: person?.living === true }, COPY.editor.isLiving),
    h("option", { value: "no", selected: person?.living === false }, COPY.editor.hasDied),
  );
  const pronouns = h("input", { type: "text", value: person?.pronouns ?? "" });
  const birthName = h("input", { type: "text", value: person?.birthName ?? "" });
  const surname = h("input", { type: "text", value: person?.surname ?? "" });
  const badge = h("input", { type: "text", value: person?.badge ?? "", maxLength: 8 });
  const guessSurname = () => {
    surname.placeholder =
      familyName({ id: "", name: name.value, birthName: birthName.value || undefined }) ?? "";
  };
  name.addEventListener("input", guessSurname);
  birthName.addEventListener("input", guessSurname);
  guessSurname();
  const tint = id ? branchTones(a.people).get(id) : undefined;
  const bio = h("textarea", { rows: 4, value: person?.bio ?? "" });
  const home = h("input", { type: "checkbox", checked: !!id && a.home === id });
  const preview = h("img", {
    alt: "",
    width: 72,
    height: 72,
    src: stored ?? placeholderPortrait(person?.name ?? "?", tint),
  });
  const pick = h("input", { type: "file", accept: "image/*" });
  const status = h("p", { class: "form-status", attrs: { role: "status" } });
  const nudge = h("p", { class: "muted", hidden: true }, COPY.editor.livingNudge);

  const checkNudge = () => {
    const parsed = parseLooseDate(born.value);
    nudge.hidden = !(living.value === "yes" && parsed.date && /-\d{2}/.test(parsed.date));
  };
  born.addEventListener("input", checkNudge);
  living.addEventListener("change", checkNudge);
  checkNudge();

  const submit = h(
    "button",
    { type: "submit", class: "primary" },
    person ? COPY.editor.save : COPY.editor.add,
  );
  let decode = 0;
  pick.addEventListener("change", async () => {
    const file = pick.files?.[0];
    if (!file) return;
    const mine = ++decode;
    submit.disabled = true;
    try {
      const shrunk = await shrinkPhoto(file);
      if (mine !== decode) return;
      photo = shrunk;
      preview.src = shrunk;
      status.textContent = "";
    } catch {
      if (mine === decode) status.textContent = COPY.editor.photoUnreadable;
    } finally {
      if (mine === decode) submit.disabled = false;
    }
  });

  const form = h(
    "form",
    { class: "edit" },
    h("h2", { tabIndex: -1 }, person ? COPY.editor.editTitle(person.name) : COPY.editor.addTitle),
    field(COPY.editor.name, name),
    field(COPY.editor.born, born, COPY.editor.bornHint),
    nudge,
    field(COPY.editor.died, died, COPY.editor.diedHint),
    field(COPY.editor.living, living),
    field(COPY.editor.pronouns, pronouns),
    field(COPY.editor.birthName, birthName, COPY.editor.birthNameHint),
    field(COPY.editor.surname, surname, COPY.editor.surnameHint),
    field(COPY.editor.badge, badge, COPY.editor.badgeHint),
    field(COPY.editor.bio, bio),
    h(
      "div",
      { class: "field" },
      h("span", { class: "label" }, COPY.editor.portrait),
      h(
        "div",
        { class: "row" },
        preview,
        h("label", { class: "file-button" }, COPY.editor.choosePhoto, pick),
        h("button", {
          type: "button",
          onclick: () => {
            decode++;
            submit.disabled = false;
            pick.value = "";
            photo = null;
            preview.src = placeholderPortrait(name.value || "?", tint);
          },
        }, COPY.editor.removePhoto),
      ),
      h("p", { class: "muted" }, COPY.editor.photoNote),
    ),
    h("label", { class: "check" }, home, COPY.editor.home),
    status,
    h(
      "div",
      { class: "row" },
      submit,
      h("button", { type: "button", onclick: act.cancel }, COPY.editor.cancel),
    ),
  );

  if (id && person) {
    let armed = false;
    const remove = h("button", { type: "button", class: "danger" }, COPY.editor.remove);
    remove.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        remove.textContent = COPY.editor.reallyRemove(person.name);
        return;
      }
      act.save(removePerson(a, id), null);
    });
    form.append(h("div", { class: "row danger-zone" }, remove));
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const b = parseLooseDate(born.value), d = parseLooseDate(died.value);
    if (!b.ok || !d.ok) {
      status.textContent = COPY.editor.unreadableDate(!b.ok);
      (!b.ok ? born : died).focus();
      return;
    }
    const bs = dateSpan(b.date), ds = dateSpan(d.date);
    if (bs && ds && ds.latest < bs.earliest) {
      status.textContent = COPY.editor.diesBeforeBorn;
      died.focus();
      return;
    }
    const draft: PersonDraft = {
      name: name.value,
      born: b.date,
      died: d.date,
      living: living.value === "" ? undefined : living.value === "yes",
      pronouns: pronouns.value,
      birthName: birthName.value,
      surname: surname.value,
      badge: badge.value,
      bio: bio.value,
    };
    try {
      let next: Archive;
      let who: Id;
      if (id) {
        next = updatePerson(a, id, draft);
        who = id;
      } else {
        ({ archive: next, id: who } = addPerson(a, draft));
      }
      if (photo !== undefined) next = setPortrait(next, who, photo);
      if (home.checked) next = setHome(next, who);
      else if (next.home === who) next = setHome(next, null);
      act.save(next, who);
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : COPY.editor.saveFailed;
    }
  });

  return form;
}

interface Relation {
  label: string;
  kind: TieKind;
  /* true when the other person is the tie's `from` */
  otherFirst: boolean;
}

function relations(): Map<string, Relation[]> {
  const byFamily = new Map<string, Relation[]>();
  for (const family of FAMILY_ORDER) byFamily.set(FAMILIES[family].label, []);
  for (const kind of Object.keys(KINDS) as TieKind[]) {
    const k = KINDS[kind];
    const group = byFamily.get(FAMILIES[k.family].label)!;
    group.push({ label: k.fromRole, kind, otherFirst: true });
    if (k.directed) group.push({ label: k.toRole, kind, otherFirst: false });
  }
  return byFamily;
}

const RELATIVES: Relative[] = ["parent", "partner", "child", "sibling"];

function quickAdd(ix: Index, id: Id, act: EditActions): HTMLElement {
  const slot = h("div");
  let open: Relative | null = null;
  const hasParents = ix.tiesOf(id).some((t) => t.to === id && isParentFigure(t.kind));
  const buttons = RELATIVES.map((r) =>
    h("button", {
      type: "button",
      onclick: () => toggle(r),
      attrs: { "aria-expanded": "false", "aria-controls": "quick-form" },
    }, COPY.relatives.quick[r])
  );

  function form(r: Relative): HTMLElement {
    const noun = COPY.relatives.quickNouns[r];
    if (r === "sibling" && !hasParents) {
      return h("p", { id: "quick-form", class: "form-status" }, COPY.errors.noParents);
    }
    const name = h("input", { id: "quick-name", type: "text", autocomplete: "off" });
    const born = h("input", {
      id: "quick-born",
      type: "text",
      inputMode: "numeric",
      autocomplete: "off",
    });
    const status = h("p", { class: "form-status", attrs: { role: "status" } });
    const f = h(
      "form",
      { id: "quick-form", class: "edit quick-form" },
      h("label", { htmlFor: "quick-name" }, COPY.relatives.quickName(noun)),
      name,
      h("label", { htmlFor: "quick-born" }, COPY.relatives.quickBorn),
      born,
      status,
      h("button", { type: "submit", class: "primary" }, COPY.relatives.quickAdd(noun)),
    );
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      try {
        const made = addRelative(ix.archive, id, r, { name: name.value, born: born.value });
        act.save(made.archive, id);
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : COPY.relatives.addFailed;
      }
    });
    return f;
  }

  function toggle(r: Relative) {
    open = open === r ? null : r;
    buttons.forEach((b, i) => b.setAttribute("aria-expanded", String(RELATIVES[i] === open)));
    slot.replaceChildren(...(open ? [form(open)] : []));
    slot.querySelector("input")?.focus();
  }

  return h(
    "div",
    { class: "quick" },
    h(
      "div",
      { class: "row", attrs: { role: "group", "aria-label": COPY.relatives.quickGroup } },
      ...buttons,
    ),
    slot,
  );
}

export function renderRelatives(ix: Index, id: Id, act: EditActions): HTMLElement {
  const a = ix.archive;
  const person = ix.person(id);
  if (!person) return h("div");

  const ties = ix.tiesOf(id).filter((t) => t.kind in KINDS).map((t) => {
    const other = t.to === id ? t.from : t.to;
    const role = t.to === id ? KINDS[t.kind].fromRole : KINDS[t.kind].toRole;
    return h(
      "li",
      {},
      h("span", { class: "role" }, role),
      h("span", {}, ix.person(other)?.name ?? COPY.relatives.notOnRecord),
      h("button", {
        type: "button",
        class: "small",
        onclick: () => act.save(removeTie(a, t.id), id),
        attrs: { "aria-label": COPY.relatives.removeLabel(ix.person(other)?.name) },
      }, COPY.relatives.remove),
    );
  });

  const all = [...relations()].flatMap(([, group]) => group);
  const relation = h(
    "select",
    { id: "rel-kind" },
    ...[...relations()].filter(([, group]) => group.length).map(([family, group]) =>
      h(
        "optgroup",
        { label: family },
        ...group.map((r) =>
          h("option", {
            value: String(
              all.indexOf(all.find((x) => x.kind === r.kind && x.otherFirst === r.otherFirst)!),
            ),
          }, r.label)
        ),
      )
    ),
  );

  const labels = new Map<string, Id>();
  for (const p of a.people) {
    if (p.id === id) continue;
    const years = yearsLabel(ix, p.id);
    let label = COPY.relatives.personOption(p.name, years);
    for (let n = 2; labels.has(label); n++) label = COPY.relatives.twinOption(p.name, years, n);
    labels.set(label, p.id);
  }
  const list = h(
    "datalist",
    { id: "rel-people" },
    ...[...labels.keys()].map((value) => h("option", { value })),
  );
  const who = h("input", {
    id: "rel-who",
    type: "text",
    autocomplete: "off",
    placeholder: COPY.relatives.whoPlaceholder,
    attrs: { list: "rel-people" },
  });
  const status = h("p", { class: "form-status", attrs: { role: "status" } });

  const form = h(
    "form",
    { class: "edit" },
    h("label", { htmlFor: "rel-kind" }, COPY.relatives.addOf(person.name)),
    relation,
    h("label", { htmlFor: "rel-who" }, COPY.relatives.who),
    who,
    list,
    status,
    h("button", { type: "submit" }, COPY.relatives.addTie),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const typed = who.value.trim();
    if (!typed) {
      status.textContent = COPY.relatives.pickFirst;
      who.focus();
      return;
    }
    try {
      const r = all[Number(relation.value)];
      let next = a;
      let other = labels.get(typed);
      if (!other) ({ archive: next, id: other } = addPerson(a, { name: typed }));
      const [from, to] = r.otherFirst ? [other, id] : [id, other];
      act.save(addTie(next, r.kind, from, to).archive, id);
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : COPY.relatives.addFailed;
    }
  });

  return h(
    "section",
    { class: "relatives" },
    h("h3", {}, COPY.relatives.title),
    quickAdd(ix, id, act),
    ties.length > 0 && h("ul", {}, ...ties),
    h("h4", {}, COPY.relatives.moreKinds),
    form,
  );
}

export interface FileState {
  hasPrivate: boolean;
  showingPrivate: boolean;
  people: number;
  note: string;
  /* Each saved change this session, latest first */
  history: string[];
}

export interface FileActions {
  start(firstName: string): void;
  open(file: File): void;
  show(which: "private" | "demo"): void;
  addPerson(): void;
  saveCopy(): void;
  forget(): void;
  undo(): void;
}

export function renderFilePanel(s: FileState, act: FileActions): HTMLElement {
  const pick = h("input", { type: "file", accept: ".json,application/json" });
  pick.addEventListener("change", () => {
    if (pick.files?.[0]) act.open(pick.files[0]);
  });
  const open = h(
    "label",
    { class: "file-button" },
    s.hasPrivate ? COPY.file.openDifferent : COPY.file.open,
    pick,
  );
  const promise = h("p", { class: "muted" }, COPY.file.promise);

  if (!s.hasPrivate) {
    const first = h("input", {
      id: "file-first",
      type: "text",
      placeholder: COPY.file.firstPlaceholder,
    });
    const form = h(
      "form",
      { class: "edit" },
      h("label", { htmlFor: "file-first" }, COPY.file.startWith),
      first,
      h("button", { type: "submit", class: "primary" }, COPY.file.start),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (first.value.trim()) act.start(first.value);
      else first.focus();
    });
    return h(
      "div",
      { class: "file" },
      h("h2", { tabIndex: -1 }, COPY.file.title),
      h("p", {}, COPY.file.intro),
      promise,
      form,
      h("p", {}, COPY.file.alreadyHave),
      open,
      s.note && h("p", { class: "readout" }, s.note),
    );
  }

  let armed = false;
  const forget = h("button", { type: "button", class: "danger" }, COPY.file.forget);
  forget.addEventListener("click", () => {
    if (!armed) {
      armed = true;
      forget.textContent = COPY.file.reallyForget;
      return;
    }
    act.forget();
  });

  return h(
    "div",
    { class: "file" },
    h("h2", { tabIndex: -1 }, COPY.file.title),
    h("p", {}, COPY.file.count(s.people)),
    promise,
    h(
      "div",
      { class: "segmented", attrs: { role: "group", "aria-label": COPY.file.shown } },
      h("button", {
        type: "button",
        onclick: () => act.show("private"),
        attrs: { "aria-pressed": String(s.showingPrivate) },
      }, COPY.file.ours),
      h("button", {
        type: "button",
        onclick: () => act.show("demo"),
        attrs: { "aria-pressed": String(!s.showingPrivate) },
      }, COPY.file.demo),
    ),
    h(
      "div",
      { class: "row" },
      h("button", {
        type: "button",
        class: "primary",
        disabled: !s.showingPrivate,
        onclick: act.addPerson,
      }, COPY.file.addPerson),
      h("button", { type: "button", onclick: act.saveCopy }, COPY.file.saveCopy),
    ),
    h("p", { class: "muted" }, COPY.file.saveNote),
    s.history.length > 0 && h(
      "section",
      { class: "history" },
      h("h3", {}, COPY.changes.historyTitle),
      h("ol", { reversed: true }, ...s.history.map((what) => h("li", {}, what))),
      h("button", { type: "button", onclick: act.undo }, COPY.changes.undoLatest),
    ),
    open,
    s.note && h("p", { class: "readout" }, s.note),
    h("div", { class: "row danger-zone" }, forget),
  );
}
