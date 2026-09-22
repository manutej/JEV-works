/**
 * SPLITS — every corpus seed's declared role, and which seeds had been looked at (fit on) before it.
 *
 * Why this exists: holdout p6029 passed its disjointness check (0 full-record overlap) yet reused
 * 565/600 messages verbatim from dev seed p3001, the seed its stage-2 rule was tuned on. Record-level
 * overlap cannot see leakage through wording. So:
 *   - pipeline.ts refuses to run a seed that is not declared here (no unplanned holdouts);
 *   - evaluate.ts scores every holdout twice more, on messages SEEN in its fit seeds and on NOVEL
 *     messages, and warns when the seen share is high. A result carried by seen wording shows it.
 *
 * Declare a new seed here, in the same commit as its pre-registration, before generating it.
 */
import { readFileSync } from 'node:fs';
import type { Lead } from './types.ts';

export type Split = {
  role: 'dev' | 'holdout';
  fitSeeds: string[];
  note?: string;
  /** Holdouts, for claim-gate.ts (PREREG.md Q0, Q2.1, Q3.1, Q1.3). */
  claimScope?: 'all' | 'new_records' | 'novel_wording';
  minCoverage?: number;
  primaryPolicy?: 'v1' | 'v2';
  leakageAccepted?: boolean;
};

const SPLITS: Record<string, Split> = JSON.parse(readFileSync(new URL('./corpus/splits.json', import.meta.url), 'utf8'));

/** Above this share of seen messages, a holdout headline is mostly a test of wording it was tuned on. */
export const SEEN_SHARE_WARN = 0.2;
/** I3: no verdict below 8 observations. */
export const MIN_SUBSET = 8;

export function splitFor(seed: string): Split | undefined {
  return SPLITS[seed];
}

export function requireSplit(seed: string): Split {
  const s = SPLITS[seed];
  if (!s) {
    throw new Error(
      `seed ${seed} is not declared in leads/corpus/splits.json. Declare its role (dev|holdout) and ` +
        `fitSeeds (every seed looked at before it) in the pre-registration commit, then run.`,
    );
  }
  for (const f of s.fitSeeds) if (!SPLITS[f]) throw new Error(`seed ${seed}: fit seed ${f} is not declared either`);
  return s;
}

const normalize = (m: string) => m.toLowerCase().replace(/\s+/g, ' ').trim();

/** Every inbound message in the given seeds' corpora, normalised. */
export function messagesOf(seeds: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const s of seeds) {
    const leads: Lead[] = JSON.parse(readFileSync(new URL(`./corpus/leads-${s}.json`, import.meta.url), 'utf8'));
    for (const l of leads) out.add(normalize(l.inboundMessage));
  }
  return out;
}

/** Partitions lead ids by whether their message was already present in the fit seeds. */
export function partitionBySeen(leads: readonly Lead[], seen: ReadonlySet<string>): { seen: string[]; novel: string[] } {
  const out = { seen: [] as string[], novel: [] as string[] };
  for (const l of leads) (seen.has(normalize(l.inboundMessage)) ? out.seen : out.novel).push(l.id);
  return out;
}
