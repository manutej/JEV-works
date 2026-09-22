/**
 * CODE-GATES — the deterministic half of the pipeline. No model calls here,
 * on purpose (NETER.md P21): dedup, exclusion, territory, token-counting,
 * and ranking are all either cross-record, list-lookup, or arithmetic — none
 * of which Jev can do reliably, and all of which are exact and free in code.
 *
 * Every export says WHY it isn't a question in questions.ts.
 */
import type { Lead } from './types.ts';

// ─────────────────────────────────────────────────────── near-duplicate detection
//
// WHY CODE: "is this a near-duplicate of another lead" requires comparing two
// records to each other — P21's forbidden shape. Jev evaluates one state at
// a time; there is no cross-item comparison primitive. Normalisation +
// grouping is exact, deterministic, and costs nothing.

/** Lowercases, strips legal suffixes and punctuation, collapses whitespace. */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|group|gmbh|sa|plc)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Best-effort domain extraction from free text (website blurb, email signature, etc). */
export function extractDomain(text: string): string | null {
  const m = text.match(/\b([a-z0-9-]+\.(?:com|io|co|net|org|ai))\b/i);
  return m ? m[1].toLowerCase() : null;
}

export type DuplicateGroup = { key: string; leadIds: string[] };

const normalizeText = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Below this many words a message is too generic to identify an inquiry ("hi", "pricing",
 * "demo please"): colleagues at one company share a fingerprint, so a short message would
 * otherwise swallow theirs. Every planted duplicate's source message is ≥ 19 words.
 */
export const MIN_MESSAGE_WORDS = 8;

const words = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** True when the shorter message, as a whole-word sequence of ≥ MIN_MESSAGE_WORDS, appears inside the longer. */
function sameInquiry(a: readonly string[], b: readonly string[]): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < MIN_MESSAGE_WORDS) return false;
  const needle = ` ${short.join(' ')} `;
  return ` ${long.join(' ')} `.includes(needle);
}

/**
 * Groups leads that are the same INQUIRY submitted more than once — not merely the same
 * company. Two records merge only when they agree on the firmographic fingerprint
 * (normalised name, industry, band, country, website blurb) AND one inbound message
 * contains the other as whole words, at least MIN_MESSAGE_WORDS long (a verbatim
 * resubmission, or a "following up on…" forward). "hi" is not inside "this".
 *
 * There is deliberately no name-only fallback, and a shared domain is not enough either:
 * "Acme Corp" with three contacts sending three different messages is three leads. The old
 * name-only key merged 516 leads against 60 planted duplicates.
 *
 * Merging is transitive (A ⊂ B ⊂ C is one group): within one company record, a chain of
 * ≥ 8-word containments is one inquiry being forwarded along.
 *
 * Known limit: the rule matches how the synthetic corpus plants duplicates (exact
 * firmographics, message verbatim or prefixed). A real resubmission with an edited message,
 * a re-scraped blurb, or an updated band is missed. Recall on real data is unmeasured.
 *
 * Returns only groups with >1 member. Deterministic; O(n) bucketing, then pairwise within a
 * fingerprint bucket, which is small because it is one company's records.
 */
export function detectNearDuplicates(leads: readonly Lead[]): DuplicateGroup[] {
  const buckets = new Map<string, Lead[]>();
  for (const lead of leads) {
    const normName = normalizeCompanyName(lead.companyName);
    if (!normName) continue; // empty company name is a garbage-corpus concern, not a dedup one
    const key = [normName, lead.industry, lead.employeeBand, lead.country, normalizeText(lead.websiteBlurb)].join('::');
    const bucket = buckets.get(key) ?? [];
    bucket.push(lead);
    buckets.set(key, bucket);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue;
    // Union-find over sameInquiry; short or empty messages never merge anything.
    const parent = bucket.map((_, i) => i);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    const messages = bucket.map(l => words(l.inboundMessage));
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        if (sameInquiry(messages[i], messages[j])) parent[root(j)] = root(i);
      }
    }
    const byRoot = new Map<number, string[]>();
    bucket.forEach((lead, i) => byRoot.set(root(i), [...(byRoot.get(root(i)) ?? []), lead.id]));
    let n = 0;
    for (const leadIds of byRoot.values()) {
      if (leadIds.length > 1) groups.push({ key: `${key}#${n++}`, leadIds });
    }
  }
  return groups;
}

/** Given the groups above, picks one representative per group (first by id) and
 * returns the rest as ids to short-circuit before they ever reach Jev. */
export function representativesAndDuplicates(groups: readonly DuplicateGroup[]): {
  representatives: Set<string>;
  duplicatesOf: Map<string, string>; // duplicate lead id -> representative lead id
} {
  const representatives = new Set<string>();
  const duplicatesOf = new Map<string, string>();
  for (const g of groups) {
    const sorted = [...g.leadIds].sort();
    const [rep, ...rest] = sorted;
    representatives.add(rep);
    for (const id of rest) duplicatesOf.set(id, rep);
  }
  return { representatives, duplicatesOf };
}

// ─────────────────────────────────────────────────────────────── exclusion list
//
// WHY CODE: "is this company on our exclusion / competitor / do-not-contact
// list" is exact-match membership in a list you own. A classifier adds
// nothing but latency and a chance of being wrong; this is what allow/deny
// lists are for.

export const EXCLUSION_LIST: ReadonlySet<string> = new Set(
  ['Acme Testco', 'Do Not Contact LLC', 'Competitor Corp'].map(normalizeCompanyName),
);

export function matchesExclusionList(lead: Lead): boolean {
  return EXCLUSION_LIST.has(normalizeCompanyName(lead.companyName));
}

// ─────────────────────────────────────────────────────────────────── territory
//
// WHY CODE: country -> territory is a static lookup table, not a judgement.
// Asking a classifier to "read" a territory off a country string is asking
// it to do a dictionary lookup with extra steps and a failure mode.

const TERRITORY_BY_COUNTRY: Record<string, string> = {
  US: 'AMER', CA: 'AMER', MX: 'AMER', BR: 'LATAM',
  GB: 'EMEA', DE: 'EMEA', FR: 'EMEA', NL: 'EMEA', SE: 'EMEA',
  AU: 'APAC', IN: 'APAC', JP: 'APAC',
};

export function territoryFor(country: string): string {
  return TERRITORY_BY_COUNTRY[country.toUpperCase()] ?? 'UNASSIGNED';
}

// ────────────────────────────────────────────────────────────── token counting
//
// WHY CODE: P3 — the context ceiling is a cliff (~31K tokens), not a slope,
// and it fails as an opaque 500 with no typed size error. You must count
// before you call, every time, because there is no other warning.

/** Cheap, deterministic estimate: ~4 chars/token for English-ish text. Good
 * enough for a pre-flight guard; it does not need to match the provider's
 * tokenizer exactly, only to catch "this state is nowhere near the ceiling"
 * vs "this state is dangerously close." */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateStateTokens(state: Record<string, unknown>): number {
  return estimateTokens(JSON.stringify(state));
}

export const TOKEN_CEILING = 28_000; // stay well clear of the measured ~31K cliff (NETER.md P3)

export class StateTooLargeError extends Error {
  readonly estimatedTokens: number;
  readonly leadId: string;
  constructor(estimatedTokens: number, leadId: string) {
    super(`state for lead ${leadId} estimated at ${estimatedTokens} tokens, over the ${TOKEN_CEILING} guard ceiling`);
    this.estimatedTokens = estimatedTokens;
    this.leadId = leadId;
  }
}

/** Throws BEFORE the call, with a typed error, instead of letting the gateway
 * hand back an opaque 500. Call this immediately before every experimental_evaluate. */
export function assertUnderTokenCeiling(state: Record<string, unknown>, leadId: string): number {
  const n = estimateStateTokens(state);
  if (n > TOKEN_CEILING) throw new StateTooLargeError(n, leadId);
  return n;
}

// ───────────────────────────────────────────────────────────── score -> rank
//
// WHY CODE: "which of these is the highest priority" / "rank these" is a
// cross-item comparison and, worse, sounds like asking Jev to count or total
// (P18). Score each lead independently with Jev, then sort in code — sorting
// a list of numbers is not a judgement.

export function rankByScore<T>(items: readonly T[], scoreOf: (item: T) => number): T[] {
  return [...items].sort((a, b) => scoreOf(b) - scoreOf(a));
}

// ──────────────────────────────────────────────────────────────── entropy
//
// Shared with pipeline.ts and evaluate.ts. Not a "gate" by itself — see
// NETER.md P5/P6: gate on distribution entropy, not top probability, because
// top probability answers garbage confidently. Normalised to [0, 1] by
// dividing by log2(number of options), same convention as measure-confidence.ts.

export function normalizedEntropy(probabilities: Record<string, number>): number {
  const vs = Object.values(probabilities).filter(v => v > 0);
  if (vs.length <= 1) return 0;
  const h = -vs.reduce((acc, v) => acc + v * Math.log2(v), 0);
  return h / Math.log2(Object.keys(probabilities).length);
}
