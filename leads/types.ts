/**
 * TYPES — the shared shape between the synthetic corpus, the pipeline, and a
 * real scrape.
 *
 * `Lead` is deliberately dumb: it holds nothing a real scraper couldn't also
 * fill in (a form submission, an inbox parser, a CRM webhook). Everything
 * that requires comparing leads to each other, or to a list, or counting
 * anything, lives in code-gates.ts instead — see NETER.md P18, P21.
 *
 * `PlantedTruth` is kept in a SEPARATE map, keyed by lead id, and the
 * pipeline (pipeline.ts, baseline.ts) must never import it. Only
 * generate-corpus.ts (to write it) and evaluate.ts (to score against it)
 * are allowed to touch truth.ts data.
 */

// ─────────────────────────────────────────────────────────────── segments

/** Named ordinal-ish buckets. A choice over these, never a number to compare. */
export const ALL_SEGMENTS = ['enterprise', 'mid_market', 'smb', 'not_qualified'] as const;
export type Segment = (typeof ALL_SEGMENTS)[number];

export const ALL_ACTIONS = [
  'auto_book_demo',
  'route_to_ae',
  'nurture_sequence',
  'disqualify',
  'escalate_human',
] as const;
export type NextAction = (typeof ALL_ACTIONS)[number];

/** Named employee-count bands. Never send a raw headcount for Jev to compare. */
export const EMPLOYEE_BANDS = ['1-10', '11-50', '51-200', '201-1000', '1000+'] as const;
export type EmployeeBand = (typeof EMPLOYEE_BANDS)[number];

// ────────────────────────────────────────────────────────────────── lead

/** One inbound lead record. Everything a form, inbox parser, or CRM webhook could fill in. */
export interface Lead {
  id: string;
  /** Where this record came from — a webform, chat widget, referral, etc. Never a signal about quality by itself. */
  source: string;
  companyName: string;
  industry: string;
  employeeBand: EmployeeBand;
  /** ISO 3166-1 alpha-2. Used by code-gates.ts for territory lookup — never asked of Jev. */
  country: string;
  contactTitle: string;
  /** The free-text message the lead submitted. This is the field most of the
   * corpus's adversarial and garbage cases stress. */
  inboundMessage: string;
  /** A blurb scraped from the company's own website, if one was found. */
  websiteBlurb: string;
  tags: string[];
  /** ISO 8601 timestamp. */
  capturedAt: string;
}

// ──────────────────────────────────────────────────────────── planted truth

export type LeadCategory =
  | 'clean_in_icp'
  | 'clean_out_icp'
  | 'non_buyer'
  | 'ambiguous'
  | 'garbage'
  | 'adversarial'
  | 'near_duplicate';

/**
 * The answer key. Never visible to pipeline.ts, baseline.ts, or code-gates.ts —
 * only generate-corpus.ts writes it and evaluate.ts reads it.
 */
export interface PlantedTruth {
  trueSegment: Segment;
  trueQualified: boolean;
  trueNextAction: NextAction;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Which corpus bucket this row was generated for. Drives evaluate.ts's per-category breakdowns. */
  category: LeadCategory;
  /** For near-duplicate rows: the id of the lead this one duplicates. Undefined otherwise. */
  duplicateOf?: string;
  /** For adversarial rows: what the injected text is trying to make the pipeline output, so
   * evaluate.ts can check whether the injection succeeded rather than merely whether the
   * pipeline was "right" in the ordinary sense. */
  injectedDemand?: { field: 'trueQualified' | 'trueSegment'; value: string };
}

export type TruthMap = Record<string, PlantedTruth>;
