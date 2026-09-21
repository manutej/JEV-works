/**
 * PIPELINE — stage 1 (acquisition) -> stage 2 (qualification) -> stage 3 (sales),
 * one experimental_evaluate call per lead per stage, all of that stage's
 * questions batched into the call (NETER.md P1 — batching is free).
 *
 * Code gates run FIRST, before any model call:
 *   near-duplicate detection -> duplicates never reach Jev at all (P21: that
 *     judgement is cross-record, so it cannot be a question in the first
 *     place, not just an optimisation).
 *   exclusion-list match -> disqualified in code, no call spent confirming it.
 *   token-ceiling check -> runs immediately before every remaining call (P3).
 *
 * A lead that fails (or is escalated by) a stage's gate never reaches the
 * next stage. Every such stop is recorded as a saving.
 *
 * This file makes real experimental_evaluate calls. It is NOT run as part of
 * building this pipeline — see README.md for who runs it and when.
 *
 *   node --env-file-if-exists=/Users/manu/jev-playground/.env.local pipeline.ts [--seed 42] [--concurrency 8]
 */
import { experimental_evaluate as evaluate } from 'ai';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pool } from '../../jev-playground/experiments/_harness.ts';
import { STAGE1_ACQUISITION, STAGE2_QUALIFICATION, STAGE3_SALES } from './questions.ts';
import {
  detectNearDuplicates,
  representativesAndDuplicates,
  matchesExclusionList,
  territoryFor,
  assertUnderTokenCeiling,
  normalizedEntropy,
} from './code-gates.ts';
import type { Lead, Segment, NextAction } from './types.ts';
import { JEV, JEV_ID } from '../lib/jev.ts';

const MODEL = JEV_ID;

function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const SEED = argValue('--seed', '42');
const CONCURRENCY = Number(argValue('--concurrency', '8'));

// ─────────────────────────────────────────────────────────── verdict thresholds
//
// NETER.md P4: two thresholds closer than 0.11 are indistinguishable. These
// are 0.70 apart (0.15 / 0.85), and gate on the END a probability sits at,
// never on which side of 0.5 it happens to fall — a 0.51 is not a decision.

const END_HI = 0.85;
const END_LO = 0.15;
const SEGMENT_ENTROPY_GATE = 0.6; // above this, the segment choice distribution is too flat to trust (P6)
const ACTION_ENTROPY_GATE = 0.6;

type BoolVerdict = 'true' | 'false' | 'uncertain';
const boolVerdict = (p: number): BoolVerdict => (p >= END_HI ? 'true' : p <= END_LO ? 'false' : 'uncertain');

// ──────────────────────────────────────────────────────────────────── state

/** Send only what each stage's questions actually need — accuracy falls as irrelevant detail grows. */
function stage1State(lead: Lead) {
  return {
    companyName: lead.companyName,
    industry: lead.industry,
    employeeBand: lead.employeeBand,
    contactTitle: lead.contactTitle,
    inboundMessage: lead.inboundMessage,
    websiteBlurb: lead.websiteBlurb,
    tags: lead.tags,
  };
}
function stage2State(lead: Lead) {
  return {
    industry: lead.industry,
    employeeBand: lead.employeeBand,
    contactTitle: lead.contactTitle,
    inboundMessage: lead.inboundMessage,
    websiteBlurb: lead.websiteBlurb,
  };
}
function stage3State(lead: Lead) {
  return {
    contactTitle: lead.contactTitle,
    inboundMessage: lead.inboundMessage,
  };
}

// ──────────────────────────────────────────────────────────────── result shape

type Usage = { inputTokens?: number; outputTokens?: number; totalTokens?: number };

interface StageRun<A> {
  answers: A;
  entropies: Record<string, number>;
  latencyMs: number;
  tokens: Usage;
  estimatedStateTokens: number;
}

type Stage1Outcome = 'admit' | 'reject' | 'escalate';
type Stage2Outcome = 'qualified' | 'not_qualified' | 'escalate';
type Stage3Outcome = 'decided' | 'escalate';

interface LeadResult {
  leadId: string;
  codeGates: {
    duplicateOfRepresentative: string | null;
    excluded: boolean;
    territory: string;
  };
  stage1: (StageRun<Record<string, unknown>> & { outcome: Stage1Outcome }) | null;
  stage2: (StageRun<Record<string, unknown>> & { outcome: Stage2Outcome; segment: Segment | null }) | null;
  stage3: (StageRun<Record<string, unknown>> & { outcome: Stage3Outcome; nextAction: NextAction | null }) | null;
  stoppedAt: 'code_duplicate' | 'code_exclusion' | 'stage1' | 'stage2' | 'stage3';
  final: { qualified: boolean | null; segment: Segment | null; nextAction: NextAction | null };
  error: string | null;
}

// ───────────────────────────────────────────────────────────────── helpers

function answerEntropy(answers: Record<string, any>, names: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of names) {
    const a = answers[n];
    if (!a) continue;
    if (a.type === 'boolean') out[n] = normalizedEntropy({ true: a.probability, false: 1 - a.probability });
    else if (a.type === 'choice') out[n] = a.probabilities ? normalizedEntropy(a.probabilities) : NaN;
    // score questions don't have a probability distribution over discrete options in the same sense
  }
  return out;
}

async function runStage<Q extends Record<string, unknown>>(
  leadId: string,
  state: Record<string, unknown>,
  questions: Q,
): Promise<StageRun<Record<string, unknown>>> {
  const estimatedStateTokens = assertUnderTokenCeiling(state, leadId); // P3 — count before the call, always
  const t0 = performance.now();
  const result = await evaluate({
    model: JEV,
    state: state as never,
    questions: questions as never,
    maxRetries: 2,
    providerOptions: { gateway: { zeroDataRetention: true } },
  });
  const latencyMs = performance.now() - t0;
  const names = Object.keys(questions);
  return {
    answers: result.answers as Record<string, unknown>,
    entropies: answerEntropy(result.answers as Record<string, any>, names),
    latencyMs,
    tokens: result.usage,
    estimatedStateTokens,
  };
}

// ──────────────────────────────────────────────────────────────────── main

async function main() {
  const leadsPath = new URL(`./corpus/leads-${SEED}.json`, import.meta.url);
  const leads: Lead[] = JSON.parse(await readFile(leadsPath, 'utf8'));
  console.log(`loaded ${leads.length} leads from ${leadsPath.pathname}`);

  // ── code gates, run once over the whole batch, before any model call ──
  const dupGroups = detectNearDuplicates(leads);
  const { duplicatesOf } = representativesAndDuplicates(dupGroups);
  console.log(`code gate: ${dupGroups.length} duplicate groups, ${duplicatesOf.size} leads short-circuited without a model call`);

  const excludedCount = leads.filter(matchesExclusionList).length;
  console.log(`code gate: ${excludedCount} leads matched the exclusion list, short-circuited without a model call`);

  const t0 = performance.now();
  const results = await pool(leads, CONCURRENCY, async (lead): Promise<LeadResult> => {
    const territory = territoryFor(lead.country);
    const dupOf = duplicatesOf.get(lead.id) ?? null;

    const base: LeadResult = {
      leadId: lead.id,
      codeGates: { duplicateOfRepresentative: dupOf, excluded: false, territory },
      stage1: null,
      stage2: null,
      stage3: null,
      stoppedAt: 'stage1',
      final: { qualified: null, segment: null, nextAction: null },
      error: null,
    };

    if (dupOf) {
      // Deliberately do not even normalise/send state — a duplicate's disposition
      // is resolved by copying the representative's result after the pool finishes.
      return { ...base, stoppedAt: 'code_duplicate' };
    }
    if (matchesExclusionList(lead)) {
      return {
        ...base,
        codeGates: { ...base.codeGates, excluded: true },
        stoppedAt: 'code_exclusion',
        final: { qualified: false, segment: 'not_qualified', nextAction: 'disqualify' },
      };
    }

    try {
      const s1 = await runStage(lead.id, stage1State(lead), STAGE1_ACQUISITION.questions);
      const a1 = s1.answers as any;
      const coreTrue = ['isRealBusiness', 'hasNamedCompany', 'inboundSubstantive', 'onTopicParseable'].map(
        n => boolVerdict(a1[n].probability),
      );
      const emptyVerdict = boolVerdict(a1.isEmptyOrMarkup.probability);
      let outcome1: Stage1Outcome;
      if (coreTrue.every(v => v === 'true') && emptyVerdict === 'false') outcome1 = 'admit';
      else if (coreTrue.some(v => v === 'false') || emptyVerdict === 'true') outcome1 = 'reject';
      else outcome1 = 'escalate';

      const stage1Result = { ...s1, outcome: outcome1 };
      if (outcome1 !== 'admit') {
        return {
          ...base,
          stage1: stage1Result,
          stoppedAt: 'stage1',
          final: { qualified: outcome1 === 'reject' ? false : null, segment: outcome1 === 'reject' ? 'not_qualified' : null, nextAction: outcome1 === 'reject' ? 'disqualify' : 'escalate_human' },
        };
      }

      const s2 = await runStage(lead.id, stage2State(lead), STAGE2_QUALIFICATION.questions);
      const a2 = s2.answers as any;
      const segmentEntropy = s2.entropies.segment ?? 1;
      const segment = a2.segment.choice as Segment;
      const icpFit = a2.icpFit.score as number;
      let outcome2: Stage2Outcome;
      if (segmentEntropy > SEGMENT_ENTROPY_GATE) outcome2 = 'escalate';
      else if (segment !== 'not_qualified' && icpFit >= 2) outcome2 = 'qualified';
      else outcome2 = 'not_qualified';

      const stage2Result = { ...s2, outcome: outcome2, segment };
      if (outcome2 !== 'qualified') {
        return {
          ...base,
          stage1: stage1Result,
          stage2: stage2Result,
          stoppedAt: 'stage2',
          final: {
            qualified: outcome2 === 'not_qualified' ? false : null,
            segment: outcome2 === 'not_qualified' ? segment : null,
            nextAction: outcome2 === 'not_qualified' ? 'disqualify' : 'escalate_human',
          },
        };
      }

      const s3 = await runStage(lead.id, stage3State(lead), STAGE3_SALES.questions);
      const a3 = s3.answers as any;
      const actionEntropy = s3.entropies.nextAction ?? 1;
      const nextAction = a3.nextAction.choice as NextAction;
      const outcome3: Stage3Outcome = actionEntropy > ACTION_ENTROPY_GATE ? 'escalate' : 'decided';
      const finalAction: NextAction = outcome3 === 'decided' ? nextAction : 'escalate_human';

      return {
        ...base,
        stage1: stage1Result,
        stage2: stage2Result,
        stage3: { ...s3, outcome: outcome3, nextAction },
        stoppedAt: 'stage3',
        final: { qualified: true, segment, nextAction: finalAction },
      };
    } catch (err) {
      return { ...base, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Back-fill duplicates from their representative's result.
  const byId = new Map(results.map(r => [r.leadId, r]));
  for (const r of results) {
    if (r.stoppedAt === 'code_duplicate' && r.codeGates.duplicateOfRepresentative) {
      const rep = byId.get(r.codeGates.duplicateOfRepresentative);
      if (rep) r.final = rep.final;
    }
  }

  const wallMs = performance.now() - t0;
  const savings = {
    codeDuplicate: results.filter(r => r.stoppedAt === 'code_duplicate').length,
    codeExclusion: results.filter(r => r.stoppedAt === 'code_exclusion').length,
    stoppedAtStage1: results.filter(r => r.stoppedAt === 'stage1').length,
    stoppedAtStage2: results.filter(r => r.stoppedAt === 'stage2').length,
    reachedStage3: results.filter(r => r.stoppedAt === 'stage3').length,
    errors: results.filter(r => r.error !== null).length,
  };

  const outDir = new URL('./results/', import.meta.url);
  await mkdir(outDir, { recursive: true });
  const outPath = new URL(`./pipeline-${SEED}.json`, outDir);
  await writeFile(
    outPath,
    JSON.stringify({ seed: SEED, model: MODEL, wallMs, savings, results }, null, 2) + '\n',
  );

  console.log(`\nwrote ${results.length} lead results -> ${outPath.pathname}`);
  console.log('savings:', savings);
  console.log(`wall clock: ${Math.round(wallMs)}ms`);
}

await main();
