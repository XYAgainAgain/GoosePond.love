import { assertEquals } from "@std/assert";
import { dateSpan, formatDate, isValidDate } from "./dates.ts";

Deno.test("a year, a month, and a day all span their year", () => {
  for (const d of ["1921", "1921-04", "1921-04-03"]) {
    assertEquals(dateSpan(d), { earliest: 1921, latest: 1921, approximate: false });
  }
});

Deno.test("an approximate date keeps its year and says so", () => {
  assertEquals(dateSpan("1921~"), { earliest: 1921, latest: 1921, approximate: true });
  assertEquals(dateSpan("1921-04?"), { earliest: 1921, latest: 1921, approximate: true });
});

Deno.test("a range spans both ends", () => {
  assertEquals(dateSpan("1919/1923"), { earliest: 1919, latest: 1923, approximate: false });
  assertEquals(dateSpan("1919~/1923"), { earliest: 1919, latest: 1923, approximate: true });
});

Deno.test("unknown and unreadable dates have no span", () => {
  assertEquals(dateSpan(undefined), undefined);
  assertEquals(dateSpan(""), undefined);
  assertEquals(dateSpan("spring of '21"), undefined);
  assertEquals(dateSpan("1921-13"), undefined);
  assertEquals(dateSpan("1921-04-32"), undefined);
  assertEquals(dateSpan("1919/1921/1923"), undefined);
});

Deno.test("isValidDate rejects a backwards range", () => {
  assertEquals(isValidDate("1919/1923"), true);
  assertEquals(isValidDate("1923/1919"), false);
  assertEquals(isValidDate("1921-04-03"), true);
  assertEquals(isValidDate("21"), false);
});

Deno.test("formatDate words each form without sharpening it", () => {
  assertEquals(formatDate(undefined), "unknown");
  assertEquals(formatDate("1921"), "1921");
  assertEquals(formatDate("1921-04"), "April 1921");
  assertEquals(formatDate("1921-04-03"), "April 3, 1921");
  assertEquals(formatDate("1921~"), "about 1921");
  assertEquals(formatDate("1919/1923"), "between 1919 and 1923");
  assertEquals(formatDate("1919~/1923-06"), "between about 1919 and June 1923");
  assertEquals(formatDate("spring of '21"), "spring of '21");
});

Deno.test("isValidDate rejects days a month doesn't have", () => {
  assertEquals(isValidDate("1921-04-30"), true);
  assertEquals(isValidDate("1921-04-31"), false);
  assertEquals(isValidDate("1921-01-31"), true);
  assertEquals(isValidDate("1921-02-29"), false);
  assertEquals(isValidDate("1920-02-29"), true);
  assertEquals(isValidDate("1900-02-29"), false);
  assertEquals(isValidDate("2000-02-29"), true);
  assertEquals(isValidDate("1920-02-30"), false);
});
