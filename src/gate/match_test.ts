import { assert, assertEquals, assertFalse } from "@std/assert";
import { matches, normalize, pickQuestions, type Question } from "./match.ts";
import { QUESTIONS } from "./questions.ts";

function q(...accept: string[]): Question {
  return { id: accept[0], prompt: "?", accept, hint: "!" };
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

Deno.test("normalize lowercases and collapses punctuation and whitespace", () => {
  assertEquals(normalize("MariGOLD"), "marigold");
  assertEquals(normalize("  Lake---Wendell!!  "), "lake wendell");
  assertEquals(normalize("lake\t\n  wendell"), "lake wendell");
  assertEquals(normalize("It's, um... July?"), "it s um july");
});

Deno.test("normalize strips diacritics", () => {
  assertEquals(normalize("Marígöld"), "marigold");
  assertEquals(normalize("Crème Brûlée"), "creme brulee");
});

Deno.test("normalize turns an ampersand into and", () => {
  assertEquals(normalize("Salt & Pepper"), "salt and pepper");
  assertEquals(normalize("salt&pepper"), "salt and pepper");
});

Deno.test("normalize drops one leading article only", () => {
  assertEquals(normalize("The Annex"), "annex");
  assertEquals(normalize("a heron"), "heron");
  assertEquals(normalize("An owl"), "owl");
  assertEquals(normalize("the the"), "the");
  assertEquals(normalize("the"), "the");
  assertEquals(normalize("theater"), "theater");
  assertEquals(normalize("annex the"), "annex the");
});

Deno.test("exact match on every accepted phrasing, in any case or punctuation", () => {
  const bell = q("the youngest", "youngest person", "whoever is youngest");
  assert(matches("The Youngest!", bell));
  assert(matches("youngest-person", bell));
  assert(matches("  WHOEVER   is youngest. ", bell));
});

Deno.test("phrasings under 5 characters match only exactly", () => {
  const month = q("July");
  assert(matches("july", month));
  assertFalse(matches("jul", month));
  assertFalse(matches("jule", month));
  assertFalse(matches("juyl", month));
});

Deno.test("phrasings of 5 characters allow one edit", () => {
  const door = q("green");
  assert(matches("gren", door));
  assert(matches("greet", door));
  assert(matches("greeen", door));
  assert(matches("rgeen", door));
  assertFalse(matches("grent", door));
  assertFalse(matches("greenish", door));
});

Deno.test("phrasings of 8 characters allow one edit but not two", () => {
  const canoe = q("marigold");
  assert(matches("marigld", canoe));
  assert(matches("maribold", canoe));
  assertFalse(matches("maregild", canoe));
});

Deno.test("phrasings of 9 characters allow two edits but not three", () => {
  const nine = q("lake wren");
  assert(matches("laku wrem", nine));
  assert(matches("lake wrn", nine));
  assertFalse(matches("laku wxem", nine));
});

Deno.test("an adjacent transposition counts as one edit", () => {
  assert(matches("marigodl", q("marigold")));
  assert(matches("sawmlil", q("sawmill")));
  assert(matches("alke wrne", q("lake wren")));
});

Deno.test("fuzzy matching compares whole strings, never substrings", () => {
  const canoe = q("marigold");
  assertFalse(matches("i think it's marigodl", canoe));
  assertFalse(matches("the canoe maribold", canoe));
});

Deno.test("an answer of up to 8 words may contain a phrasing as a whole-word run", () => {
  const canoe = q("marigold");
  assert(matches("i think it's called marigold", canoe));
  assert(matches("i am pretty sure it is called marigold", canoe));
  assertFalse(matches("i am pretty sure that it is called marigold", canoe));
  assertFalse(matches("marigolds are nice", canoe));
  assert(matches("well it is lake wendell i think", q("lake wendell")));
  assertFalse(matches("lake over in wendell", q("lake wendell")));
});

Deno.test("empty and blank answers never match", () => {
  const door = q("green");
  assertFalse(matches("", door));
  assertFalse(matches("    ", door));
  assertFalse(matches("?!...", door));
  assertFalse(matches("", q("")));
});

Deno.test("a wrong but similar answer fails", () => {
  assertFalse(matches("sawmill", q("wren")));
  assertFalse(matches("lantern", q("wren", "wren cabin")));
  assertFalse(matches("the oldest", q("the youngest", "youngest person")));
  assertFalse(matches("june", q("july")));
});

Deno.test("pickQuestions returns distinct questions", () => {
  const picked = pickQuestions(QUESTIONS, 2, seeded(7));
  assertEquals(picked.length, 2);
  assert(picked[0].id !== picked[1].id);
  for (let seed = 0; seed < 50; seed++) {
    const ids = pickQuestions(QUESTIONS, 5, seeded(seed)).map((x) => x.id);
    assertEquals(new Set(ids).size, 5);
  }
});

Deno.test("pickQuestions is deterministic for a given random", () => {
  const a = pickQuestions(QUESTIONS, 3, seeded(42)).map((x) => x.id);
  const b = pickQuestions(QUESTIONS, 3, seeded(42)).map((x) => x.id);
  assertEquals(a, b);
});

Deno.test("pickQuestions varies its order and does not mutate the pool", () => {
  const before = QUESTIONS.map((x) => x.id);
  const orders = new Set<string>();
  for (let seed = 0; seed < 20; seed++) {
    orders.add(pickQuestions(QUESTIONS, 2, seeded(seed)).map((x) => x.id).join());
  }
  assert(orders.size > 1);
  assertEquals(QUESTIONS.map((x) => x.id), before);
});

Deno.test("pickQuestions shuffles the whole pool when count exceeds it", () => {
  const picked = pickQuestions(QUESTIONS, 99, seeded(3));
  assertEquals(picked.length, QUESTIONS.length);
  assertEquals(new Set(picked.map((x) => x.id)), new Set(QUESTIONS.map((x) => x.id)));
  assertEquals(pickQuestions(QUESTIONS, 0, seeded(3)), []);
  assertEquals(pickQuestions([], 2, seeded(3)), []);
});

Deno.test("pickQuestions tolerates a random that returns its upper bound", () => {
  const picked = pickQuestions(QUESTIONS, QUESTIONS.length, () => 1);
  assertEquals(new Set(picked.map((x) => x.id)).size, QUESTIONS.length);
});

Deno.test("QUESTIONS has at least two questions with unique ids, prompts, and hints", () => {
  assert(QUESTIONS.length >= 2);
  assertEquals(new Set(QUESTIONS.map((x) => x.id)).size, QUESTIONS.length);
  for (const question of QUESTIONS) {
    assert(question.prompt.trim().length > 0, question.id);
    assert(question.hint.trim().length > 0, question.id);
    assert(question.accept.length > 0, question.id);
  }
});

Deno.test("every question is matched by each of its own accepted phrasings", () => {
  for (const question of QUESTIONS) {
    for (const phrasing of question.accept) {
      assert(matches(phrasing, question), `${question.id}: ${phrasing}`);
    }
  }
});

Deno.test("no question accepts another question's answers", () => {
  for (const question of QUESTIONS) {
    for (const other of QUESTIONS) {
      if (other === question) continue;
      for (const phrasing of other.accept) {
        assertFalse(matches(phrasing, question), `${question.id} took ${other.id}: ${phrasing}`);
      }
    }
  }
});
