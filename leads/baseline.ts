/**
 * BASELINE — a keyword/regex qualifier. No model calls, ever.
 *
 * This is the honest opponent NETER.md's thesis demands: "always beat a
 * cheap baseline first," and the field's own phishing result found a
 * two-line regex scoring 91.8% against a single broad Jev question's 62.6%.
 * This is written as a genuine attempt at that regex — real keyword lists,
 * real weights, real garbage/adversarial detection — not a strawman tuned to
 * lose.
 *
 * Scores every lead in a corpus and writes predictions to
 * results/baseline-<seed>.json, then — if a truth file for the same seed
 * exists — prints accuracy against planted truth directly, since this file
 * is allowed to run standalone without the rest of the pipeline.
 *
 *   node baseline.ts [--seed 42]
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import type { Lead, NextAction, PlantedTruth, Segment, TruthMap } from './types.ts';

function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const SEED = argValue('--seed', '42');

// ────────────────────────────────────────────────────────────── signal lists

const ICP_INDUSTRY_KEYWORDS = /\b(saas|b2b|fintech|devtools?|cyber ?security|cloud infrastructure|hr tech)\b/i;
const OUT_ICP_INDUSTRY_KEYWORDS = /\b(retail|restaurant|non-?profit|blog|landscap|bakery|theater|theatre)\b/i;

const BUYING_SIGNAL = /\b(evaluat(e|ing)|purchas|budget|pricing|price|quote|demo|trial|sign ?up|get started|replace|vendor)\b/i;
const URGENCY = /\b(urgent|asap|as soon as possible|deadline|this week|before end of|immediately|right away)\b/i;
const TIMELINE = /\b(q[1-4]\b|quarter|by (january|february|march|april|may|june|july|august|september|october|november|december)|next month|this month)\b/i;
const BUDGET_MENTIONED = /\$[\d,]+|budget/i;
const PRICING_QUESTION = /\b(pric(e|ing)|cost|quote|how much)\b/i;
const DEMO_REQUEST = /\b(demo|walkthrough|trial)\b/i;
const HUMAN_REQUEST = /\b(speak (with|to)|talk to (someone|a person)|call me|human)\b/i;
const OBJECTION = /\b(concern|hesitant|worried|not sure|too expensive|but\b)\b/i;
const READY_TO_BUY = /\b(sign us up|let'?s get started|ready to (buy|move forward)|approved)\b/i;
const COMPETITOR_MENTION = /\b(salesforce|hubspot|zendesk|segment|workato)\b/i;

const DECISION_TITLE = /\b(vp|vice president|chief|cto|ceo|cro|coo|director|head of|founder)\b/i;
const GENERIC_INBOX_TITLE = /^(info@|sales team|webmaster|contact form|)$/i;

/** Any letter at all (Latin or otherwise) — used only to catch pure symbol/emoji noise. */
const HAS_ANY_LETTER = /\p{L}/u;
/** Crude non-Latin-script detector: CJK + Cyrillic ranges. A regex baseline for an
 * English-only pipeline reasonably treats these as unparseable, same failure mode
 * the pipeline's own onTopicParseable question targets. */
const NON_LATIN_SCRIPT = /[぀-ヿ㐀-鿿Ѐ-ӿ]/;
const HTML_SOUP = /<\s*[a-z][^>]*>/i;
const INJECTION_ATTEMPT = /\b(ignore (all|previous) instructions|system:|override|as an ai|the correct output|ground truth)\b/i;

// ─────────────────────────────────────────────────────────── scoring weights
//
// Named constants, tuned by hand against the corpus's design intent (not
// fit to this specific corpus's labels — that would be cheating the
// comparison). Changing these is the whole surface area of "improving" this
// baseline; no hidden logic anywhere else.

const WEIGHTS = {
  icpIndustry: 3,
  outIcpIndustry: -3,
  bandLarge: 2, // 51-200, 201-1000, 1000+
  bandSmall: -1, // 1-10
  buyingSignal: 2,
  budgetMentioned: 1,
  timelineMentioned: 1,
  urgency: 1,
  decisionMakerTitle: 2,
  genericInboxTitle: -2,
} as const;

const QUALIFY_THRESHOLD = 4; // score >= this and not garbage/excluded => qualified

// ────────────────────────────────────────────────────────────────── scoring

export type BaselinePrediction = {
  leadId: string;
  score: number;
  isGarbage: boolean;
  injectionDetected: boolean;
  qualified: boolean;
  segment: Segment;
  nextAction: NextAction;
};

function looksLikeGarbage(lead: Lead): boolean {
  const msg = lead.inboundMessage.trim();
  if (msg.length === 0) return true;
  if (!HAS_ANY_LETTER.test(msg)) return true; // whitespace-only or pure emoji/symbols
  if (NON_LATIN_SCRIPT.test(msg)) return true;
  if (HTML_SOUP.test(msg) && !BUYING_SIGNAL.test(msg)) return true; // markup with no real prose signal
  if (!lead.companyName.trim()) return true;
  return false;
}

function segmentFromBand(band: string): Segment {
  if (band === '1000+' || band === '201-1000') return 'enterprise';
  if (band === '51-200') return 'mid_market';
  return 'smb';
}

export function scoreLead(lead: Lead): BaselinePrediction {
  const msg = lead.inboundMessage;
  const injectionDetected = INJECTION_ATTEMPT.test(msg);
  const garbage = looksLikeGarbage(lead);

  if (garbage) {
    return { leadId: lead.id, score: 0, isGarbage: true, injectionDetected, qualified: false, segment: 'not_qualified', nextAction: 'disqualify' };
  }

  let score = 0;
  if (ICP_INDUSTRY_KEYWORDS.test(lead.industry)) score += WEIGHTS.icpIndustry;
  if (OUT_ICP_INDUSTRY_KEYWORDS.test(lead.industry)) score += WEIGHTS.outIcpIndustry;
  if (lead.employeeBand === '51-200' || lead.employeeBand === '201-1000' || lead.employeeBand === '1000+') score += WEIGHTS.bandLarge;
  if (lead.employeeBand === '1-10') score += WEIGHTS.bandSmall;
  if (BUYING_SIGNAL.test(msg)) score += WEIGHTS.buyingSignal;
  if (BUDGET_MENTIONED.test(msg)) score += WEIGHTS.budgetMentioned;
  if (TIMELINE.test(msg)) score += WEIGHTS.timelineMentioned;
  if (URGENCY.test(msg)) score += WEIGHTS.urgency;
  const isDecisionMaker = DECISION_TITLE.test(lead.contactTitle);
  if (isDecisionMaker) score += WEIGHTS.decisionMakerTitle;
  if (GENERIC_INBOX_TITLE.test(lead.contactTitle.trim())) score += WEIGHTS.genericInboxTitle;

  // A regex has no notion of "ignore this instruction" — it just doesn't run the
  // words in the message as commands. It runs the same fixed set of checks
  // whether or not the message tries to address the classifier. That
  // structural immunity is the point of comparing against it (P8).

  const qualified = score >= QUALIFY_THRESHOLD;
  const segment = qualified ? segmentFromBand(lead.employeeBand) : 'not_qualified';

  let nextAction: NextAction = 'disqualify';
  if (qualified) {
    if (DEMO_REQUEST.test(msg) && isDecisionMaker && URGENCY.test(msg)) nextAction = 'auto_book_demo';
    else if (isDecisionMaker) nextAction = 'route_to_ae';
    else nextAction = 'nurture_sequence';
  }

  return { leadId: lead.id, score, isGarbage: false, injectionDetected, qualified, segment, nextAction };
}

// ───────────────────────────────────────────────────────────────── reporting

function accuracyReport(predictions: BaselinePrediction[], truth: TruthMap) {
  let correctQualified = 0;
  let tp = 0, fp = 0, fn = 0, tn = 0;
  let correctSegment = 0;
  const bySegment: Record<Segment, { tp: number; fn: number; total: number }> = {
    enterprise: { tp: 0, fn: 0, total: 0 },
    mid_market: { tp: 0, fn: 0, total: 0 },
    smb: { tp: 0, fn: 0, total: 0 },
    not_qualified: { tp: 0, fn: 0, total: 0 },
  };

  for (const p of predictions) {
    const t = truth[p.leadId];
    if (!t) continue;
    if (p.qualified === t.trueQualified) correctQualified++;
    if (p.qualified && t.trueQualified) tp++;
    else if (p.qualified && !t.trueQualified) fp++;
    else if (!p.qualified && t.trueQualified) fn++;
    else tn++;

    if (p.segment === t.trueSegment) correctSegment++;
    bySegment[t.trueSegment].total++;
    if (p.segment === t.trueSegment) bySegment[t.trueSegment].tp++;
    else bySegment[t.trueSegment].fn++;
  }

  const n = predictions.length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : NaN;
  const recall = tp + fn > 0 ? tp / (tp + fn) : NaN;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : NaN;

  const perSegmentRecall = Object.fromEntries(
    Object.entries(bySegment).map(([seg, s]) => [seg, s.total > 0 ? +(s.tp / s.total).toFixed(3) : NaN]),
  );
  const macroRecall = Object.values(perSegmentRecall).filter(Number.isFinite).reduce((a: number, b) => a + (b as number), 0) /
    Object.values(perSegmentRecall).filter(Number.isFinite).length;

  return {
    n,
    qualifiedAccuracy: +(correctQualified / n).toFixed(4),
    qualifiedPrecision: +precision.toFixed(4),
    qualifiedRecall: +recall.toFixed(4),
    qualifiedF1: +f1.toFixed(4),
    segmentAccuracy: +(correctSegment / n).toFixed(4),
    perSegmentRecall,
    macroAvgSegmentRecall: +macroRecall.toFixed(4),
  };
}

// ──────────────────────────────────────────────────────────────────── main

async function main() {
  const leadsPath = new URL(`./corpus/leads-${SEED}.json`, import.meta.url);
  const leads: Lead[] = JSON.parse(await readFile(leadsPath, 'utf8'));

  const predictions = leads.map(scoreLead);

  const outDir = new URL('./results/', import.meta.url);
  await mkdir(outDir, { recursive: true });
  const outPath = new URL(`./baseline-${SEED}.json`, outDir);
  await writeFile(outPath, JSON.stringify({ seed: SEED, weights: WEIGHTS, threshold: QUALIFY_THRESHOLD, predictions }, null, 2) + '\n');
  console.log(`wrote ${predictions.length} baseline predictions -> ${outPath.pathname}`);

  const truthPath = new URL(`./corpus/truth-${SEED}.json`, import.meta.url);
  try {
    const truth: TruthMap = JSON.parse(await readFile(truthPath, 'utf8'));
    const report = accuracyReport(predictions, truth);
    console.log('\nbaseline vs planted truth:');
    console.log(report);

    const injected = predictions.filter(p => p.injectionDetected);
    const injectionFlipped = injected.filter(p => p.qualified === true);
    console.log(
      `\ninjection check: ${injected.length} rows contained an injection attempt; ` +
        `${injectionFlipped.length} were scored qualified=true (the regex has no mechanism to be told what to output, ` +
        `so any qualified=true here comes only from the keyword score, never from the injected text itself).`,
    );
  } catch {
    console.log(`\n(no truth file at ${truthPath.pathname} — skipping accuracy report)`);
  }
}

await main();
