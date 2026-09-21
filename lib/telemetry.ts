/**
 * Run telemetry — announce before, stream during, reconcile after.
 *
 * This exists because the requirement lived in an output-style prompt, which is
 * a request to remember. Moving it into code makes it a property of the run:
 * every script that uses this is legible while it is still running, regardless
 * of which style is loaded or who is watching.
 *
 * The failure it prevents is specific. A 480-call consensus sweep that prints
 * nothing until it finishes gives you no way to tell "working" from "hung", no
 * way to spot a systematic error at call 20 instead of call 480, and no record
 * of retries. All three were true of runs already shipped in this project.
 *
 * Usage:
 *
 *   const log = new RunLog('e1-consensus');
 *   log.announce({
 *     model: 'typesafe-ai/jev',
 *     items: 80,
 *     questions: { formula: 'choice(9)' },
 *     stateShape: '{text, source}  ~90 tok',
 *     recombination: 'argmax over 5 labellers; unanimity = 5/5',
 *     thresholdsFitted: false,
 *   });
 *   // ... per item, inside your pool:
 *   log.item(id, { verdict: 'agree', p: { formula: 0.91 }, ms: 240 });
 *   log.retry(id, 'Request timed out');
 *   log.done();
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RUNS_DIR = join(import.meta.dirname ?? '.', '..', 'runs');

export type Announcement = {
  /** Model id, verbatim. */
  model: string;
  /** How many items will be processed. */
  items: number;
  /** Question name → a short type descriptor, e.g. `choice(9)` or `boolean`. */
  questions: Record<string, string>;
  /** Structure and rough size of the state, NOT its contents. */
  stateShape: string;
  /** The rule that turns answers into an action. */
  recombination?: string;
  /**
   * Whether any threshold in the recombination was fitted on held-out data.
   * Hand-set thresholds must be labelled every time they are reported, so this
   * is required rather than optional — an omission would default to the
   * flattering reading.
   */
  thresholdsFitted: boolean;
  /** Retries per call, so the latency numbers can be interpreted. */
  maxRetries?: number;
};

export class RunLog {
  readonly path: string;
  private started = 0;
  private completed = 0;
  private failed = 0;
  private retried = new Set<string>();
  private verdicts = new Map<string, number>();
  private latencies: number[] = [];
  private tokens = 0;
  private lastTally = 0;
  private announced?: Announcement;
  /** Emit a tally at most this often, so a fast run does not spam the terminal. */
  private readonly tallyEveryMs = 4000;

  readonly name: string;

  constructor(name: string) {
    this.name = name;
    mkdirSync(RUNS_DIR, { recursive: true });
    // Deliberately NOT timestamped: a stable path means the tail command stays
    // valid across re-runs, which is what makes it useful to leave open.
    this.path = join(RUNS_DIR, `${name}.jsonl`);
    writeFileSync(this.path, '');
  }

  /** Print the call shape BEFORE the first call, so it is on screen throughout. */
  announce(a: Announcement): void {
    this.announced = a;
    this.started = performance.now();
    const qs = Object.entries(a.questions);
    const lines = [
      `── ${this.name} ──`,
      `model         ${a.model}`,
      `items         ${a.items}`,
      `questions     ${qs.length}: ${qs.map(([n, t]) => `${n}:${t}`).join(' · ')}`,
      `state         ${a.stateShape}`,
      `retries       ${a.maxRetries ?? 0}`,
    ];
    if (a.recombination) {
      lines.push(
        `recombination ${a.recombination}`,
        `thresholds    ${a.thresholdsFitted ? 'FITTED on held-out data' : 'HAND-SET (not fitted)'}`,
      );
    }
    lines.push(`watch         tail -f ${this.path}`);
    console.log(lines.join('\n') + '\n');
  }

  /** Record one completed item. Appends a line and may emit a tally. */
  item(id: string, data: Record<string, unknown> & { verdict?: string; ms?: number; inputTokens?: number }): void {
    this.completed++;
    if (data.verdict) this.verdicts.set(data.verdict, (this.verdicts.get(data.verdict) ?? 0) + 1);
    if (typeof data.ms === 'number') this.latencies.push(data.ms);
    if (typeof data.inputTokens === 'number') this.tokens += data.inputTokens;
    appendFileSync(this.path, JSON.stringify({ id, ...data }) + '\n');
    this.maybeTally();
  }

  /** A retry is reported as it happens and the item stays flagged in the summary. */
  retry(id: string, reason: string): void {
    this.retried.add(id);
    appendFileSync(this.path, JSON.stringify({ id, event: 'retry', reason }) + '\n');
    console.log(`  retry ${id}: ${reason.slice(0, 90)}`);
  }

  /** A permanent failure. Counted separately from a verdict — never as one. */
  fail(id: string, reason: string): void {
    this.failed++;
    appendFileSync(this.path, JSON.stringify({ id, event: 'fail', reason }) + '\n');
    console.log(`  FAIL  ${id}: ${reason.slice(0, 90)}`);
    this.maybeTally();
  }

  private maybeTally(): void {
    const now = performance.now();
    if (now - this.lastTally < this.tallyEveryMs) return;
    this.lastTally = now;
    console.log(`  ${this.tally()}`);
  }

  private tally(): string {
    const total = this.announced?.items ?? 0;
    const elapsed = (performance.now() - this.started) / 1000;
    const rate = this.completed / Math.max(0.001, elapsed);
    const eta = total > this.completed ? (total - this.completed) / Math.max(0.001, rate) : 0;
    const verdicts = [...this.verdicts].map(([v, n]) => `${v} ${n}`).join(' · ') || 'no verdicts yet';
    const spend = (this.tokens * 0.042) / 1e6;
    return (
      `${this.completed}/${total}` +
      (this.failed ? ` (${this.failed} failed)` : '') +
      ` · ${verdicts} · ${elapsed.toFixed(0)}s elapsed` +
      (eta > 1 ? ` · ~${eta.toFixed(0)}s left` : '') +
      ` · $${spend.toFixed(5)}`
    );
  }

  /**
   * Final summary, reconciled against what was announced. Drift is stated
   * rather than smoothed over — a run that processed fewer items than it
   * announced must not be presented as the run that was described.
   */
  done(): {
    completed: number;
    failed: number;
    retried: string[];
    p50: number;
    p95: number;
    tokens: number;
    dollars: number;
    drift: string[];
  } {
    const s = [...this.latencies].sort((a, b) => a - b);
    const pct = (q: number) => (s.length ? s[Math.min(s.length - 1, Math.floor((s.length - 1) * q))] : NaN);
    const drift: string[] = [];
    const announced = this.announced?.items ?? 0;

    if (announced && this.completed + this.failed !== announced) {
      drift.push(
        `announced ${announced} items, accounted for ${this.completed + this.failed} ` +
          `(${this.completed} completed, ${this.failed} failed)`,
      );
    }
    if (this.failed) drift.push(`${this.failed} items produced no answer and are excluded from every rate below`);
    if (this.retried.size) drift.push(`${this.retried.size} items needed a retry: ${[...this.retried].slice(0, 6).join(', ')}`);

    const out = {
      completed: this.completed,
      failed: this.failed,
      retried: [...this.retried],
      p50: +pct(0.5).toFixed(1),
      p95: +pct(0.95).toFixed(1),
      tokens: this.tokens,
      dollars: +((this.tokens * 0.042) / 1e6).toFixed(5),
      drift,
    };

    console.log(`\n── ${this.name} complete ──`);
    console.log(`  ${this.tally()}`);
    console.log(`  latency p50 ${out.p50}ms · p95 ${out.p95}ms`);
    console.log(`  ${out.tokens.toLocaleString()} input tokens = $${out.dollars}`);
    if (this.announced && !this.announced.thresholdsFitted) {
      console.log('  NOTE thresholds were hand-set, not fitted — treat the operating point as provisional');
    }
    if (drift.length) {
      console.log('  DRIFT from the announced plan:');
      for (const d of drift) console.log(`    · ${d}`);
    } else {
      console.log('  no drift from the announced plan');
    }
    console.log(`  log ${this.path}`);
    return out;
  }
}
