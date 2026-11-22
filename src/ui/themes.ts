import { oklchHex } from "../map/branches.ts";
import type { MapColors } from "../map/style.ts";

export type ThemeName = "ember" | "light" | "blackout";
export const THEMES: ThemeName[] = ["ember", "light", "blackout"];

const HUE = 52;
const tone = (l: number, c = 0.018) => oklchHex(l, c, HUE);

/* Mirrored by :root and html[data-theme] in styles.css, so pre-paint colors the first frame */
const TOKENS: Record<ThemeName, Record<string, string>> = {
  ember: {
    "--bg": tone(0.185),
    "--panel": tone(0.235),
    "--panel-2": tone(0.21),
    "--control": tone(0.285),
    "--control-hover": tone(0.325),
    "--line": tone(0.315),
    "--control-line": tone(0.58),
    "--text": tone(0.935, 0.012),
    "--muted": tone(0.77, 0.022),
    "--link": oklchHex(0.83, 0.085, 230),
    "--accent": "#ff9d5c",
    "--accent-ink": "#1b1208",
    "--pressed": oklchHex(0.36, 0.06, 55),
    "--notice": oklchHex(0.28, 0.04, 70),
    "--notice-line": oklchHex(0.41, 0.05, 70),
    "--danger": "#f0a3a3",
    "--danger-line": "#a14a4a",
    "--invalid": "#e06c6c",
    "--node-border": tone(0.8, 0.014),
    "--band": tone(0.21),
  },
  light: {
    "--bg": tone(0.965, 0.012),
    "--panel": tone(0.985, 0.008),
    "--panel-2": tone(0.975, 0.01),
    "--control": tone(0.93, 0.014),
    "--control-hover": tone(0.9, 0.016),
    "--line": tone(0.87, 0.016),
    "--control-line": tone(0.6, 0.02),
    "--text": tone(0.24, 0.02),
    "--muted": tone(0.45, 0.024),
    "--link": oklchHex(0.47, 0.11, 240),
    "--accent": oklchHex(0.56, 0.15, 48),
    "--accent-ink": "#ffffff",
    "--pressed": oklchHex(0.86, 0.06, 60),
    "--notice": oklchHex(0.92, 0.05, 80),
    "--notice-line": oklchHex(0.76, 0.07, 75),
    "--danger": oklchHex(0.48, 0.16, 25),
    "--danger-line": oklchHex(0.6, 0.14, 25),
    "--invalid": oklchHex(0.55, 0.19, 25),
    "--node-border": tone(0.42, 0.02),
    "--band": tone(0.935, 0.014),
  },
  blackout: {
    "--bg": "#000000",
    "--panel": tone(0.17),
    "--panel-2": tone(0.13),
    "--control": tone(0.23),
    "--control-hover": tone(0.28),
    "--line": tone(0.27),
    "--control-line": tone(0.55),
    "--text": tone(0.975, 0.008),
    "--muted": tone(0.82, 0.02),
    "--link": oklchHex(0.85, 0.085, 230),
    "--accent": "#ff9d5c",
    "--accent-ink": "#1b1208",
    "--pressed": oklchHex(0.33, 0.07, 55),
    "--notice": oklchHex(0.25, 0.045, 70),
    "--notice-line": oklchHex(0.4, 0.05, 70),
    "--danger": "#f5b0b0",
    "--danger-line": "#a14a4a",
    "--invalid": "#e06c6c",
    "--node-border": tone(0.82, 0.014),
    "--band": tone(0.11),
  },
};

export function themeTokens(name: ThemeName): Record<string, string> {
  return TOKENS[name];
}

export function mapColors(name: ThemeName): MapColors {
  const t = TOKENS[name];
  return {
    ink: t["--text"],
    labelBg: t["--bg"],
    border: t["--node-border"],
    muted: t["--muted"],
    ground: name === "light" ? "light" : "dark",
  };
}

export function applyTheme(name: ThemeName) {
  document.documentElement.dataset.theme = name;
}
