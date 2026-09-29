/**
 * QUESTION MODULES — the types, and the meta-type every question must satisfy before it is used.
 *
 *   Context  a place questions are asked (a craft skill, a domain): the artifact it reads + modules
 *   Module   one concern inside a context: typed questions + a compose rule (a kit/gate Decision)
 *            + the judgements it hands to code instead of asking (notForJev)
 *   Atom     one question in the TypeSafe docs' shape, plus what the meta-type needs to check it
 *
 * The meta-type is this lab's measured lessons as lint rules (all problems at once). A question that
 * fails it is not asked: it would waste calls or, worse, return confident answers that mean nothing.
 *   M1 typed · M2 literal (P18/P21) · M3 one question · M4 polarity (I4) · M5 declared reads
 *   M6 decisive ends (P5/P6) · M7 escape option for choices (support-routing demo)
 */
import { problems as coreProblems, type Question } from '../spec.ts';
import { checkDecision } from '../gate/load.ts';
import type { Decision } from '../gate/decide.ts';

export type Polarity = 'good-when-yes' | 'bad-when-yes' | 'higher-is-better' | 'lower-is-better' | 'neutral';
/**
 * `lintExceptions` waives a named rule for this atom only, with a reason a reviewer can check,
 * e.g. { "M2-literal": "asks whether THIS message compares us; not a comparison across records" }.
 * A waived rule still reports, as a warning that quotes the reason. Never waives M1 (validity).
 */
export type Atom = Question & { polarity: Polarity; reads: string[]; escapeOption?: string; note?: string; lintExceptions?: Record<string, string> };
export type Module = {
  name: string;
  purpose: string;
  questions: Record<string, Atom>;
  compose: Decision;
  notForJev?: Array<{ judgement: string; instead: string }>;
};
export type Context = {
  name: string;
  description: string;
  artifact: { type: string; stateFields: string[] };
  modules: Module[];
};
export type Finding = { rule: string; severity: 'error' | 'warn'; at: string; message: string };

/**
 * Words that make a question non-literal: comparing, counting, ranking, or reaching outside the one
 * record (P18, P21). Configurable so a context can extend it; the default is the lab's list.
 */
export const DEFAULT_NON_LITERAL = /\b(compare[sd]?|comparison|than (the )?(other|previous|last|usual)|other (leads?|items?|records?|files?|messages?)|how many|count(s|ing)?|number of|rank(ed|ing)?|better than|worse than|more than the|most of the|typical(ly)?|on average|usually)\b/i;

const POLARITY_BY_TYPE: Record<Question['type'], Polarity[]> = {
  noul: ['good-when-yes', 'bad-when-yes', 'neutral'],
  score: ['higher-is-better', 'lower-is-better', 'neutral'],
  choice: ['neutral'],
};

export function lintAtom(id: string, a: Atom, artifactFields: readonly string[], at: string, nonLiteral = DEFAULT_NON_LITERAL): Finding[] {
  const f: Finding[] = [];
  const waived = (rule: string) => rule !== 'M1-typed' && typeof a.lintExceptions?.[rule] === 'string' && a.lintExceptions[rule].trim().length > 0;
  const err = (rule: string, message: string) =>
    f.push(waived(rule)
      ? { rule, severity: 'warn', at, message: `waived (${a.lintExceptions![rule]}): ${message}` }
      : { rule, severity: 'error', at, message });
  const warn = (rule: string, message: string) => f.push({ rule, severity: 'warn', at, message });

  // M1: the core's own validator, on a one-question spec, so there is one definition of "valid question".
  const { polarity, reads, escapeOption, note, lintExceptions, ...question } = a;
  for (const p of coreProblems({ name: 'meta-type-probe', questions: { [id]: question }, items: [{ id: 'probe', state: {} }] }))
    if (!p.startsWith('items')) err('M1-typed', p.replace(/^questions\.[^:.]*[.:]?\s*/, ''));

  const text = typeof a.instructions === 'string' ? a.instructions : JSON.stringify(a.instructions);
  const hit = text.match(nonLiteral);
  if (hit) err('M2-literal', `"${hit[0]}" asks for a comparison, count, ranking or another record; one record cannot answer it (P18/P21). Move it to code (notForJev).`);
  const qmarks = (text.match(/\?/g) ?? []).length;
  if (qmarks !== 1) err('M3-one-question', `instructions should be exactly one question ending in "?" (found ${qmarks})`);
  if (/\band\/or\b/i.test(text)) warn('M3-one-question', '"and/or" usually hides two questions; split it');

  if (!POLARITY_BY_TYPE[a.type]?.includes(polarity))
    err('M4-polarity', `polarity for a ${a.type} must be one of ${POLARITY_BY_TYPE[a.type]?.join(', ')}`);

  if (!Array.isArray(reads) || !reads.length) err('M5-reads', 'declare which artifact fields answer this question');
  else for (const r of reads) if (!artifactFields.includes(r)) err('M5-reads', `reads "${r}", which the artifact does not have (${artifactFields.join(', ')})`);

  if (a.type === 'noul' && (!a.criteria || a.criteria.true === undefined || a.criteria.false === undefined))
    warn('M6-decisive-ends', 'say what yes and what no each mean (criteria.true and criteria.false); undefined ends drift to mid-band');
  if (a.type === 'choice') {
    if (!escapeOption) warn('M7-escape', 'name the option for inputs with no right answer (escapeOption); without one, noise gets confident wrong answers');
    else if (!(escapeOption in (a.criteria ?? {}))) err('M7-escape', `escapeOption "${escapeOption}" is not one of the options`);
  }
  return f;
}

export function lintContext(c: Context, nonLiteral = DEFAULT_NON_LITERAL): Finding[] {
  const f: Finding[] = [];
  const err = (at: string, rule: string, message: string) => f.push({ rule, severity: 'error', at, message });
  if (!/^[a-z0-9][a-z0-9:.-]*$/.test(c.name ?? '')) err('context', 'C-name', 'name: lowercase, digits, ":", ".", "-"');
  if (!c.artifact?.type || !Array.isArray(c.artifact.stateFields) || !c.artifact.stateFields.length)
    err('context.artifact', 'C-artifact', 'declare the artifact type and the stateFields sent to the model');
  if (!Array.isArray(c.modules) || !c.modules.length) return [...f, { rule: 'C-modules', severity: 'error', at: 'context', message: 'at least one module' }];

  const seen = new Map<string, string>();
  c.modules.forEach((m, mi) => {
    const at = `modules[${mi}:${m.name}]`;
    if (!m.purpose) err(at, 'C-purpose', 'say what concern this module checks');
    const ids = Object.keys(m.questions ?? {});
    if (!ids.length) err(at, 'C-questions', 'at least one question');
    for (const id of ids) {
      if (seen.has(id)) err(`${at}.${id}`, 'C-unique', `question id also used in module ${seen.get(id)}; ids must be unique across a context`);
      seen.set(id, m.name);
      f.push(...lintAtom(id, m.questions[id], c.artifact?.stateFields ?? [], `${at}.${id}`, nonLiteral));
    }
    for (const e of checkDecision(m.compose, `${at}.compose`, new Set(ids)).errors) err(`${at}.compose`, 'C-compose', e);
  });
  return f;
}

export const errorsOf = (f: Finding[]) => f.filter(x => x.severity === 'error');
