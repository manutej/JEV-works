/**
 * The kit's input: one JSON spec in TypeSafe's documented question shape, plus the items to ask about.
 *
 *   questions  — exactly the `questions` object of POST /v1/systemone (docs.typesafe.ai):
 *                { id: { type: "noul" | "choice" | "score", instructions, criteria? } }
 *                "boolean" (the AI SDK's name for noul) is accepted and normalised.
 *   items      — [{ id, state, labels?, baseline?, split? }]  or  itemsFile (a JSON array, path relative to the spec)
 *
 * Everything else is optional. Validation is strict and runs before any call: a spec that would waste calls
 * or silently mis-score is rejected with every problem listed, not just the first.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type NoulQuestion = { type: 'noul'; instructions: JsonValue; criteria?: { true?: JsonValue; false?: JsonValue } };
export type ChoiceQuestion = { type: 'choice'; instructions: JsonValue; criteria: Record<string, JsonValue | null> };
export type ScoreQuestion = { type: 'score'; instructions: JsonValue; criteria: (JsonValue | null)[] };
export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

/** A label is what the answer should be: boolean for noul, an option key for choice, a level index for score. */
export type Label = boolean | string | number;

export type Item = {
  id: string;
  state: JsonValue;
  /** Ground truth per question id. Items without labels are used only for label-free checks. */
  labels?: Record<string, Label>;
  /** A cheap baseline's prediction per question id, computed elsewhere (regex, naive Bayes, a rule). */
  baseline?: Record<string, Label>;
  /** Declared before the run. Only `test` items are scored; `fit` items are checked for overlap with them. */
  split?: 'fit' | 'test';
};

export type Spec = {
  name: string;
  description?: string;
  /** Model id on the chosen backend; default is lib/jev.ts's pinned jev-1.13.0. */
  model?: string;
  questions: Record<string, Question>;
  items: Item[];
  /** Name of the baseline, for reports ("keyword regex", "naive Bayes"). */
  baselineName?: string;
  gate?: { minCoverage?: number };
  /**
   * Decision rules over the answers ({positive, thresholds?, rules, default}). Owned and validated by
   * kit/gate/decide.ts (leads session); the core passes it through untouched and never interprets it.
   */
  decision?: JsonValue;
  /** States go to TypeSafe's API. The privacy scan runs unless this is explicitly false. */
  privacyScan?: boolean;
};

type RawSpec = Omit<Spec, 'items'> & { items?: Item[]; itemsFile?: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Collect every problem; an empty array means valid. Exported for tests. */
export function problems(raw: unknown): string[] {
  const out: string[] = [];
  if (!isObj(raw)) return ['spec must be a JSON object'];
  if (typeof raw.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(raw.name)) out.push('name: required, lowercase-kebab (it names the result file)');
  if (!isObj(raw.questions) || Object.keys(raw.questions).length === 0) out.push('questions: required, a non-empty object keyed by question id');
  else {
    for (const [id, q] of Object.entries(raw.questions)) {
      if (!isObj(q)) { out.push(`questions.${id}: must be an object`); continue; }
      const t = q.type === 'boolean' ? 'noul' : q.type;
      if (t !== 'noul' && t !== 'choice' && t !== 'score') out.push(`questions.${id}.type: "${String(q.type)}" is not noul | choice | score`);
      if (q.instructions === undefined || q.instructions === '') out.push(`questions.${id}.instructions: required`);
      if (t === 'choice') {
        if (!isObj(q.criteria) || Object.keys(q.criteria).length < 2) out.push(`questions.${id}.criteria: a choice needs an object with ≥ 2 options`);
        else if (Object.keys(q.criteria).length > 255) out.push(`questions.${id}.criteria: TypeSafe caps a choice at 255 options (P16)`);
      }
      if (t === 'score' && (!Array.isArray(q.criteria) || q.criteria.length < 2)) out.push(`questions.${id}.criteria: a score needs an array of ≥ 2 ordered levels`);
      if (t === 'noul' && q.criteria !== undefined && !isObj(q.criteria)) out.push(`questions.${id}.criteria: a noul's criteria is {true?, false?}`);
    }
  }
  const hasItems = Array.isArray(raw.items), hasFile = typeof raw.itemsFile === 'string';
  if (hasItems === hasFile) out.push('items: give exactly one of `items` (array) or `itemsFile` (path)');
  return out;
}

/** Item-level checks, run after itemsFile is resolved. */
export function itemProblems(spec: Spec): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  spec.items.forEach((it, i) => {
    const at = `items[${i}]`;
    if (typeof it.id !== 'string' || !it.id) out.push(`${at}.id: required string`);
    else if (seen.has(it.id)) out.push(`${at}.id: duplicate "${it.id}"`);
    else seen.add(it.id);
    if (it.state === undefined) out.push(`${at}.state: required`);
    if (it.split !== undefined && it.split !== 'fit' && it.split !== 'test') out.push(`${at}.split: must be fit | test`);
    for (const field of ['labels', 'baseline'] as const) {
      for (const [qid, v] of Object.entries(it[field] ?? {})) {
        const q = spec.questions[qid];
        if (!q) { out.push(`${at}.${field}.${qid}: no such question`); continue; }
        if (q.type === 'noul' && typeof v !== 'boolean') out.push(`${at}.${field}.${qid}: noul label must be true/false`);
        if (q.type === 'choice' && !(typeof v === 'string' && v in q.criteria)) out.push(`${at}.${field}.${qid}: "${String(v)}" is not an option of this choice`);
        if (q.type === 'score' && !(Number.isInteger(v) && (v as number) >= 0 && (v as number) < q.criteria.length)) out.push(`${at}.${field}.${qid}: score label must be a level index 0..${q.criteria.length - 1}`);
      }
    }
  });
  return out;
}

/** Normalise SDK-style `boolean` to TypeSafe-native `noul`, so one spec reads the same as the docs. */
function normalise(qs: Record<string, Question & { type: string }>): Record<string, Question> {
  return Object.fromEntries(Object.entries(qs).map(([id, q]) => [id, ((q as { type: string }).type === 'boolean' ? { ...(q as object), type: 'noul' } : q) as Question]));
}

export function parseSpec(raw: unknown, baseDir = '.'): Spec {
  const errs = problems(raw);
  if (errs.length) throw new Error(`invalid spec:\n  - ${errs.join('\n  - ')}`);
  const r = raw as RawSpec;
  const items = r.items ?? (JSON.parse(readFileSync(resolve(baseDir, r.itemsFile!), 'utf8')) as Item[]);
  const spec: Spec = { ...r, questions: normalise(r.questions as never), items };
  delete (spec as Partial<RawSpec>).itemsFile;
  const itemErrs = itemProblems(spec);
  if (itemErrs.length) throw new Error(`invalid items:\n  - ${itemErrs.slice(0, 25).join('\n  - ')}${itemErrs.length > 25 ? `\n  … ${itemErrs.length - 25} more` : ''}`);
  return spec;
}

export function loadSpec(path: string): Spec {
  return parseSpec(JSON.parse(readFileSync(path, 'utf8')), dirname(resolve(path)));
}

/** The AI SDK names noul `boolean`; this is the only place that translation happens. */
export function toSdkQuestions(qs: Record<string, Question>) {
  return Object.fromEntries(Object.entries(qs).map(([id, q]) => [id, q.type === 'noul' ? { ...q, type: 'boolean' } : q])) as never;
}
