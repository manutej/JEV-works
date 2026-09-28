/**
 * The fused workflow from the shell. No API calls: it consumes kit result files that kit/run.ts already wrote.
 *
 *   node kit/gate/pipeline-cli.ts <pipeline.json>
 *
 * pipeline.json:
 *   { "name": "intent-routing", "target": "domain",
 *     "fit": "cookbooks/intent-routing/results/fit.json", "test": "cookbooks/intent-routing/results/test.json",
 *     "items": "cookbooks/intent-routing/items.meta.json",
 *     "effect": { "effect": "reversible", "blast": "low" }, "budgets": "kit/gate/examples/effect-budgets.example.json",
 *     "envelope": "validate-first", "minCoverage": 0.95, "auditShare": 0.1, "stratumField": "source",
 *     "out": "kit/results/pipeline-intent-routing" }
 *
 * Writes into `out`: frozen.json (refused if it exists: a frozen cut is never re-fitted), label-audit.json,
 * routes.jsonl (one ledger line per test item), report.json, and prints the summary. Exit 2 when the gate suite REFUSEs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { checkBudgets } from './route.ts';
import { pipeline, renderReport, type MetaItem, type PipelineConfig, type ResultFile } from './pipeline.ts';

const cfgPath = process.argv[2];
if (!cfgPath) { console.error('usage: node kit/gate/pipeline-cli.ts <pipeline.json>'); process.exit(64); }
const raw = JSON.parse(readFileSync(cfgPath, 'utf8'));
const rel = (p: string) => resolve(dirname(resolve(cfgPath)), p);
const budgets = checkBudgets(JSON.parse(readFileSync(rel(raw.budgets), 'utf8')));
if (!budgets.value) { console.error(budgets.errors.join('\n')); process.exit(65); }
const cfg: PipelineConfig = { name: raw.name, target: raw.target, effect: raw.effect, budgets: budgets.value, envelope: raw.envelope, minCoverage: raw.minCoverage, auditShare: raw.auditShare, stratumField: raw.stratumField };
const out = rel(raw.out ?? `kit/results/pipeline-${raw.name}`);
if (existsSync(join(out, 'frozen.json'))) { console.error(`REFUSED: ${join(out, 'frozen.json')} exists; a frozen cut is never re-fitted. Use a new out dir.`); process.exit(4); }
const fit = JSON.parse(readFileSync(rel(raw.fit), 'utf8')) as ResultFile;
const test = JSON.parse(readFileSync(rel(raw.test), 'utf8')) as ResultFile;
const meta = JSON.parse(readFileSync(rel(raw.items), 'utf8')) as MetaItem[];
const report = pipeline(cfg, fit, test, meta);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'frozen.json'), JSON.stringify(report.frozen, null, 2) + '\n');
writeFileSync(join(out, 'label-audit.json'), JSON.stringify(report.anchor.labelAudit, null, 2) + '\n');
writeFileSync(join(out, 'routes.jsonl'), report.ledger.map(l => JSON.stringify(l)).join('\n') + '\n');
const { ledger: _l, ...rest } = report;
writeFileSync(join(out, 'report.json'), JSON.stringify(rest, null, 2) + '\n');
console.log(renderReport(report));
console.log(`→ ${out}/{frozen.json, label-audit.json, routes.jsonl, report.json}`);
process.exit(report.gates.verdict === 'REFUSE' ? 2 : 0);
