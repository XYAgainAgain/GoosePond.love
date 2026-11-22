const VIBRATE_MS = 8;
const PRESS = "press-bounce";
const PRESSABLE = "button, input[type='checkbox'], input[type='radio']";

let tick: HTMLInputElement | null | undefined;

/* iOS has no Vibration API, but flipping a native switch control plays the system tick */
function makeSwitch(): HTMLInputElement | null | undefined {
  const input = document.createElement("input");
  if (!("switch" in input)) return null;
  if (!document.body) return undefined;
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.className = "haptic-switch";
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = -1;
  input.inert = true;
  document.body.append(input);
  return input;
}

/* Desktop Chromium and Firefox for Android 79+ return true without vibrating, which would skip the
   bounce, so only coarse pointers outside Firefox try it */
function canVibrate(): boolean {
  if (typeof navigator.vibrate !== "function" || /\bFirefox\//.test(navigator.userAgent)) {
    return false;
  }
  try {
    return matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/* Call inside the click handler: vibrate() needs the user activation an await would lose */
export function haptic(el?: Element | null) {
  if (canVibrate() && navigator.vibrate(VIBRATE_MS)) return;
  if (tick === undefined || (tick && !tick.isConnected)) tick = makeSwitch();
  if (tick) {
    tick.checked = !tick.checked;
    return;
  }
  if (!el) return;
  el.classList.remove(PRESS);
  void (el as HTMLElement).offsetWidth; // restarts the animation on a repeated press
  el.classList.add(PRESS);
}

/* Delegated, so panels rebuilt on every change need no wiring */
export function pressFeedback(within: Element, signal?: AbortSignal) {
  within.addEventListener("click", (e) => {
    const el = (e.target as Element | null)?.closest(PRESSABLE);
    if (!el || (el as HTMLButtonElement).disabled) return;
    haptic(el);
  }, { signal });
}
