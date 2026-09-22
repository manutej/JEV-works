/**
 * QUESTIONS — the leads pipeline's three stage question sets, LOADED from the one question registry.
 *
 * Since 2026-09-22 (kit/SCOPE.md, approved by Manu) a question exists only in a kit/modules Context file.
 * The text lives in kit/modules/contexts/domain.leads.json (modules acquisition, qualification, sales),
 * migrated verbatim from this file's earlier literals; leads/fixtures/question-sets.v1.json is the frozen
 * snapshot and questions.test.ts proves this loader reproduces it exactly. Edit questions THERE, lint them
 * with `node kit/modules/cli.ts lint`, and never add question text here.
 *
 * THE RULE (NETER.md P21) still holds for every question: answerable from ONE Lead record; comparisons,
 * lists, dedup, exclusion and ranking live in code-gates.ts (each module's `notForJev` names them).
 */
import { readFileSync } from 'node:fs';
import type { JevQuestion, QuestionSet } from '../question-bank/bank.ts';
import type { Context } from '../kit/modules/meta-type.ts';

const CONTEXT_FILE = new URL('../kit/modules/contexts/domain.leads.json', import.meta.url);
type LeadsModule = Context['modules'][number] & { legacy: { exportName: string; produces: string; recombine: string; status: string } };

function load(): Record<string, QuestionSet> {
  const ctx = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as Context & { modules: LeadsModule[] };
  const out: Record<string, QuestionSet> = {};
  for (const m of ctx.modules) {
    const questions = Object.fromEntries(
      Object.entries(m.questions).map(([id, a]) => {
        // Strip the meta-type's annotations; the SDK's evaluate() calls a noul "boolean".
        const { polarity, reads, escapeOption, note, lintExceptions, ...q } = a;
        return [id, (q.type === 'noul' ? { ...q, type: 'boolean' } : q) as JevQuestion];
      }),
    );
    out[m.legacy.exportName] = {
      context: m.purpose, produces: m.legacy.produces, questions, notForJev: m.notForJev ?? [],
      recombine: m.legacy.recombine, status: m.legacy.status,
    } as QuestionSet;
  }
  for (const k of ['STAGE1_ACQUISITION', 'STAGE2_QUALIFICATION', 'STAGE3_SALES'])
    if (!out[k]) throw new Error(`${CONTEXT_FILE.pathname}: no module with legacy.exportName ${k}`);
  return out;
}

const SETS = load();
export const STAGE1_ACQUISITION: QuestionSet = SETS.STAGE1_ACQUISITION;
export const STAGE2_QUALIFICATION: QuestionSet = SETS.STAGE2_QUALIFICATION;
export const STAGE3_SALES: QuestionSet = SETS.STAGE3_SALES;

export const LEAD_QUESTION_SETS = { STAGE1_ACQUISITION, STAGE2_QUALIFICATION, STAGE3_SALES } as const;

// Re-exported for convenience so pipeline.ts doesn't need two import lines.
export type { JevQuestion, QuestionSet };
