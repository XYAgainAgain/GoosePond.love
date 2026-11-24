import { assertEquals } from "@std/assert";
import { tapTracker } from "./tap.ts";

Deno.test("a press that stays inside the slop is a tap", () => {
  const tap = tapTracker(8);
  tap.down(1, 100, 100);
  tap.move(1, 103, 104);
  assertEquals(tap.up(1, 102, 101), true);
});

Deno.test("a drag that comes back to where it started is not a tap", () => {
  const tap = tapTracker(8);
  tap.down(1, 100, 100);
  tap.move(1, 300, 120);
  assertEquals(tap.up(1, 100, 100), false);
});

Deno.test("a second finger neither replaces the first nor taps", () => {
  const tap = tapTracker(8);
  tap.down(1, 100, 100);
  tap.down(2, 400, 400);
  tap.move(1, 250, 100);
  assertEquals(tap.up(2, 400, 400), false);
  assertEquals(tap.up(1, 250, 100), false);
});

Deno.test("a canceled press is not a tap", () => {
  const tap = tapTracker(8);
  tap.down(1, 100, 100);
  tap.cancel(1);
  assertEquals(tap.up(1, 100, 100), false);
  tap.down(2, 50, 50);
  assertEquals(tap.up(2, 50, 50), true);
});
