/**
 * BLIND VARIANT — corpus seeds whose messages come from templates written by an author who never saw
 * this repo, the regex, or any dev message (corpus/blind/templates.json; label audit corpus/blind/audit.json).
 *
 * Which templates a seed uses is data, not code: corpus/variants.json maps a seed prefix to a template
 * file and a pool. `ba<n>` = pool A (dev only), `bb<n>` = pool B (holdout). The file is validated here,
 * all problems at once, before any lead is generated.
 */
import { readFileSync } from 'node:fs';

export type BlindCategory = 'buyer' | 'non_buyer' | 'out_of_market' | 'ambiguous' | 'adversarial';
export type BlindTemplate = { text: string; lean?: boolean; why?: string };
export type BlindPool = Record<BlindCategory, BlindTemplate[]>;
export type Variant = {
  kind: 'blind';
  templates: string;
  pool: string;
  note?: string;
  /** Drop templates sharing any runWords-long word run with another pool (e.g. the dev pool). Text only. */
  excludeRunsFrom?: { templates: string; pool: string; runWords: number; why?: string };
};

export const BLIND_CATEGORIES: readonly BlindCategory[] = ['buyer', 'non_buyer', 'out_of_market', 'ambiguous', 'adversarial'];
/** The slots the author was told about. Any other {placeholder} is an authoring error. */
export const SLOTS = ['company', 'industry', 'employees', 'tool'] as const;
export type Slots = Record<(typeof SLOTS)[number], string>;
const MIN_WORDS = 12; // the author's brief; also clears the dedup minimum (8)

const corpusUrl = (p: string) => new URL(`./corpus/${p}`, import.meta.url);
const readJson = (u: URL) => {
  try {
    return JSON.parse(readFileSync(u, 'utf8'));
  } catch (cause) {
    throw new Error(`${u.pathname}: not readable JSON`, { cause });
  }
};

/** `bb6101` -> { variant, rngSeed: 6101 }; undefined when the seed has no registered prefix. */
export function variantFor(seed: string): { prefix: string; variant: Variant; rngSeed: number } | undefined {
  const m = seed.match(/^([a-z]+)(\d+)$/);
  if (!m) return undefined;
  const registry = readJson(corpusUrl('variants.json')) as Record<string, Variant>;
  const variant = registry[m[1]];
  return variant ? { prefix: m[1], variant, rngSeed: Number(m[2]) } : undefined;
}

export function checkPool(raw: unknown, pool: string): { value?: BlindPool; errors: string[] } {
  const errors: string[] = [];
  const data = raw as any;
  if (data?.authoredBlind !== true) errors.push('authoredBlind must be true: only blind-authored templates belong in a blind variant');
  const p = data?.pools?.[pool];
  if (!p || typeof p !== 'object') return { errors: [...errors, `pools.${pool}: missing`] };
  for (const cat of BLIND_CATEGORIES) {
    const list = p[cat];
    if (!Array.isArray(list) || !list.length) { errors.push(`pools.${pool}.${cat}: at least one template`); continue; }
    list.forEach((t: any, i: number) => {
      const at = `pools.${pool}.${cat}[${i}]`;
      if (typeof t?.text !== 'string') return void errors.push(`${at}.text: a string`);
      const words = t.text.match(/[a-z0-9]+/gi)?.length ?? 0;
      if (words < MIN_WORDS) errors.push(`${at}: ${words} words, fewer than ${MIN_WORDS}`);
      // Only a bare {identifier} is a slot; adversarial texts legitimately contain JSON like {"qualified": true}.
      for (const [, slot] of t.text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g))
        if (!(SLOTS as readonly string[]).includes(slot)) errors.push(`${at}: unknown slot {${slot}} (known: ${SLOTS.join(', ')})`);
      if (cat === 'ambiguous' && typeof t.lean !== 'boolean') errors.push(`${at}.lean: true or false (the author's call; it becomes the planted label)`);
    });
  }
  return errors.length ? { errors } : { value: p as BlindPool, errors };
}

const runsOf = (text: string, n: number) => {
  const w = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
};

/** Pool templates that share an n-word run with another pool, by category and index (text only). */
export function sharedRuns(pool: BlindPool, other: BlindPool, n: number): Array<{ cat: BlindCategory; i: number }> {
  const seen = new Set(BLIND_CATEGORIES.flatMap(c => other[c].flatMap(t => [...runsOf(t.text, n)])));
  return BLIND_CATEGORIES.flatMap(cat => pool[cat].flatMap((t, i) => ([...runsOf(t.text, n)].some(r => seen.has(r)) ? [{ cat, i }] : [])));
}

export function loadPool(v: Variant): BlindPool {
  const { value, errors } = checkPool(readJson(corpusUrl(v.templates)), v.pool);
  if (errors.length) throw new Error(`${v.templates} pool ${v.pool} is invalid:\n  - ${errors.join('\n  - ')}`);
  const x = v.excludeRunsFrom;
  if (!x) return value!;
  const other = checkPool(readJson(corpusUrl(x.templates)), x.pool);
  if (other.errors.length) throw new Error(`excludeRunsFrom ${x.templates} pool ${x.pool} is invalid`);
  const drop = new Set(sharedRuns(value!, other.value!, x.runWords).map(d => `${d.cat}:${d.i}`));
  const kept = Object.fromEntries(BLIND_CATEGORIES.map(c => [c, value![c].filter((_, i) => !drop.has(`${c}:${i}`))])) as BlindPool;
  for (const c of BLIND_CATEGORIES) if (!kept[c].length) throw new Error(`excludeRunsFrom left pool ${v.pool} with no ${c} templates`);
  return kept;
}

export const render = (text: string, s: Slots) => text.replace(/\{(company|industry|employees|tool)\}/g, (_, k: keyof Slots) => s[k]);
