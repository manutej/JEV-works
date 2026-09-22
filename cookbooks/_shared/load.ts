/**
 * cookbooks/_shared/load.ts — read one domain's committed files into a single object for the pages and README tables.
 * Every number the demo shows comes from here, and everything here comes from a kit result file or decide.ts output.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Answer } from '../../kit/ask.ts';
import type { Label, Question } from '../../kit/spec.ts';

export const DOMAINS = ['youtube-spam', 'intent-routing', 'review-triage', 'contract-clauses', 'job-postings', 'issue-triage'] as const;
export type DomainId = typeof DOMAINS[number];
export const ROOT = join(import.meta.dirname, '..');

type P = { n: number; accuracyA: number; accuracyB: number; b: number; c: number; p: number; different: boolean; deltaCI95: [number, number] };
export type QualityRow = { question: string; kind: string; meanConf?: number; atEnds: number; spread?: number; distinct?: number; verdict: string };

export type Loaded = {
  id: DomainId;
  questions: Record<string, Question>;
  target: string;
  kind: 'binary' | 'choice';
  frozen: Record<string, any>;
  model: string; answeredBy: string[];
  calls: { pilot: number; fit: number; test: number };
  quality: { pilot: QualityRow[]; fit: QualityRow[]; test: QualityRow[] };
  direct?: { question: string; accuracy: number; vsBaseline: P };   // the kit's own scorecard for the labelled question, if Jev was asked it
  decision: {
    n: number; baselineName: string; majority: Label;
    forced: { jevAccuracy: number; baselineAccuracy: number; majorityAccuracy: number; vsBaseline: P; vsMajority: P; counts?: any };
    gated: { coverage: number; autoN: number; escalated: number; autoAccuracy: number | null; baselineOnSameItems: number | null; vsBaselineOnSameItems: P | null; allItemsEscalationsWrong: number };
    strata: { label: Label; n: number; jev: number; baseline: number; b: number; c: number; p: number }[];
  };
  strong: { name: string; trainN: number; forced: P; gatedSameItems: P | null; strata: { label: Label; n: number; jev: number; strong: number; b: number; c: number; p: number }[] };
  /** results/gates.json: the standard gate suite, the post-hoc naive Bayes claim suite, and the post-hoc bounded gate. */
  gates: { suite: any; posthocHeadlineVsNaiveBayes: { suite: any; report: any }; declaredClaim: any; boundedGate: any };
  polarity: Record<string, string>;
  items: {
    id: string; state: unknown; label: Label; baseline: Label; strong: Label;
    pred: Label | null; auto: boolean; score?: number; confidence?: number; answers: Record<string, Answer>;
  }[];
};

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

export function load(id: DomainId): Loaded {
  const d = join(ROOT, id);
  const spec = read(join(d, 'spec.json'));
  const pilot = read(join(d, 'results', 'pilot.json')), fit = read(join(d, 'results', 'fit.json')), test = read(join(d, 'results', 'test.json'));
  const dec = read(join(d, 'results', 'decision-test.json'));
  const strongRes = read(join(d, 'results', 'strong-baseline-test.json'));
  const strongPreds = read(join(d, 'baseline.strong.json')).predictions as Record<string, Label>;
  const frozen = read(join(d, 'rule.frozen.json'));
  const states = new Map<string, unknown>(spec.items.map((i: any) => [i.id, i.state]));
  const answers = new Map<string, Record<string, Answer>>(test.items.map((r: any) => [r.id, r.answers]));
  const sc = (test.scorecards as any[]).find(c => c.question === frozen.target);
  return {
    id, questions: spec.questions, target: frozen.target, kind: frozen.kind, frozen,
    model: test.model, answeredBy: test.answeredBy,
    calls: { pilot: pilot.calls, fit: fit.calls, test: test.calls },
    quality: { pilot: pilot.quality, fit: fit.quality, test: test.quality },
    direct: sc?.baseline ? { question: sc.question, accuracy: sc.accuracy, vsBaseline: sc.baseline.vsJev } : undefined,
    decision: { ...dec, baselineName: dec.baselineName ?? 'keyword lists (top 8 per class by log-odds, fit split only)' },
    strong: { name: strongRes.strongBaseline.name, trainN: strongRes.strongBaseline.trainN, forced: strongRes.forced, gatedSameItems: strongRes.gatedSameItems, strata: strongRes.strata },
    gates: read(join(d, 'results', 'gates.json')),
    polarity: Object.fromEntries(Object.entries(read(join(d, 'context.json')).modules[0].questions).map(([k, q]: [string, any]) => [k, q.polarity])),
    items: dec.items.map((x: any) => ({ ...x, state: states.get(x.id), strong: strongPreds[x.id], answers: answers.get(x.id) ?? {} })),
  };
}

export const exists = (id: string) => existsSync(join(ROOT, id, 'results', 'strong-baseline-test.json'));
