import { assertEquals } from "@std/assert";
import { moonPhase, nextSimMs, skyOf } from "./scene.ts";

Deno.test("moon phases follow the lit fraction and its direction", () => {
  assertEquals(moonPhase(0.01, true), "new");
  assertEquals(moonPhase(0.2, true), "waxingCrescent");
  assertEquals(moonPhase(0.5, true), "firstQuarter");
  assertEquals(moonPhase(0.8, true), "waxingGibbous");
  assertEquals(moonPhase(0.99, false), "full");
  assertEquals(moonPhase(0.8, false), "waningGibbous");
  assertEquals(moonPhase(0.52, false), "lastQuarter");
  assertEquals(moonPhase(0.2, false), "waningCrescent");
});

Deno.test("the most striking weather names the sky", () => {
  const calm = { storms: 0, rain: 0, fog: 0, mist: 0, cover: 10, mid: 10 };
  assertEquals(skyOf(calm), "clear");
  assertEquals(skyOf({ ...calm, mid: 50 }), "partly");
  assertEquals(skyOf({ ...calm, cover: 95 }), "overcast");
  assertEquals(skyOf({ ...calm, cover: 95, fog: 60 }), "fog");
  assertEquals(skyOf({ ...calm, fog: 60, rain: 20 }), "rain");
  assertEquals(skyOf({ ...calm, rain: 20, storms: 70 }), "storm");
});

Deno.test("a still frame holds accelerated time but follows the real clock", () => {
  const noon = Date.UTC(2026, 10, 26, 17), now = noon + 3_600_000;
  assertEquals(nextSimMs(noon, 1, 1440, true, now), noon);
  assertEquals(nextSimMs(noon, 1, 1440, false, now), noon + 1_440_000);
  assertEquals(nextSimMs(noon, 1, null, true, now), now);
  assertEquals(nextSimMs(noon, 1, 0, false, now), noon);
});
