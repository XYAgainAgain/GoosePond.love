export interface Question {
  id: string;
  prompt: string;
  accept: string[];
  hint: string;
}

const MAX_CONTAINING_WORDS = 8;

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(?:the|a|an) /, "");
}

/* Optimal string alignment distance, in code points */
function editDistance(a: string, b: string): number {
  const s = Array.from(a);
  const t = Array.from(b);
  const width = t.length + 1;
  const d = new Array<number>((s.length + 1) * width);
  for (let i = 0; i <= s.length; i++) d[i * width] = i;
  for (let j = 0; j <= t.length; j++) d[j] = j;
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let best = Math.min(
        d[(i - 1) * width + j] + 1,
        d[i * width + j - 1] + 1,
        d[(i - 1) * width + j - 1] + cost,
      );
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        best = Math.min(best, d[(i - 2) * width + j - 2] + 1);
      }
      d[i * width + j] = best;
    }
  }
  return d[s.length * width + t.length];
}

function allowedEdits(phrase: string): number {
  const length = Array.from(phrase).length;
  if (length >= 9) return 2;
  if (length >= 5) return 1;
  return 0;
}

function containsRun(words: string[], run: string[]): boolean {
  for (let start = 0; start + run.length <= words.length; start++) {
    if (run.every((word, k) => words[start + k] === word)) return true;
  }
  return false;
}

export function matches(answer: string, q: Question): boolean {
  const given = normalize(answer);
  if (given === "") return false;
  const words = given.split(" ");
  for (const raw of q.accept) {
    const phrase = normalize(raw);
    if (phrase === "") continue;
    if (given === phrase) return true;
    const edits = allowedEdits(phrase);
    const lengthGap = Math.abs(Array.from(given).length - Array.from(phrase).length);
    if (edits > 0 && lengthGap <= edits && editDistance(given, phrase) <= edits) return true;
    if (words.length <= MAX_CONTAINING_WORDS && containsRun(words, phrase.split(" "))) {
      return true;
    }
  }
  return false;
}

export function pickQuestions(pool: Question[], count: number, random: () => number): Question[] {
  const deck = pool.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, Math.max(0, Math.min(count, deck.length)));
}
