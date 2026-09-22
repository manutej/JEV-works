/**
 * The boundary: every JSON file kit/gate reads is parsed and validated here, all errors at once,
 * and nowhere else. Past this point the decider, policy and claim gate trust their types.
 *
 *   loadDecision('spec/decision.json')   loadPolicy('spec/policy.json')   loadGateConfig('gate.json')
 */
import { readFileSync } from 'node:fs';
import type { Answer, Cond, Decision, Verdict } from './decide.ts';
import type { ScoringPolicy } from './policy.ts';
import type { GateConfig } from './claim.ts';

type Check<T> = (x: unknown, at: string) => { value?: T; errors: string[] };
const isObj = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isVerdict = (x: unknown): x is Verdict => x === true || x === false || x === 'escalate';
const isProb = (x: unknown): x is number => typeof x === 'number' && x >= 0 && x <= 1;

function checkCond(c: unknown, at: string, errors: string[], questions?: ReadonlySet<string>): void {
  if (!isObj(c)) return void errors.push(`${at}: a condition must be an object`);
  const keys = Object.keys(c);
  if ('all' in c || 'any' in c) {
    const k = 'all' in c ? 'all' : 'any';
    if (!Array.isArray(c[k]) || !c[k].length) return void errors.push(`${at}.${k}: a non-empty list of conditions`);
    return void c[k].forEach((x: unknown, i: number) => checkCond(x, `${at}.${k}[${i}]`, errors, questions));
  }
  if ('not' in c) return checkCond(c.not, `${at}.not`, errors, questions);
  if (typeof c.q !== 'string') return void errors.push(`${at}: needs all, any, not, or q (got keys: ${keys.join(', ') || 'none'})`);
  if (questions && !questions.has(c.q)) errors.push(`${at}.q: "${c.q}" is not a question in this experiment`);
  const ops = ['is', 'choice', 'choiceIn', 'scoreAtLeast', 'entropyAbove'].filter(k => k in c);
  if (ops.length !== 1) return void errors.push(`${at}: exactly one of is, choice, choiceIn, scoreAtLeast, entropyAbove (got ${ops.join(', ') || 'none'})`);
  const op = ops[0];
  if (op === 'is' && !['yes', 'no', 'unsure'].includes(c.is)) errors.push(`${at}.is: yes, no or unsure`);
  if (op === 'choice' && typeof c.choice !== 'string') errors.push(`${at}.choice: an option name`);
  if (op === 'choiceIn' && (!Array.isArray(c.choiceIn) || !c.choiceIn.length || !c.choiceIn.every((x: unknown) => typeof x === 'string')))
    errors.push(`${at}.choiceIn: a non-empty list of option names`);
  if (op === 'scoreAtLeast' && typeof c.scoreAtLeast !== 'number') errors.push(`${at}.scoreAtLeast: a number`);
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

/** Answers from a run: a map question id -> SDK answer. Malformed answers are rejected, not read as unknown. */
export function checkAnswers(x: unknown, at = 'answers'): { value?: Record<string, Answer>; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(x)) return { errors: [`${at}: must be an object of question id -> answer`] };
  for (const [id, a] of Object.entries(x)) {
    const here = `${at}.${id}`;
    if (!isObj(a)) { errors.push(`${here}: must be an object`); continue; }
    if (a.type === 'boolean') { if (!isProb(a.probability)) errors.push(`${here}.probability: in [0, 1]`); }
    else if (a.type === 'choice') { if (typeof a.choice !== 'string') errors.push(`${here}.choice: an option name`); }
    else if (a.type === 'score') { if (typeof a.score !== 'number') errors.push(`${here}.score: a number`); }
    else errors.push(`${here}.type: boolean, choice or score (SDK names; the docs' "noul" arrives as boolean)`);
  }
  return errors.length ? { errors } : { value: x as Record<string, Answer>, errors };
}

function load<T>(path: string, check: (x: unknown, at: string) => { value?: T; errors: string[] }): T {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (cause) {
    throw new Error(`${path}: not readable JSON`, { cause });
  }
  const { value, errors } = check(raw, path);
  if (errors.length) throw new Error(`${path} is invalid:\n  - ${errors.join('\n  - ')}`);
  return value as T;
}

export const loadDecision = (path: string, questions?: ReadonlySet<string>) => load(path, (x, at) => checkDecision(x, at, questions));
export const loadPolicy = (path: string) => load(path, checkPolicy);
export const loadGateConfig = (path: string) => load(path, checkGateConfig);
