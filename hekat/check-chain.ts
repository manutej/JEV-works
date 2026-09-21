/**
 * Make a HEKAT chain checkable before it runs.
 *
 * Today `[R→D→I]` is free text in a prompt template: nothing stops
 * `[I→R]` (implement from nothing, then research), and nothing notices that
 * `[C→D]` feeds a severity *level* into a step expecting a spec. HEKAT's own docs
 * assert composition is licensed by tensor structure —
 * `F(OBSERVE) = category-master ⊗ systems-thinking ⊗ abstraction-principles` — but
 * assert it in prose, with no checker. This is the checker.
 *
 * fp-ts earns its place here and only here: a validation that either yields a typed
 * chain or a list of violations is exactly `Either`. It is not used decoratively
 * elsewhere — note that `cc2.0` already depends on fp-ts and exactly one file
 * imports it, imported by nothing, which is the failure mode to avoid.
 *
 *   node hekat/check-chain.ts '[R→D→I]'
 *   node hekat/check-chain.ts '[R||A]→S→D'
 */
import * as E from 'fp-ts/lib/Either.js';
import { pipe } from 'fp-ts/lib/function.js';
import { HOTKEYS, artifact, type HotkeySpec, type OutColor } from './hotkeys.ts';
import { FORBIDDEN_COERCIONS, LICENSED_COERCIONS, type Color } from '../question-bank/colors.ts';

export type Violation = { at: string; why: string };

/** One step in a chain: a single hotkey, or a parallel group of them. */
export type Step = { kind: 'op'; spec: HotkeySpec } | { kind: 'par'; specs: HotkeySpec[] };

const colorName = (o: OutColor): string => o.color;

// ─────────────────────────────────────────────────────────────── parsing

/**
 * Parses the three notations HEKAT's docs use interchangeably:
 *   sequential  [R→D→I]   or  R>D>I
 *   parallel    [R||D||A]
 *   iterative   [R>=>D>=>I]   (Kleisli-flavoured; treated as sequential for typing —
 *               iteration repeats a chain, it does not change what each step consumes)
 */
export function parseChain(input: string): E.Either<Violation[], Step[]> {
  const cleaned = input.trim().replace(/^\[|\]$/g, '');
  const segments = cleaned
    .split(/>=>|→|->|>/)
    .map(s => s.trim().replace(/^\[|\]$/g, ''))
    .filter(Boolean);

  if (segments.length === 0) {
    return E.left([{ at: input, why: 'empty chain' }]);
  }

  const violations: Violation[] = [];
  const steps: Step[] = [];

  for (const seg of segments) {
    const keys = seg.split(/\|\||\|/).map(s => s.trim()).filter(Boolean);
    const specs: HotkeySpec[] = [];
    for (const k of keys) {
      const spec = HOTKEYS[k.toUpperCase()];
      if (!spec) {
        violations.push({ at: k, why: `unknown hotkey "${k}" — known: ${Object.keys(HOTKEYS).join(' ')}` });
        continue;
      }
      specs.push(spec);
    }
    if (specs.length === 0) continue;
    steps.push(specs.length === 1 ? { kind: 'op', spec: specs[0] } : { kind: 'par', specs });
  }

  return violations.length ? E.left(violations) : E.right(steps);
}

// ────────────────────────────────────────────────────────────── checking

/** Does a step accept what the previous step produced? */
function accepts(spec: HotkeySpec, upstream: OutColor[]): Violation | null {
  if (spec.accepts.length === 0) return null; // a source; needs no input
  if (upstream.length === 0) {
    return {
      at: spec.key,
      why: `[${spec.key}] ${spec.name} consumes ${spec.accepts.join(' or ')} but nothing precedes it`,
    };
  }
  const names = upstream.map(colorName);
  const ok = names.some(n => (spec.accepts as string[]).includes(n));
  if (ok) return null;

  // Is the mismatch a coercion the decision algebra explicitly forbids? That is a
  // sharper error than "type mismatch", so report it with its reason.
  for (const up of upstream) {
    if (up.kind !== 'decision') continue;
    for (const want of spec.accepts) {
      const forbidden = FORBIDDEN_COERCIONS.find(f => f.from === up.color && f.to === (want as Color));
      if (forbidden) {
        return { at: spec.key, why: `${up.color} → ${want} is forbidden: ${forbidden.why}` };
      }
      const licensed = LICENSED_COERCIONS.find(l => l.from === up.color && l.to === (want as Color));
      if (licensed) return null;
    }
  }

  return {
    at: spec.key,
    why: `[${spec.key}] ${spec.name} consumes ${spec.accepts.join(' or ')} but receives ${names.join(' + ')}`,
  };
}

export function checkChain(steps: readonly Step[]): E.Either<Violation[], { steps: Step[]; produces: OutColor[] }> {
  const violations: Violation[] = [];
  // A chain is never handed nothing: the user's request is the implicit first input.
  let upstream: OutColor[] = [artifact('Query')];

  for (const step of steps) {
    const specs = step.kind === 'op' ? [step.spec] : step.specs;
    for (const spec of specs) {
      const v = accepts(spec, upstream);
      if (v) violations.push(v);
    }
    // A parallel group emits everything its members emit.
    upstream = specs.map(s => s.produces);
  }

  return violations.length ? E.left(violations) : E.right({ steps: [...steps], produces: upstream });
}

/** Parse then check, short-circuiting on parse failure. */
export const validate = (input: string) => pipe(parseChain(input), E.chain(checkChain));

// ─────────────────────────────────────────────────────────────────── CLI

if (process.argv[2]) {
  const input = process.argv[2];
  const describe = (s: Step) =>
    s.kind === 'op'
      ? `[${s.spec.key}] ${s.spec.name} → ${colorName(s.spec.produces)}`
      : `(${s.specs.map(x => `[${x.key}] ${x.name}`).join(' || ')}) → ${s.specs.map(x => colorName(x.produces)).join(' + ')}`;

  console.log(`chain  ${input}\n`);
  pipe(
    validate(input),
    E.match(
      vs => {
        console.log(`ILLEGAL — ${vs.length} violation${vs.length > 1 ? 's' : ''}:`);
        for (const v of vs) console.log(`  ✗ at ${v.at}: ${v.why}`);
        process.exitCode = 1;
      },
      ok => {
        console.log('LEGAL');
        for (const s of ok.steps) console.log(`  ${describe(s)}`);
        console.log(`\nfinal output  ${ok.produces.map(colorName).join(' + ')}`);
        const judgements = ok.steps
          .flatMap(s => (s.kind === 'op' ? [s.spec] : s.specs))
          .filter(sp => sp.jevSubstitutable);
        if (judgements.length) {
          console.log('\njudgement-producing steps — candidates for a typed-decision call:');
          for (const j of judgements) console.log(`  [${j.key}] ${j.name}: ${j.jevSubstitutable}`);
        }
      },
    ),
  );
}
