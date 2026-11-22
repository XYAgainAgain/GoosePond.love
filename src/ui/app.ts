import { COPY } from "../copy.ts";
import { createMap, type Edges, type TraceStep, type ViewName } from "../map/view.ts";
import { addPerson, setHome } from "../records/edit.ts";
import { FAMILIES, type TieFamily } from "../records/kinds.ts";
import { kinName, kinPath } from "../records/kinship.ts";
import { type Index, indexArchive } from "../records/queries.ts";
import { type Archive, emptyArchive, type Id } from "../records/types.ts";
import { type Issue, validate } from "../records/validate.ts";
import { fixture } from "../sources/fixture.ts";
import { generate } from "../sources/generate.ts";
import { shire } from "../sources/shire.ts";
import {
  checkArchive,
  forgetPrivate,
  readPrivateFile,
  recallRaw,
  rememberPrivate,
} from "../sources/private.ts";
import { describeChange } from "./changes.ts";
import { renderKey } from "./key.ts";
import { openLightbox } from "./lightbox.ts";
import { framePicture } from "./picture.ts";
import { openRadial } from "./radial.ts";
import { type DevInfo, renderDev, type Settings } from "./devpanel.ts";
import { clear, h } from "./dom.ts";
import { lockDoor } from "./door.ts";
import { type FocusState, renderPerson } from "./drawer.ts";
import { haptic, pressFeedback } from "./haptics.ts";
import { type EditActions, renderFilePanel, renderPersonForm, renderRelatives } from "./editor.ts";
import { renderLayers } from "./legend.ts";
import { interestHolders, renderPlace } from "./place.ts";
import { createSearch } from "./search.ts";
import { createSettings, currentTheme, labelText, type LookChange } from "./settings.ts";
import { createSheet } from "./sheet.ts";
import { mapColors } from "./themes.ts";

type Panel = "person" | "place" | "layers" | "dev" | "file" | "edit";

const SETTINGS = "goosepond.settings";
const BACKUP = "goosepond.backup";
const NUDGE_EVERY = 10;
const HISTORY_LIMIT = 100;
const TOAST_MS = 6000;
const TIPS = "goosepond.tips";
const VIEWER = "goosepond.viewer";

/* Changes since a copy last left the device, and the count that brings the nudge back */
interface Backup {
  changes: number;
  nudgeAt: number;
}

function loadBackup(): Backup {
  try {
    const b = JSON.parse(localStorage.getItem(BACKUP) ?? "{}");
    const n = (v: unknown, d: number) => typeof v === "number" && v >= 0 ? v : d;
    return { changes: n(b.changes, 0), nudgeAt: n(b.nudgeAt, NUDGE_EVERY) };
  } catch {
    return { changes: 0, nudgeAt: NUDGE_EVERY };
  }
}

function saveBackup(b: Backup) {
  try {
    localStorage.setItem(BACKUP, JSON.stringify(b));
  } catch {
    // private browsing
  }
}
const DEFAULTS: Settings = {
  dataset: "shire",
  size: 250,
  seed: 1,
  view: "generations",
  portraits: true,
  webgl: false,
  lightCanvas: true,
  hidden: [],
};

export function loadSettings(): Settings {
  try {
    // The theme has its own key (settings.ts)
    const { theme: _theme, ...saved } = JSON.parse(localStorage.getItem(SETTINGS) ?? "{}");
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS, JSON.stringify(s));
  } catch {
    // private browsing
  }
}

const today = () => new Date().toISOString().slice(0, 10);

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  h("a", { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function download(a: unknown) {
  saveBlob(
    new Blob([JSON.stringify(a, null, 2)], { type: "application/json" }),
    `goosepond-family-${today()}.private.json`,
  );
}

/* Keyed by dataset, since demo families reuse the same ids for different people */
function loadViewers(): Record<string, Id> {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWER) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function saveViewers(v: Record<string, Id>) {
  try {
    localStorage.setItem(VIEWER, JSON.stringify(v));
  } catch {
    // private browsing
  }
}

function tipsSeen(): boolean {
  try {
    return localStorage.getItem(TIPS) === "seen";
  } catch {
    return true;
  }
}

export async function startApp(root: HTMLElement) {
  const settings = loadSettings();
  let archive: Archive;
  let ix: Index;
  let issues: Issue[] = [];
  let selected: Id | null = null;
  let panel: Panel | null = null;
  /* null adds a new person */
  let editing: Id | null = null;
  let lit = 0;
  let marked = false;
  let hasPrivate = false;
  let fileNote = "";
  let firstLoad = true;
  const focus: FocusState = { on: false, reach: 1 };
  const viewers = loadViewers();
  let pairing: Id | null = null;
  let trail: { from: Id; to: Id } | null = null;
  let tracing = false;
  const info: DevInfo = { readout: [], movement: "" };
  /* Keeps an edit from ever saving a demo over the private file */
  let privateShown = false;
  let saving = false;
  let loads = 0;
  let history: { before: Archive; what: string }[] = [];
  let backup = loadBackup();
  const editable = () => privateShown;

  const mapEl = h("div", { id: "map", attrs: { role: "application", "aria-label": COPY.bar.map } });
  const panelBody = h("div", { class: "panel-body" });
  const panelEl = h(
    "aside",
    { class: "panel", hidden: true },
    h("button", {
      type: "button",
      class: "close",
      onclick: () => openPanel(null),
      attrs: { "aria-label": COPY.bar.closePanel },
    }, COPY.bar.close),
    panelBody,
  );
  const notice = h("div", { class: "notice", hidden: true, attrs: { role: "status" } });
  const toast = h("div", { class: "toast", hidden: true, attrs: { role: "status" } });
  let toastTimer = 0;
  const hideToast = () => (toast.hidden = true);
  const holdToast = () => clearTimeout(toastTimer);
  const releaseToast = () => {
    clearTimeout(toastTimer);
    if (!toast.hidden) toastTimer = setTimeout(hideToast, TOAST_MS);
  };
  toast.addEventListener("pointerenter", holdToast);
  toast.addEventListener("focusin", holdToast);
  toast.addEventListener("pointerleave", releaseToast);
  toast.addEventListener("focusout", releaseToast);
  const badge = h("span", { class: "badge" });
  const badgeMore = h("p", { class: "badge more-badge" });
  const search = createSearch((id) => select(id, true));

  const viewButtons = (["network", "generations"] as const).map((view) =>
    h("button", {
      type: "button",
      onclick: () => setView(view),
      attrs: { "aria-pressed": "false" },
    }, view === "network" ? COPY.bar.network : COPY.bar.generations)
  );
  const placeButton = h(
    "button",
    { type: "button", onclick: () => togglePanel("place") },
    COPY.bar.places,
  );
  const fileButton = h("button", {
    type: "button",
    disabled: true,
    onclick: () => togglePanel("file"),
  }, COPY.bar.file);
  const more = h(
    "div",
    { class: "bar-more", id: "bar-more", attrs: { popover: "auto" } },
    badgeMore,
    h(
      "div",
      { class: "segmented", attrs: { role: "group", "aria-label": COPY.bar.arrangement } },
      ...viewButtons,
    ),
    h("button", { type: "button", onclick: () => togglePanel("layers") }, COPY.bar.ties),
    placeButton,
    fileButton,
    h("button", { type: "button", onclick: () => togglePanel("dev") }, COPY.bar.dev),
  );
  const moreButton = h("button", {
    type: "button",
    class: "more-button",
    title: COPY.bar.more,
    attrs: { popovertarget: "bar-more", "aria-label": COPY.bar.more },
  }, "⋯");
  const bar = h(
    "header",
    { class: "bar" },
    h("div", { class: "brand" }, h("strong", {}, COPY.bar.brand), badge),
    search.el,
    more,
    moreButton,
  );
  more.addEventListener("beforetoggle", (e) => {
    if ((e as ToggleEvent).newState !== "open") return;
    const top = bar.getBoundingClientRect().bottom + 4;
    more.style.top = `${top}px`;
    more.style.maxBlockSize = `${innerHeight - top - 8}px`;
  });
  more.addEventListener("click", (e) => {
    if ((e.target as Element).closest("button") && more.matches(":popover-open")) {
      more.hidePopover();
    }
  });
  const phone = matchMedia("(width <= 760px)");
  phone.addEventListener("change", () => {
    if (more.matches(":popover-open")) more.hidePopover();
  });
  bar.append(createSettings({ bar, scroller: () => panelEl, changed: lookChanged }));
  pressFeedback(root);
  const mapWrap = h("div", { class: "map-wrap" }, mapEl);
  const stage = h("main", { class: "stage" }, mapWrap, notice, panelEl);
  root.replaceChildren(bar, stage, toast);
  let keyEl: HTMLDetailsElement | undefined;
  let closeRadial: (() => void) | undefined;
  let tips = !tipsSeen();

  const map = createMap(mapEl);
  // The panel and notice overlay the map: a resized canvas is blank until Cytoscape's next frame
  const edges: Edges = { top: 0, right: 0, bottom: 0 };
  const cover = (next: Partial<Edges>, byHand = false) => {
    Object.assign(edges, next);
    map.setEdges({ ...edges });
    stage.style.setProperty("--cover-right", `${edges.right}px`);
    stage.style.setProperty("--cover-bottom", `${edges.bottom}px`);
    mapWrap.classList.toggle("covered", edges.bottom > 0);
    // Only a hand-made snap nudges; a resize mid-glide would cut a framing short
    if (byHand && selected) map.reveal(selected);
  };
  const sheet = createSheet(panelEl, stage, cover);
  new ResizeObserver(() => cover({ top: notice.hidden ? 0 : notice.offsetHeight })).observe(notice);
  map.onSelect((id) => {
    if (panel === "edit") map.select(selected);
    else select(id);
  });
  map.onHold((id, at) => {
    const person = ix.person(id);
    if (panel === "edit" || !person) return;
    select(id);
    haptic();
    const quick = (["parent", "partner", "child", "sibling"] as const).map((r) => ({
      label: COPY.relatives.quick[r],
      run: () => {
        const button = [...panelBody.querySelectorAll<HTMLButtonElement>(".quick button")]
          .find((b) => b.textContent === COPY.relatives.quick[r]);
        button?.click();
        button?.scrollIntoView({ block: "nearest" });
      },
    }));
    const dim = {
      label: COPY.person.dimOthers,
      run: () => {
        focus.on = !focus.on;
        applyFocus();
      },
    };
    const change = {
      label: COPY.person.edit,
      run: () => {
        editing = id;
        openPanel("edit");
      },
    };
    closeRadial?.();
    closeRadial = openRadial(
      mapWrap,
      at,
      COPY.radial.title(person.name),
      editable()
        ? [dim, change, ...quick]
        : [{ label: COPY.person.centerOnMap, run: () => map.centerOn(id) }, dim],
    );
  });
  document.fonts.addEventListener("loadingdone", () => lookChanged("size"));

  function renderKeyNow() {
    const next = renderKey(archive.people, new Set(settings.hidden), savePicture);
    if (keyEl) {
      const held = heldButton(keyEl);
      next.open = keyEl.open;
      keyEl.replaceWith(next);
      refocus(next, held);
    } else mapWrap.append(next);
    keyEl = next;
  }

  function setHiddenLines(hidden: Set<TieFamily>) {
    map.setHidden(hidden);
    renderKeyNow();
  }

  async function savePicture(whole: boolean) {
    // Read before any await, so a family switched to mid-export can't label this one
    const family = archive, hidden = new Set(settings.hidden);
    try {
      const shot = await map.picture(whole);
      if (!shot) return;
      const framed = await framePicture(shot, family, hidden);
      saveBlob(framed, COPY.picture.file(today()));
    } catch {
      showToast(COPY.picture.failed, false);
    }
  }

  // Canvas labels are cached once drawn, so every restyle waits out a face still loading
  let looks = 0;
  let faceReady: Promise<unknown> = Promise.resolve();
  async function lookChanged(what: LookChange) {
    const mine = ++looks;
    if (what === "face") {
      faceReady = document.fonts.load(`11px "${labelText().family}"`).catch(() => {});
    }
    await faceReady;
    if (mine !== looks) return;
    map.restyle(mapColors(currentTheme()), labelText());
    if (archive) renderKeyNow();
  }

  function showToast(text: string, undoable: boolean) {
    clear(toast);
    toast.append(h("span", {}, text));
    if (undoable) {
      toast.append(h("button", { type: "button", onclick: undo }, COPY.changes.undo));
    }
    toast.hidden = false;
    releaseToast();
  }

  function undo() {
    const last = history.at(-1);
    if (last && privateShown) commit(last.before, undefined, false, last.what);
  }

  async function saveCopy() {
    const stored = await recallRaw().catch(() => undefined);
    if (stored === undefined) return;
    download(stored);
    backup = { changes: 0, nudgeAt: NUDGE_EVERY };
    saveBackup(backup);
    renderNotice();
  }

  /* `fresh`: a file being started or opened, the one save allowed while a demo shows.
     `undoing` names the change taken back */
  async function commit(next: Archive, pick?: Id | null, fresh = false, undoing?: string) {
    if (saving || (!fresh && !privateShown)) return;
    saving = true;
    const before = archive;
    try {
      try {
        await rememberPrivate(next);
      } catch {
        fileNote = COPY.file.saveBlocked;
        panel = "file";
        renderPanel();
        return;
      }
      if (!fresh) {
        const what = undoing ?? describeChange(before, next);
        if (undoing) history.pop();
        else history = [...history, { before, what }].slice(-HISTORY_LIMIT);
        backup = { ...backup, changes: backup.changes + 1 };
        saveBackup(backup);
        // Another family loaded mid-save; it reads the saved file when shown
        if (archive !== before) return;
        showToast(undoing ? COPY.changes.undone(undoing) : what, !undoing);
        const was = selected;
        if (pick !== undefined) selected = pick;
        // Not awaited: the next save needn't wait out this glide, and a newer run supersedes it
        void refresh(next, was, !!undoing);
        return;
      }
      if (pick !== undefined) selected = pick;
      // The picks belong to the private family this file replaces
      delete viewers.private;
      saveViewers(viewers);
      history = [];
      backup = { changes: 0, nudgeAt: NUDGE_EVERY };
      saveBackup(backup);
      settings.dataset = "private";
      saveSettings(settings);
      panel = selected ? "person" : "file";
      await load(true);
    } finally {
      saving = false;
    }
  }

  const edit: EditActions = {
    save: (next, pick) => commit(next, pick),
    cancel: () => openPanel(selected ? "person" : "file"),
  };

  /* The person panel's top half, rebuilt alone so a half-typed relative below it survives */
  let card: HTMLElement | undefined;
  function personCard(id: Id) {
    const kin = { viewer: looking(), chosen: chosen(), pairing: pairing === id };
    return renderPerson(ix, id, focus, kin, {
      pick: (pid) => select(pid, true),
      center: () => {
        sheet.atMost("half");
        if (selected) map.centerOn(selected);
      },
      setFocus: (on) => {
        focus.on = on;
        applyFocus();
      },
      setReach: (reach) => {
        focus.reach = reach;
        applyFocus();
      },
      edit: editable()
        ? () => {
          editing = selected;
          openPanel("edit");
        }
        : undefined,
      view: openLightbox,
      lookAs: (pid) => {
        if (chosen() === pid) delete viewers[settings.dataset];
        else viewers[settings.dataset] = pid;
        saveViewers(viewers);
        renderCard();
      },
      connect: () => {
        pairing = pairing === id ? null : id;
        renderNotice();
        renderCard();
      },
      trace: (from, to) => showTrail(from, to),
    });
  }

  function chosen(): Id | null {
    const id = viewers[settings.dataset];
    return id && ix.person(id) ? id : null;
  }

  function looking(): Id | null {
    return chosen() ?? (archive.home && ix.person(archive.home) ? archive.home : null);
  }

  function trailSteps(): TraceStep[] | null {
    if (!trail) return null;
    const { from } = trail;
    const path = kinPath(ix, from, trail.to);
    if (!path) return null;
    return path.map((s, i) => ({ tie: s.tie.id, a: i ? path[i - 1].person : from, b: s.person }));
  }

  function showTrail(from: Id, to: Id) {
    trail = { from, to };
    // The notice line changes the map's height, so it lands before the chain is framed
    renderNotice();
    sheet.sync();
    sheet.atMost("half");
    retrace(true);
  }

  /* A pair with no chain leaves focus dimming in charge */
  function retrace(frame = false) {
    const steps = trailSteps();
    tracing = !!steps?.length;
    map.trace(steps, frame);
  }

  function clearTrail() {
    trail = null;
    tracing = false;
    map.trace(null);
    lit = map.focus(focus.on ? selected : null, focus.reach);
    renderNotice();
  }

  function cancelPairing() {
    pairing = null;
    renderNotice();
    if (panel === "person") renderCard();
  }

  function heldButton(within: HTMLElement) {
    const active = document.activeElement;
    return active instanceof HTMLButtonElement && within.contains(active)
      ? active.textContent
      : null;
  }

  function refocus(within: HTMLElement, held: string | null) {
    if (held) [...within.querySelectorAll("button")].find((b) => b.textContent === held)?.focus();
  }

  function renderCard() {
    if (!card?.isConnected || !selected) return renderPanel();
    const held = heldButton(card);
    const next = personCard(selected);
    card.replaceWith(next);
    card = next;
    refocus(card, held);
  }

  function renderPanel(moveFocus = false) {
    const held = heldButton(panelBody);
    panelEl.hidden = panel === null;
    sheet.sync();
    clear(panelBody);
    card = undefined;
    if (panel === "person" && selected) {
      card = personCard(selected);
      panelBody.append(card);
      if (editable()) panelBody.append(renderRelatives(ix, selected, edit));
    } else if (panel === "edit") {
      panelBody.append(renderPersonForm(ix, editing, edit));
    } else if (panel === "file") {
      panelBody.append(renderFilePanel({
        hasPrivate,
        showingPrivate: editable(),
        people: editable() ? archive.people.length : 0,
        note: fileNote,
        history: editable() ? history.map((c) => c.what).reverse() : [],
      }, {
        undo,
        start: async (first) => {
          if (await recallRaw().catch(() => undefined) !== undefined) {
            fileNote = COPY.file.alreadyHeld;
            await load();
            openPanel("file");
            return;
          }
          const made = addPerson(emptyArchive(COPY.file.defaultTitle, false), { name: first });
          await commit(setHome(made.archive, made.id), made.id, true);
        },
        open: async (file) => {
          try {
            const { archive: opened, issues: found } = await readPrivateFile(file);
            const errors = found.filter((i) => i.level === "error").length;
            fileNote = COPY.file.opened(opened.people.length, errors);
            selected = null;
            await commit(opened, opened.home ?? null, true);
          } catch (e) {
            fileNote = e instanceof Error ? e.message : COPY.file.unreadable;
            renderPanel();
          }
        },
        show: (which) => {
          settings.dataset = which === "private" ? "private" : "shire";
          saveSettings(settings);
          load();
        },
        addPerson: () => {
          editing = null;
          openPanel("edit");
        },
        saveCopy,
        forget: async () => {
          await forgetPrivate();
          history = [];
          fileNote = COPY.file.forgotten;
          settings.dataset = "shire";
          saveSettings(settings);
          await load();
          openPanel("file");
        },
      }));
    } else if (panel === "place") {
      panelBody.append(renderPlace(ix, marked, {
        pick: (id) => select(id, true),
        setMarked: (on) => {
          marked = on;
          map.mark(on ? interestHolders(ix) : new Set());
          renderPanel();
        },
      }));
    } else if (panel === "layers") {
      panelBody.append(renderLayers(new Set(settings.hidden), (family, shown) => {
        const hidden = new Set(settings.hidden);
        if (shown) hidden.delete(family);
        else hidden.add(family);
        settings.hidden = [...hidden];
        saveSettings(settings);
        setHiddenLines(hidden);
        renderNotice();
      }));
    } else if (panel === "dev") {
      panelBody.append(renderDev(settings, info, {
        change: (patch) => {
          const drawing = ["portraits", "webgl", "lightCanvas"];
          const drawingOnly = Object.keys(patch).every((k) => drawing.includes(k));
          Object.assign(settings, patch);
          saveSettings(settings);
          load(drawingOnly);
        },
        rerun: () => arrange(true),
        fit: () => map.fit(),
        measure: async () => {
          info.movement = COPY.dev.measuring;
          renderPanel();
          const m = await map.measureMovement();
          info.movement = COPY.dev.movement(
            map.usingWebgl(),
            settings.view === "network" ? COPY.bar.network : COPY.bar.generations,
            m.median,
            m.p95,
            m.worst,
          );
          renderPanel();
        },
        lock: () => {
          lockDoor();
          location.reload();
        },
      }));
    } else {
      panel = null;
      panelEl.hidden = true;
    }
    if (moveFocus) panelBody.querySelector<HTMLElement>("h2")?.focus();
    else refocus(panelBody, held);
  }

  function openPanel(next: Panel | null) {
    panel = next;
    renderPanel(next !== null && next !== "person");
  }

  function togglePanel(next: Panel) {
    openPanel(panel === next ? null : next);
  }

  function renderNotice() {
    clear(notice);
    if (tips) {
      notice.append(
        h("span", {}, COPY.tips.text),
        h("button", {
          type: "button",
          onclick: () => {
            tips = false;
            try {
              localStorage.setItem(TIPS, "seen");
            } catch {
              // private browsing
            }
            renderNotice();
          },
        }, COPY.tips.dismiss),
      );
    }
    const pairName = pairing ? ix.person(pairing)?.name : undefined;
    if (pairName) {
      notice.append(
        h("span", {}, COPY.notice.pairing(pairName)),
        h("button", { type: "button", onclick: cancelPairing }, COPY.notice.pairCancel),
      );
    }
    const ends = trail && [ix.person(trail.from), ix.person(trail.to)];
    if (trail && ends?.[0] && ends[1]) {
      const relation = kinName(ix, trail.from, trail.to);
      notice.append(
        h(
          "span",
          {},
          relation
            ? COPY.notice.connected(ends[1].name, ends[0].name, relation)
            : COPY.notice.notConnected(ends[0].name, ends[1].name),
        ),
        h("button", { type: "button", onclick: clearTrail }, COPY.notice.clearPath),
      );
    }
    const name = selected ? ix.person(selected)?.name : undefined;
    // A trail overrides the dimming, so the count would be the trail's
    if (focus.on && name && !tracing) {
      notice.append(
        h("span", {}, COPY.notice.showing(lit, archive.people.length, name)),
        h("button", {
          type: "button",
          onclick: () => {
            focus.on = false;
            applyFocus();
          },
        }, COPY.notice.showEveryone),
      );
    }
    if (privateShown && backup.changes >= backup.nudgeAt) {
      notice.append(
        h("span", {}, COPY.notice.backup(backup.changes)),
        h("button", { type: "button", onclick: saveCopy }, COPY.notice.backupSave),
        h("button", {
          type: "button",
          onclick: () => {
            backup = { ...backup, nudgeAt: backup.changes + NUDGE_EVERY };
            saveBackup(backup);
            renderNotice();
          },
        }, COPY.notice.backupLater),
      );
    }
    if (settings.hidden.length) {
      const names = settings.hidden.map((f) => FAMILIES[f].label).join(", ");
      notice.append(
        h("span", {}, COPY.notice.hiddenLines(names)),
        h("button", {
          type: "button",
          onclick: () => {
            settings.hidden = [];
            saveSettings(settings);
            setHiddenLines(new Set());
            renderNotice();
            if (panel === "layers") renderPanel();
          },
        }, COPY.notice.showAllLines),
      );
    }
    notice.hidden = notice.childElementCount === 0;
  }

  function applyFocus() {
    lit = map.focus(focus.on ? selected : null, focus.reach);
    renderNotice();
    if (panel === "person") renderCard();
  }

  function select(id: Id | null, center = false) {
    const from = pairing;
    if (id !== pairing) pairing = null;
    selected = id;
    map.select(id);
    if (id === null) {
      focus.on = false;
      if (panel === "person" || panel === "edit") panel = null;
    } else panel = "person";
    lit = map.focus(focus.on ? selected : null, focus.reach);
    renderNotice();
    renderPanel();
    if (id !== null) center ? map.centerOn(id) : map.reveal(id);
    if (from && id && id !== from) showTrail(from, id);
  }

  async function arrange(fresh = false) {
    viewButtons.forEach((b, i) =>
      b.setAttribute("aria-pressed", String((i === 0) === (settings.view === "network")))
    );
    info.readout = [COPY.dev.arranging(archive.people.length)];
    if (panel === "dev") renderPanel();
    const { ms } = await map.show(settings.view, fresh);
    const errors = issues.filter((i) => i.level === "error").length;
    info.readout = [
      COPY.dev.counts(archive.people.length, archive.ties.length),
      COPY.dev.arranged(settings.view === "network", ms, map.usingWebgl()),
      COPY.dev.checks(errors, issues.length - errors, map.looped()),
    ];
    if (panel === "dev") renderPanel();
  }

  function setView(view: ViewName) {
    if (view === settings.view) return;
    settings.view = view;
    saveSettings(settings);
    arrange();
  }

  /* `keep` holds the selection and open panel through a redraw of the same family */
  async function load(keep = false) {
    const mine = ++loads;
    closeRadial?.();
    let stored: Archive | undefined;
    let damaged = false;
    const raw = await recallRaw().catch(() => undefined);
    if (mine !== loads) return;
    if (raw !== undefined) {
      try {
        stored = checkArchive(raw);
      } catch {
        damaged = true;
        fileNote = COPY.file.damaged;
      }
    }
    hasPrivate = !!stored || damaged;
    if (firstLoad && stored) {
      settings.dataset = "private";
      settings.view = "generations";
      selected = stored.home ?? null;
      keep = true;
    }
    firstLoad = false;
    if (settings.dataset === "private" && !stored) settings.dataset = "shire";
    archive = settings.dataset === "private"
      ? stored!
      : settings.dataset === "fixture"
      ? fixture()
      : settings.dataset === "generated"
      ? generate(settings.size, settings.seed)
      : shire();
    privateShown = settings.dataset === "private";
    ix = indexArchive(archive);
    issues = validate(archive);
    if (selected && !ix.person(selected)) selected = null;
    if (!keep) {
      selected = null;
      marked = false;
      focus.on = false;
      if (panel === "person" || panel === "place" || panel === "edit") panel = null;
    }
    if (!keep && archive.home && ix.person(archive.home)) selected = archive.home;
    pairing = null;
    trail = null;
    tracing = false;
    if (!selected) focus.on = false;
    badge.textContent = archive.synthetic ? COPY.bar.badgeDemo : COPY.bar.badgePrivate;
    badgeMore.textContent = badge.textContent;
    describe();
    map.load(archive, {
      portraits: settings.portraits,
      webgl: settings.webgl,
      light: settings.lightCanvas,
      colors: mapColors(currentTheme()),
      text: labelText(),
    });
    restate();
    fileButton.disabled = false;
    renderPanel();
    await arrange();
  }

  function describe() {
    placeButton.hidden = archive.places.length === 0 && archive.entities.length === 0;
    const property = archive.places.find((p) => archive.interests.some((i) => i.place === p.id));
    placeButton.textContent = property?.name ?? COPY.bar.places;
    search.setIndex(ix);
  }

  /* A load or an update replaces the map's elements */
  function restate() {
    setHiddenLines(new Set(settings.hidden));
    map.select(selected);
    if (marked) map.mark(interestHolders(ix));
    lit = map.focus(focus.on ? selected : null, focus.reach);
    renderNotice();
  }

  /* Moves people in place; `stay` keeps the open panel, as an undo from the history list should */
  async function refresh(next: Archive, was: Id | null, stay = false) {
    ++loads;
    archive = next;
    ix = indexArchive(archive);
    issues = validate(archive);
    if (selected && !ix.person(selected)) selected = null;
    if (!selected) focus.on = false;
    if (pairing && !ix.person(pairing)) pairing = null;
    if (trail && !(ix.person(trail.from) && ix.person(trail.to))) trail = null;
    const lost = panel === "edit" || (panel === "person" && !selected);
    if (!stay || lost) panel = selected ? "person" : "file";
    describe();
    const moving = map.update(archive, was && ix.person(was) ? was : selected);
    retrace();
    restate();
    renderPanel();
    await moving;
    const errors = issues.filter((i) => i.level === "error").length;
    info.readout[0] = COPY.dev.counts(archive.people.length, archive.ties.length);
    info.readout[2] = COPY.dev.checks(errors, issues.length - errors, map.looped());
  }

  let last = performance.now();
  const frames: number[] = [];
  let painted = 0;
  const tick = (now: number) => {
    frames.push(now - last);
    last = now;
    if (frames.length > 120) frames.shift();
    if (now - painted > 500) {
      painted = now;
      const out = document.getElementById("dev-fps");
      if (out) {
        const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
        out.textContent = COPY.dev.fps(1000 / avg, Math.max(...frames));
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  addEventListener("keydown", (e) => {
    const typing = e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
    if (typing) return;
    if (e.key === "Escape") {
      if (pairing) cancelPairing();
      else if (trail) clearTrail();
      else if (panel !== null) openPanel(null);
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    }
  });

  await load();
}
