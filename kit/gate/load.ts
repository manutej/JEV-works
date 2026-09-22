/**
 * The boundary: every JSON file kit/gate reads is parsed and validated here, all errors at once,
 * and nowhere else. Past this point the decider, policy and claim gate trust their types.
 *
 *   loadDecision('spec/decision.json')   loadPolicy('spec/policy.json')   loadGateConfig('gate.json')
 */
import { readFileSync } from 'node:fs';
import type { Answer, Cond, Decision, Verdict } from './decide.ts';
import type { ScoringPolicy } from './policy.ts';
import type { GateConfig, GateInput } from './claim.ts';

type Check<T> = (x: unknown, at: string) => { value?: T; errors: string[] };
const isObj = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isVerdict = (x: unknown): x is Verdict => x === true || x === false || x === 'escalate';
const isProb = (x: unknown): x is number => typeof x === 'number' && x >= 0 && x <= 1;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** Deeper than any real rule; bounds recursion so hostile JSON reports an error instead of a RangeError. */
export const MAX_COND_DEPTH = 32;
/** Ids that would collide with object internals ({}.__proto__ is not an own key). Rejected, not dropped. */
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const checkDist = (d: unknown) => d === undefined || (isObj(d) && Object.values(d).every(isProb));

function checkCond(c: unknown, at: string, errors: string[], questions?: ReadonlySet<string>, depth = 0): void {
  if (depth > MAX_COND_DEPTH) return void errors.push(`${at}: conditions nested deeper than ${MAX_COND_DEPTH}`);
  if (!isObj(c)) return void errors.push(`${at}: a condition must be an object`);
  const keys = Object.keys(c);
  if ('all' in c || 'any' in c) {
    const k = 'all' in c ? 'all' : 'any';
    if (!Array.isArray(c[k]) || !c[k].length) return void errors.push(`${at}.${k}: a non-empty list of conditions`);
    return void c[k].forEach((x: unknown, i: number) => checkCond(x, `${at}.${k}[${i}]`, errors, questions, depth + 1));
  }
  if ('not' in c) return checkCond(c.not, `${at}.not`, errors, questions, depth + 1);
  if (typeof c.q !== 'string') return void errors.push(`${at}: needs all, any, not, or q (got keys: ${keys.join(', ') || 'none'})`);
  if (questions && !questions.has(c.q)) errors.push(`${at}.q: "${c.q}" is not a question in this experiment`);
  const ops = ['is', 'choice', 'choiceIn', 'scoreAtLeast', 'entropyAbove'].filter(k => k in c);
  if (ops.length !== 1) return void errors.push(`${at}: exactly one of is, choice, choiceIn, scoreAtLeast, entropyAbove (got ${ops.join(', ') || 'none'})`);
  const op = ops[0];
  if (op === 'is' && !['yes', 'no', 'unsure'].includes(c.is)) errors.push(`${at}.is: yes, no or unsure`);
  if (op === 'choice' && typeof c.choice !== 'string') errors.push(`${at}.choice: an option name`);
  if (op === 'choiceIn' && (!Array.isArray(c.choiceIn) || !c.choiceIn.length || !c.choiceIn.every((x: unknown) => typeof x === 'string')))
    errors.push(`${at}.choiceIn: a non-empty list of option names`);
  if (op === 'scoreAtLeast' && !isNum(c.scoreAtLeast)) errors.push(`${at}.scoreAtLeast: a finite number`);
  if (op === 'entropyAbove' && !isProb(c.entropyAbove)) errors.push(`${at}.entropyAbove: a number in [0, 1]`);
}

/** `questions`, when given, lets the checker reject a rule that names a question the experiment lacks. */
export function checkDecision(x: unknown, at = 'decision', questions?: ReadonlySet<string>): { value?: Decision; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(x)) return { errors: [`${at}: must be an object`] };
  if (typeof x.positive !== 'string' || !x.positive.trim()) errors.push(`${at}.positive: say in words what a true verdict means`);
  if (x.thresholds !== undefined) {
    const t = x.thresholds;
    if (!isObj(t) || !isProb(t.yes) || !isProb(t.no) || !(t.no < t.yes)) errors.push(`${at}.thresholds: {yes, no} in [0, 1] with no < yes`);
  }
  if (!Array.isArray(x.rules) || !x.rules.length) errors.push(`${at}.rules: at least one rule`);
  else x.rules.forEach((r: any, i: number) => {
    if (!isObj(r)) return void errors.push(`${at}.rules[${i}]: {when, then}`);
    checkCond(r.when, `${at}.rules[${i}].when`, errors, questions);
    if (!isVerdict(r.then)) errors.push(`${at}.rules[${i}].then: true, false or "escalate"`);
  });
  if (!isVerdict(x.default)) errors.push(`${at}.default: true, false or "escalate"`);
  return errors.length ? { errors } : { value: x as Decision, errors };
}

export const checkPolicy: Check<ScoringPolicy> = (x, at = 'policy') => {
  const errors: string[] = [];
  if (!isObj(x)) return { errors: [`${at}: must be an object`] };
  if (typeof x.version !== 'string' || !x.version) errors.push(`${at}.version: a name, e.g. "v2"`);
  if (typeof x.declaredBeforeData !== 'boolean') errors.push(`${at}.declaredBeforeData: true or false (was it written before any result it changes was seen?)`);
  const w = x.escalationCorrectWhen;
  if (w !== undefined && (!isObj(w) || typeof w.field !== 'string' || !Array.isArray(w.values) || !w.values.length))
    errors.push(`${at}.escalationCorrectWhen: {field, values: [non-empty]}`);
  return errors.length ? { errors } : { value: x as ScoringPolicy, errors };
};

export const checkGateConfig: Check<Partial<GateConfig>> = (x, at = 'gate') => {
  const errors: string[] = [];
  if (!isObj(x)) return { errors: [`${at}: must be an object`] };
  const known = ['alpha', 'minStratum', 'seenShareLimit'];
  for (const k of Object.keys(x)) if (!known.includes(k)) errors.push(`${at}.${k}: unknown setting (known: ${known.join(', ')})`);
  if (x.alpha !== undefined && !(isProb(x.alpha) && x.alpha > 0)) errors.push(`${at}.alpha: in (0, 1]`);
  if (x.minStratum !== undefined && !(Number.isInteger(x.minStratum) && x.minStratum >= 1)) errors.push(`${at}.minStratum: a positive integer`);
  if (x.seenShareLimit !== undefined && !isProb(x.seenShareLimit)) errors.push(`${at}.seenShareLimit: in [0, 1]`);
  return errors.length ? { errors } : { value: x as Partial<GateConfig>, errors };
};

/**
 * Answers from a run: a map question id -> answer, in either shape the kit produces, converted to
 * one internal shape here and nowhere else: the SDK's ({type:'boolean', probability}) or kit/run.ts
 * results' ({type:'noul', p}). Malformed answers are rejected, not read as unknown.
 */
export function checkAnswers(x: unknown, at = 'answers'): { value?: Record<string, Answer>; errors: string[] } {
  const errors: string[] = [];
  const out: Record<string, Answer> = {}; // safe: reserved ids (__proto__ …) are rejected before any write
  if (!isObj(x)) return { errors: [`${at}: must be an object of question id -> answer`] };
  for (const [id, a] of Object.entries(x)) {
    const here = `${at}.${id}`;
    if (RESERVED_IDS.has(id)) { errors.push(`${here}: reserved name, not allowed as a question id`); continue; }
    if (!isObj(a)) { errors.push(`${here}: must be an object`); continue; }
    if (!checkDist(a.probabilities)) { errors.push(`${here}.probabilities: an object of option -> probability in [0, 1]`); continue; }
    if (a.type === 'boolean' || a.type === 'noul') {
      const p = a.type === 'boolean' ? a.probability : a.p;
      if (!isProb(p)) errors.push(`${here}.${a.type === 'boolean' ? 'probability' : 'p'}: in [0, 1]`);
      else out[id] = { type: 'boolean', probability: p };
    } else if (a.type === 'choice') {
      if (typeof a.choice !== 'string') errors.push(`${here}.choice: an option name`);
      else out[id] = { type: 'choice', choice: a.choice, probabilities: a.probabilities };
    } else if (a.type === 'score') {
      if (!isNum(a.score)) errors.push(`${here}.score: a finite number (NaN would read as a confident false)`);
      else out[id] = { type: 'score', score: a.score, probabilities: a.probabilities };
    } else errors.push(`${here}.type: noul (or the SDK's boolean), choice or score`);
  }
  return errors.length ? { errors } : { value: out, errors };
}

const isPaired = (p: any) => isObj(p) && typeof p.name === 'string' && [p.n, p.b, p.c].every(v => Number.isInteger(v) && v >= 0) && p.b + p.c <= p.n;

/** The claim gate's input: every field it reads, checked, so a bad report cannot flip ACCEPT/REFUSE. */
export function checkGateInput(x: unknown, at = 'gateInput'): { value?: GateInput; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(x)) return { errors: [`${at}: must be an object`] };
  if (typeof x.seed !== 'string' || !x.seed) errors.push(`${at}.seed: a non-empty string`);
  if (!['dev', 'holdout'].includes(x.role)) errors.push(`${at}.role: dev or holdout`);
  if (x.claimScope !== undefined && !['all', 'new_records', 'novel_wording'].includes(x.claimScope)) errors.push(`${at}.claimScope: all, new_records or novel_wording`);
  if (x.leakageAccepted !== undefined && typeof x.leakageAccepted !== 'boolean') errors.push(`${at}.leakageAccepted: true or false`);
  for (const k of ['seenShare', 'coverage']) if (!isProb(x[k])) errors.push(`${at}.${k}: in [0, 1]`);
  if (x.minCoverage !== undefined && !isProb(x.minCoverage)) errors.push(`${at}.minCoverage: in [0, 1]`);
  if (typeof x.policy !== 'string' || !x.policy) errors.push(`${at}.policy: a version name`);
  if (typeof x.policyDeclaredBeforeSeed !== 'boolean') errors.push(`${at}.policyDeclaredBeforeSeed: true or false`);
  if (!isPaired(x.headline)) errors.push(`${at}.headline: {name, n, b, c} with non-negative integers and b + c <= n`);
  for (const k of ['seen', 'novel']) if (x[k] !== undefined && !isPaired(x[k])) errors.push(`${at}.${k}: {name, n, b, c}`);
  if (!Array.isArray(x.categories) || !x.categories.every(isPaired)) errors.push(`${at}.categories: a list of {name, n, b, c}`);
  return errors.length ? { errors } : { value: x as GateInput, errors };
}

function load<T>(path: string, check: (x: unknown, at: string) => { value?: T; errors: string[] }): T {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (cause) {
    throw new Error(`${path}: not readable JSON`, { cause });
  }
  const { value, errors } = check(raw, path); // validators bound their own recursion (MAX_COND_DEPTH)
  if (errors.length) throw new Error(`${path} is invalid:\n  - ${errors.join('\n  - ')}`);
  return value as T;
}

export const loadDecision = (path: string, questions?: ReadonlySet<string>) => load(path, (x, at) => checkDecision(x, at, questions));
export const loadPolicy = (path: string) => load(path, checkPolicy);
export const loadGateConfig = (path: string) => load(path, checkGateConfig);
