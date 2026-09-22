/**
 * One-time migration: question-bank/bank.ts QuestionSets → kit/modules Context files (kit/SCOPE.md, approved 2026-09-22).
 *
 *   node program/migrate-bank.ts            → writes kit/modules/contexts/bank.<set>.json (new files only; refuses to overwrite)
 *
 * Faithful, not improved: question text, criteria, notForJev and status are copied verbatim. What bank.ts never recorded
 * is NOT invented:
 *   - polarity → 'neutral' with a note ("declare before use"), since guessing is-yes-good for 40 questions is unmeasured
 *   - reads    → ['state'] (bank.ts states are whole records; field-level reads were never declared)
 *   - compose  → bank.ts `recombine` is prose, and translating it would change behaviour without a re-freeze and re-gate, so
 *                the module escalates EVERYTHING until someone writes the rule, and the prose is kept in `purpose`
 * Template sets (a choice whose options are supplied per use, e.g. CLASSIFICATION) are skipped: a context needs concrete options.
 * bank.ts stays as read-only history: NETER/LESSONS cite it.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as bank from '../question-bank/bank.ts';

type QS = { context: string; produces: string; questions: Record<string, { type: string; instructions: unknown; criteria?: unknown }>; notForJev: { judgement: string; instead: string }[]; recombine: string; status: string };
const ESCAPES = ['none', 'other', 'unrelated', 'unknown', 'not_applicable', 'neither'];
const slug = (s: string) => s.toLowerCase().replace(/_/g, '-');

const sets = Object.entries(bank).filter(([, v]) => v && typeof v === 'object' && 'questions' in (v as object) && 'recombine' in (v as object)) as [string, QS][];
const out = join(import.meta.dirname, '..', 'kit', 'modules', 'contexts');
let written = 0;
for (const [name, set] of sets) {
  // A TEMPLATE set (a choice with no options, filled in per use, e.g. CLASSIFICATION) is not a context: a context needs
  // concrete options (lint M1). Templates are hydrated per use; migrating one would mean inventing options.
  const template = Object.values(set.questions).some(q => q.type === 'choice' && (!q.criteria || Object.keys(q.criteria as object).length < 2));
  if (template) { console.log(`skip ${name}: template set (choice options supplied per use), not migrated`); continue; }
  const questions: Record<string, unknown> = {};
  for (const [id, q] of Object.entries(set.questions)) {
    const type = q.type === 'boolean' ? 'noul' : q.type;
    const escape = type === 'choice' ? ESCAPES.find(k => k in (q.criteria as object)) : undefined;
    questions[id] = {
      ...q, type, polarity: 'neutral', reads: ['state'],
      ...(escape ? { escapeOption: escape } : {}),
      note: 'migrated verbatim from question-bank/bank.ts; polarity not declared there, so declare it before use',
    };
  }
  const first = Object.entries(questions)[0] as [string, { type: string; criteria?: unknown }];
  const cond = first[1].type === 'noul' ? { q: first[0], is: 'unsure' }
    : first[1].type === 'choice' ? { q: first[0], choiceIn: Object.keys(first[1].criteria as object) }
    : { q: first[0], scoreAtLeast: 0 };
  const context = {
    name: `bank.${slug(name)}`,
    description: `${set.context} Produces: ${set.produces} Status in bank.ts: ${set.status}. Migrated verbatim from question-bank/bank.ts (${name}) on 2026-09-22.`,
    artifact: { type: set.context.split(/[—.:]/)[0].trim().toLowerCase(), stateFields: ['state'] },
    modules: [{
      name: slug(name),
      purpose: `${set.context} Original recombine rule (prose, not yet a decision rule): ${set.recombine}`,
      questions,
      compose: {
        positive: set.produces,
        rules: [{ when: cond, then: 'escalate' }],
        default: 'escalate',
      },
      notForJev: set.notForJev,
    }],
  };
  const path = join(out, `bank.${slug(name)}.json`);
  if (existsSync(path)) { console.log(`skip ${path}: exists (never overwritten)`); continue; }
  writeFileSync(path, JSON.stringify(context, null, 2) + '\n');
  written++;
  console.log(`wrote ${path}  (${Object.keys(questions).length} questions)`);
}
console.log(`${written} context(s) written; bank.ts left unchanged as read-only history.`);
