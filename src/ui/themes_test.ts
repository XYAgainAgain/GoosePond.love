import { assert, assertEquals } from "@std/assert";
import { THEMES, themeTokens } from "./themes.ts";

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

Deno.test("every theme keeps text, muted text, and links readable on every surface", () => {
  for (const name of THEMES) {
    const t = themeTokens(name);
    for (const ink of ["--text", "--muted", "--link", "--danger"]) {
      for (const surface of ["--bg", "--panel", "--panel-2", "--control", "--control-hover"]) {
        const ratio = contrast(t[ink], t[surface]);
        assert(ratio >= 4.5, `${name}: ${ink} on ${surface} is ${ratio.toFixed(2)}`);
      }
    }
    assert(contrast(t["--accent-ink"], t["--accent"]) >= 4.5, `${name}: primary button`);
    assert(contrast(t["--text"], t["--pressed"]) >= 4.5, `${name}: pressed`);
    assert(contrast(t["--text"], t["--notice"]) >= 4.5, `${name}: notice`);
  }
});

Deno.test("every theme keeps control borders and focus rings visible", () => {
  for (const name of THEMES) {
    const t = themeTokens(name);
    for (const surface of ["--bg", "--panel", "--panel-2", "--control"]) {
      const border = contrast(t["--control-line"], t[surface]);
      assert(border >= 3, `${name}: --control-line on ${surface} is ${border.toFixed(2)}`);
      const ring = contrast(t["--accent"], t[surface]);
      assert(ring >= 3, `${name}: --accent on ${surface} is ${ring.toFixed(2)}`);
    }
  }
});

Deno.test("the stylesheet's theme blocks match the token table", async () => {
  const css = await Deno.readTextFile(new URL("./styles.css", import.meta.url));
  for (const name of THEMES) {
    const head = name === THEMES[0] ? ":root {" : `html[data-theme="${name}"] {`;
    const start = css.indexOf(head);
    assert(start !== -1, `${head} is missing`);
    const block = css.slice(start, css.indexOf("}", start));
    for (const [key, value] of Object.entries(themeTokens(name))) {
      if (key === "--node-border") continue;
      assertEquals(
        block.match(new RegExp(`${key}: (#[0-9a-f]{6});`))?.[1],
        value,
        `${name} ${key}`,
      );
    }
  }
});
