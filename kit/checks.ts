/**
 * Pre-flight checks. All run before any model call; any failure stops the run (no silent degrade).
 *
 *   disjointness  L31 + L40: fit/test overlap measured at the TEXT the model reads, not just ids.
 *   privacy       states go to an external API; refuse emails, phone numbers and credential-like strings.
 */
import type { Item, JsonValue } from './spec.ts';

/** Canonical text of a state: what the model reads, whitespace- and case-normalised. */
export function stateText(s: JsonValue): string {
  const raw = typeof s === 'string' ? s : JSON.stringify(s);
  return raw.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Split test items into seen (their text appears among fitItems) and novel, at the text the model reads (L40).
 * `textOf` lets a caller pick the unit that matters (e.g. only the message field of a record).
 */
export function seenShare<T>(items: readonly T[], fitItems: readonly T[], textOf: (x: T) => string): { seen: T[]; novel: T[]; share: number } {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const fit = new Set(fitItems.map(x => norm(textOf(x))));
  const seen = items.filter(x => fit.has(norm(textOf(x))));
  const novel = items.filter(x => !fit.has(norm(textOf(x))));
  return { seen, novel, share: items.length ? seen.length / items.length : 0 };
}

/**
 * Word n-gram overlap: exact-text checks miss two model-written items that share long phrases with different slot fills
 * (leads bc7101: 5 "blind" pool-C templates shared 8-word runs with dev pool A; same-model authors converge).
 * Returns the ids of test items sharing any run of `runWords` consecutive words with any fit item.
 */
export function runOverlap(test: readonly { id: string; text: string }[], fit: readonly string[], runWords = 8): string[] {
  const grams = (t: string) => { const w = t.toLowerCase().match(/[a-z0-9']+/g) ?? []; const out: string[] = []; for (let i = 0; i + runWords <= w.length; i++) out.push(w.slice(i, i + runWords).join(' ')); return out; };
  const fitGrams = new Set(fit.flatMap(grams));
  return test.filter(t => grams(t.text).some(g => fitGrams.has(g))).map(t => t.id);
}

export type Disjointness = { fit: number; test: number; idOverlap: number; textOverlap: number; seenShare: number; runWords: number; runOverlap: number; runShare: number };

export function disjointness(items: readonly Item[]): Disjointness | null {
  const fit = items.filter(i => i.split === 'fit'), test = items.filter(i => i.split === 'test');
  if (!fit.length || !test.length) return null;
  const fitIds = new Set(fit.map(i => i.id)), fitTexts = new Set(fit.map(i => stateText(i.state)));
  const idOverlap = test.filter(i => fitIds.has(i.id)).length;
  const textOverlap = test.filter(i => fitTexts.has(stateText(i.state))).length;
  const runs = runOverlap(test.map(i => ({ id: i.id, text: stateText(i.state) })), fit.map(i => stateText(i.state)), 8);
  return { fit: fit.length, test: test.length, idOverlap, textOverlap, seenShare: textOverlap / test.length, runWords: 8, runOverlap: runs.length, runShare: runs.length / test.length };
}

const PATTERNS: [string, RegExp][] = [
  ['email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
  ['phone', /(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/],
  ['api-key', /\b(?:sk|pk|rk|vck|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{16,}/],
  ['aws-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['bearer', /\bBearer\s+[A-Za-z0-9._-]{20,}/],
];

export type PrivacyHit = { itemId: string; kind: string };

/** Returns hits (item id + kind only; the matched text is never echoed). */
export function privacyScan(items: readonly Item[]): PrivacyHit[] {
  const hits: PrivacyHit[] = [];
  for (const it of items) {
    const t = typeof it.state === 'string' ? it.state : JSON.stringify(it.state);
    for (const [kind, re] of PATTERNS) if (re.test(t)) hits.push({ itemId: it.id, kind });
  }
  return hits;
}
