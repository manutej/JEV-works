/**
 * kit/modules CLI. No model calls: it lints and hydrates; kit/run.ts runs what it writes.
 *
 *   node kit/modules/cli.ts lint   <context.json>
 *   node kit/modules/cli.ts prompt <context.json>                         reviewer meta-prompt to stdout
 *   node kit/modules/cli.ts spec   <context.json> <module> <items.json> <out.json>
 *   node kit/modules/cli.ts vet    <context.json> <out.json>             meta:question-quality spec over its questions
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { problems } from '../spec.ts';
import { errorsOf, lintContext, type Context } from './meta-type.ts';
import { atomsAsItems, toKitSpec, toMetaPrompt } from './hydrate.ts';

const readJson = (p: string) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (cause) {
    throw new Error(`${p}: not readable JSON`, { cause });
  }
};

/** A context is only used after it passes the meta-type; warnings print, errors stop. */
function loadContext(p: string): Context {
  const c = readJson(p) as Context;
  const findings = lintContext(c);
  for (const f of findings) console.error(`${f.severity === 'error' ? 'ERROR' : 'warn '} ${f.rule} ${f.at}: ${f.message}`);
  if (errorsOf(findings).length) throw new Error(`${p}: ${errorsOf(findings).length} meta-type error(s); fix them before hydrating`);
  return c;
}

function writeSpec(out: string, spec: object) {
  const errs = problems(spec);
  if (errs.length) throw new Error(`hydrated spec fails kit/spec.ts validation:\n  - ${errs.join('\n  - ')}`);
  writeFileSync(out, JSON.stringify(spec, null, 2) + '\n');
  console.log(`wrote ${out} (valid kit spec)`);
}

const [cmd, ...args] = process.argv.slice(2);
const usage = 'usage: cli.ts lint|prompt <context.json> · spec <context.json> <module> <items.json> <out.json> · vet <context.json> <out.json>';
if (cmd === 'lint' && args[0]) {
  const c = loadContext(args[0]);
  console.log(`${c.name}: ${c.modules.length} modules, ${c.modules.reduce((n, m) => n + Object.keys(m.questions).length, 0)} questions, meta-type passed`);
} else if (cmd === 'prompt' && args[0]) {
  console.log(toMetaPrompt(loadContext(args[0])));
} else if (cmd === 'spec' && args.length === 4) {
  const [ctx, mod, items, out] = args;
  writeSpec(out, toKitSpec(loadContext(ctx), mod, readJson(items)));
} else if (cmd === 'vet' && args.length === 2) {
  const [ctx, out] = args;
  const meta = loadContext(resolve(dirname(new URL(import.meta.url).pathname), 'contexts/meta.question-quality.json'));
  writeSpec(out, toKitSpec(meta, 'answerability', atomsAsItems(loadContext(ctx))));
} else {
  console.error(usage);
  process.exit(2);
}
