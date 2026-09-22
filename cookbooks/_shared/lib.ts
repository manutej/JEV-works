/**
 * cookbooks/_shared/lib.ts — what every cookbook's prepare.ts needs, and nothing else.
 *
 *   fetch   hfRows / hfAll / fetchText: public data only, cached under cookbooks/.cache (gitignored)
 *   sample  seeded shuffle + stratified pick, so a prepare.ts run is byte-for-byte reproducible
 *   clean   maskPrivate: emails and phone numbers are replaced BEFORE the kit's privacy scan sees them
 *   base    keywordBaseline: per-class keyword lists learned from the FIT split only, applied to test
 *   write   writeSpecs: spec.json (fit + test, split declared), spec.fit.json, spec.pilot.json
 *
 * No dependencies beyond node (v25 strips the types). Never prints secrets; never calls Jev.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { privacyScan, stateText } from '../../kit/checks.ts';
import type { Item, JsonValue, Label, Question } from '../../kit/spec.ts';

export const CACHE = join(import.meta.dirname, '..', '.cache');

// ---------------------------------------------------------------- fetch (cached)

async function cachedFetch(url: string, tries = 4): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const f = join(CACHE, createHash('sha1').update(url).digest('hex') + '.txt');
  if (existsSync(f)) return readFileSync(f, 'utf8');
  for (let t = 1; ; t++) {
    const r = await fetch(url);
    if (r.ok) { const body = await r.text(); writeFileSync(f, body); return body; }
    if (t >= tries) throw new Error(`fetch ${url}: HTTP ${r.status}`);
    await new Promise(res => setTimeout(res, 1500 * t));
  }
}

export const fetchText = cachedFetch;

/** Download a binary file once into the cache; returns its local path. */
export async function fetchFile(url: string, name: string): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const f = join(CACHE, name);
  if (existsSync(f)) return f;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: HTTP ${r.status}`);
  writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  return f;
}

/** One entry of a zip archive as text, via the system `unzip` (present on macOS and most Linux). */
export function unzipText(zipPath: string, entry: string): string {
  return execFileSync('unzip', ['-p', zipPath, entry], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/** Hugging Face datasets-server rows API: at most 100 rows per request. */
export async function hfRows(dataset: string, config: string, split: string, offset: number, length = 100): Promise<Record<string, JsonValue>[]> {
  const u = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}&offset=${offset}&length=${length}`;
  const j = JSON.parse(await cachedFetch(u));
  return (j.rows as { row: Record<string, JsonValue> }[]).map(r => r.row);
}

export async function hfNumRows(dataset: string, config: string, split: string): Promise<number> {
  const j = JSON.parse(await cachedFetch(`https://datasets-server.huggingface.co/size?dataset=${encodeURIComponent(dataset)}`));
  const s = (j.size.splits as { config: string; split: string; num_rows: number }[]).find(x => x.config === config && x.split === split);
  if (!s) throw new Error(`no split ${config}/${split} in ${dataset}`);
  return s.num_rows;
}

/** Every row of a split (fine up to ~20k rows: 200 cached requests). */
export async function hfAll(dataset: string, config: string, split: string, max = Infinity): Promise<Record<string, JsonValue>[]> {
  const n = Math.min(await hfNumRows(dataset, config, split), max);
  const out: Record<string, JsonValue>[] = [];
  for (let off = 0; off < n; off += 100) out.push(...await hfRows(dataset, config, split, off, Math.min(100, n - off)));
  return out;
}

/** Class-label names for a ClassLabel feature, from the rows API's `features` block. */
export async function hfLabelNames(dataset: string, config: string, split: string, feature: string): Promise<string[]> {
  const u = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}&offset=0&length=1`;
  const j = JSON.parse(await cachedFetch(u));
  const f = (j.features as { name: string; type: { names?: string[] } }[]).find(x => x.name === feature);
  if (!f?.type.names) throw new Error(`${feature} is not a ClassLabel in ${dataset}`);
  return f.type.names;
}

/** Minimal RFC-4180 CSV parser (quoted fields, embedded commas/newlines, "" escapes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.length > 1 || r[0]);
  return body.map(r => Object.fromEntries(head.map((h, k) => [h, r[k] ?? ''])));
}

// ---------------------------------------------------------------- seeded sampling

/** mulberry32: small, fast, and identical on every machine. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function shuffle<T>(xs: readonly T[], seed: number): T[] {
  const r = seeded(seed), a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Drop records whose normalised text repeats (keeps the first); the kit refuses fit/test text overlap (L40). */
export function dedupe<T>(xs: readonly T[], textOf: (x: T) => string): T[] {
  const seen = new Set<string>();
  return xs.filter(x => { const k = stateText(textOf(x)); if (seen.has(k)) return false; seen.add(k); return true; });
}

/**
 * Take `quota[label]` records per label from a pre-shuffled pool, in pool order.
 * Throws if a label runs short, so a quota can never be silently under-filled.
 */
export function stratified<T>(pool: readonly T[], labelOf: (x: T) => string, quota: Record<string, number>): T[] {
  const left = { ...quota }, out: T[] = [];
  for (const x of pool) { const l = labelOf(x); if ((left[l] ?? 0) > 0) { out.push(x); left[l]--; } }
  const short = Object.entries(left).filter(([, v]) => v > 0);
  if (short.length) throw new Error(`stratified: short on ${short.map(([k, v]) => `${k} (${v})`).join(', ')}`);
  return out;
}

// ---------------------------------------------------------------- privacy

/**
 * Replace emails and phone-like numbers with placeholders the model can still read as "a phone number".
 * Deliberately broader than the kit's scan (bare 10–13 digit runs too), then verified with the kit's own scan.
 */
export function maskPrivate(s: string): string {
  return s
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[phone number]')
    .replace(/(?<![\w.])\+?\d[\d\s-]{8,}\d(?![\w.])/g, m => (m.replace(/\D/g, '').length >= 10 ? '[phone number]' : m));
}

// ---------------------------------------------------------------- keyword baseline (fit split only)

const STOP = new Set('the and for you your are with this that have has was were but not all can our out get will from they them what when who how its it\'s just any one too also been than then there here into more some such only very about would could should which their his her she him yes now got use'.split(' '));

export function tokens(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z][a-z0-9'£$]{2,}|£\d+|\$\d+|\[phone number\]|\[email\]|https?:|www\./g) ?? []).filter(t => !STOP.has(t)));
}

export type KeywordModel = { name: string; majority: string; keywords: Record<string, string[]> };

/**
 * For each label, the `k` tokens with the highest smoothed log-odds of appearing in that label's fit texts vs the
 * rest (document frequency, add-one, min 2 fit documents). Predict the label whose keywords hit most; ties and
 * zero hits go to the fit majority. Deliberately simple: the point is a cheap, honest bar.
 */
export function keywordBaseline(fit: readonly { text: string; label: string }[], k = 8): KeywordModel & { predict: (text: string) => string } {
  const labels = [...new Set(fit.map(f => f.label))];
  const counts = new Map<string, number>(); for (const f of fit) counts.set(f.label, (counts.get(f.label) ?? 0) + 1);
  const majority = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const docs = fit.map(f => ({ label: f.label, toks: tokens(f.text) }));
  const vocab = new Set(docs.flatMap(d => [...d.toks]));
  const keywords: Record<string, string[]> = {};
  for (const l of labels) {
    const nIn = counts.get(l)!, nOut = fit.length - nIn;
    const scored: [string, number][] = [];
    for (const t of vocab) {
      const a = docs.filter(d => d.label === l && d.toks.has(t)).length;
      const b = docs.filter(d => d.label !== l && d.toks.has(t)).length;
      if (a < 2) continue;
      const lo = Math.log((a + 1) / (nIn - a + 1)) - Math.log((b + 1) / (nOut - b + 1));
      if (lo > 0) scored.push([t, lo]);
    }
    keywords[l] = scored.sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, k).map(x => x[0]);
  }
  const predict = (text: string) => {
    const toks = tokens(text);
    const hits = labels.map(l => [l, keywords[l].filter(w => toks.has(w)).length] as const);
    const best = Math.max(...hits.map(h => h[1]));
    if (best === 0) return majority;
    const top = hits.filter(h => h[1] === best).map(h => h[0]);
    return top.includes(majority) ? majority : top.sort()[0];
  };
  return { name: `keyword lists (top ${k} per class by log-odds, fit split only)`, majority, keywords, predict };
}

// ---------------------------------------------------------------- write the three specs

export type Built = { id: string; state: JsonValue; labels: Record<string, Label>; baseline?: Record<string, Label>; split: 'fit' | 'test'; meta?: Record<string, JsonValue> };

/**
 * spec.json        every item, split declared (fit | test), labels, baseline on test items: the labelled test run
 * spec.fit.json    fit items only, no split, no baseline: Jev's answers on these are what thresholds are fitted on
 * spec.pilot.json  the first `pilot` fit items, labels stripped: the label-free question-quality pass
 * items.meta.json  per-item source fields (row index, original label) for the cookbook; never sent to Jev
 */
export function writeSpecs(dir: string, o: {
  name: string; description: string; questions: Record<string, Question>; items: Built[];
  baselineName: string; pilot?: number; minCoverage?: number;
}): void {
  const hits = privacyScan(o.items as Item[]);
  if (hits.length) throw new Error(`privacy scan still hits after masking: ${hits.slice(0, 5).map(h => `${h.itemId}:${h.kind}`).join(', ')}`);
  const strip = (it: Built, keep: ('labels' | 'baseline' | 'split')[]): Item => {
    const x: Item = { id: it.id, state: it.state };
    if (keep.includes('split')) x.split = it.split;
    if (keep.includes('labels')) x.labels = it.labels;
    if (keep.includes('baseline') && it.baseline) x.baseline = it.baseline;
    return x;
  };
  const base = { $schema: '../../kit/spec.schema.json', questions: o.questions, gate: { minCoverage: o.minCoverage ?? 0.95 } };
  const fit = o.items.filter(i => i.split === 'fit'), test = o.items.filter(i => i.split === 'test');
  const w = (f: string, v: unknown) => writeFileSync(join(dir, f), JSON.stringify(v, null, 1) + '\n');
  w('spec.json', { $schema: base.$schema, name: o.name, description: o.description, baselineName: o.baselineName, gate: base.gate, questions: o.questions,
    items: [...fit.map(i => strip(i, ['split', 'labels'])), ...test.map(i => strip(i, ['split', 'labels', 'baseline']))] });
  w('spec.fit.json', { $schema: base.$schema, name: `${o.name}-fit`, description: `FIT split only (${fit.length} items): Jev's answers here are what every threshold is fitted on. ${o.description}`, gate: base.gate, questions: o.questions,
    items: fit.map(i => strip(i, ['labels'])) });
  w('spec.pilot.json', { $schema: base.$schema, name: `${o.name}-pilot`, description: `Label-free question-quality pass on the first ${o.pilot ?? 30} fit items.`, questions: o.questions,
    items: fit.slice(0, o.pilot ?? 30).map(i => strip(i, [])) });
  w('items.meta.json', o.items.map(i => ({ id: i.id, split: i.split, labels: i.labels, baseline: i.baseline, ...(i.meta ?? {}) })));
  console.log(`wrote ${dir}/spec.json (fit ${fit.length}, test ${test.length}), spec.fit.json, spec.pilot.json, items.meta.json`);
}

/** Print label counts per split, so every prepare.ts run shows its class balance. */
export function report(items: readonly Built[], q: string): void {
  for (const s of ['fit', 'test'] as const) {
    const c: Record<string, number> = {};
    for (const i of items.filter(x => x.split === s)) c[String(i.labels[q])] = (c[String(i.labels[q])] ?? 0) + 1;
    console.log(`${s}: ${JSON.stringify(c)}`);
  }
}
