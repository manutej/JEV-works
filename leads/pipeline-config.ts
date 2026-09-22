/**
 * PIPELINE CONFIG — which decision rules each stage uses, as data (leads/pipeline.<version>.json).
 * Rule changes are new decision files and a new config version, never code edits, so a
 * pre-registration can pin the exact rules by hash.
 *
 *   { "version": "v3", "stage1": "decisions/stage1.v1.json", "stage2": "decisions/stage2.v3.json",
 *     "segment": "band-lookup" | "jev-choice" }
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadDecision } from '../kit/gate/load.ts';
import type { Decision } from '../kit/gate/decide.ts';
import { STAGE1_ACQUISITION, STAGE2_QUALIFICATION } from './questions.ts';
import { CODE_FACT_IDS } from './code-gates.ts';

export type SegmentSource = 'band-lookup' | 'jev-choice';
export type PipelineConfig = { version: string; stage1: Decision; stage2: Decision; segment: SegmentSource; provenance: Record<string, string> };

const here = (p: string) => new URL(`./${p}`, import.meta.url).pathname;
const sha = (p: string) => createHash('sha256').update(readFileSync(here(p))).digest('hex').slice(0, 16);

export function loadPipelineConfig(file: string): PipelineConfig {
  const raw = JSON.parse(readFileSync(here(file), 'utf8'));
  const errors: string[] = [];
  if (typeof raw.version !== 'string') errors.push('version: a name');
  for (const k of ['stage1', 'stage2']) if (typeof raw[k] !== 'string') errors.push(`${k}: path to a decision file`);
  if (!['band-lookup', 'jev-choice'].includes(raw.segment)) errors.push('segment: band-lookup or jev-choice');
  if (errors.length) throw new Error(`${file} is invalid:\n  - ${errors.join('\n  - ')}`);
  return {
    version: raw.version,
    // Each rule may only name questions its stage actually asks.
    // Stage 1 may also read code facts (code_*), computed from the record in code-gates.ts.
    stage1: loadDecision(here(raw.stage1), new Set([...Object.keys(STAGE1_ACQUISITION.questions), ...CODE_FACT_IDS])),
    stage2: loadDecision(here(raw.stage2), new Set(Object.keys(STAGE2_QUALIFICATION.questions))),
    segment: raw.segment,
    provenance: { config: `${file}@${sha(file)}`, stage1: `${raw.stage1}@${sha(raw.stage1)}`, stage2: `${raw.stage2}@${sha(raw.stage2)}` },
  };
}
