import { COPY } from "../copy.ts";
import { matches, pickQuestions } from "../gate/match.ts";
import { QUESTIONS } from "../gate/questions.ts";
import { h } from "./dom.ts";

const PASS = "goosepond.pass";

export function hasPass(): boolean {
  try {
    return localStorage.getItem(PASS) === "1";
  } catch {
    return false;
  }
}

export function lockDoor() {
  localStorage.removeItem(PASS);
}

export interface DoorCard {
  el: HTMLFormElement;
  pondButton: HTMLButtonElement;
  focus(): void;
}

/* With ask, onEnter waits for every question to be answered; the pass is remembered on this device */
export function doorCard(ask: boolean, onPond: () => void, onEnter: () => void): DoorCard {
  const fields = (ask ? pickQuestions(QUESTIONS, 2, Math.random) : []).map((q, i) => {
    const input = h("input", {
      type: "text",
      id: `door-answer-${i}`,
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: false,
    });
    const hint = h("p", { class: "hint", hidden: true }, q.hint);
    const reveal = h("button", { type: "button", class: "link" }, COPY.door.showAnswer);
    reveal.addEventListener("click", () => {
      hint.hidden = false;
      reveal.hidden = true;
    });
    const el = h(
      "div",
      { class: "door-field" },
      h("label", { htmlFor: input.id }, q.prompt),
      input,
      reveal,
      hint,
    );
    return { q, input, el };
  });

  const status = h("p", { class: "door-status", attrs: { role: "status" } });
  const pondButton = h("button", { type: "button", disabled: true }, COPY.door.showPond);
  const enter = h("button", { type: "submit", class: "primary" }, COPY.door.enter);
  pondButton.addEventListener("click", onPond);
  const form = h(
    "form",
    { class: "door-card" },
    h("h1", {}, COPY.door.title),
    h("p", {}, COPY.door.intro),
    ask && h("p", { class: "muted" }, COPY.door.demoNote),
    ...fields.map((f) => f.el),
    h("div", { class: "door-actions" }, pondButton, enter),
    ask && status,
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const wrong = fields.filter((f) => !matches(f.input.value, f.q));
    for (const f of fields) f.input.setAttribute("aria-invalid", String(wrong.includes(f)));
    if (wrong.length) {
      status.textContent = wrong.length === fields.length
        ? COPY.door.bothWrong
        : COPY.door.oneWrong;
      wrong[0].input.focus();
      return;
    }
    if (ask) {
      try {
        localStorage.setItem(PASS, "1");
      } catch {
        // private browsing
      }
    }
    onEnter();
  });

  return { el: form, pondButton, focus: () => (fields[0]?.input ?? enter).focus() };
}
