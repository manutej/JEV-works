/**
 * P6 corpus — clean vs garbage items for the entropy-separation test (P6-PREREG.md).
 *
 * Deterministic: seeded RNG, no network, no Jev. Re-running produces a byte-identical
 * p6-corpus.json. Every rule below is the one fixed in the pre-registration; if it
 * turns out wrong, that is a finding for the report, not something to tune here.
 *
 *   /opt/homebrew/bin/node program/p6-build-corpus.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT_PATH = new URL('./p6-corpus.json', import.meta.url).pathname;
const SEED = 20260921;
const MAX_CHARS = 4000;

export type P6Question = 'toolKind' | 'docGenre';
export type P6Item = {
  id: string;
  question: P6Question;
  label: 'clean' | 'garbage';
  /** clean: the correct option. garbage: null — there is none by construction. */
  expected: string | null;
  /** clean: source label. garbage: the kind of garbage. */
  kind: string;
  provenance: string;
  text: string;
  textHash: string;
  split: 'fit' | 'test';
};

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/** Split key is the TEXT, so the same text can never sit in both halves (L31). */
const splitOf = (h: string): 'fit' | 'test' => (parseInt(h.slice(0, 8), 16) % 2 === 0 ? 'fit' : 'test');
const nonWs = (s: string) => s.replace(/\s/g, '').length;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];

// ───────────────────────────────────────────────────────────── clean

type TriageItem = { n: number; tool: string; hadSecret: boolean; text: string };
type DocState = { question: string; chunk: string };

const TOOL_LABEL: Record<string, string> = {
  Bash: 'shell_output',
  Read: 'file_contents',
  Write: 'file_changed',
  Edit: 'file_changed',
  SendMessage: 'message_receipt',
};
const TOOL_CAP: Record<string, number> = { shell_output: 40, file_changed: 12, message_receipt: 8, file_contents: Infinity };

async function main() {
  const triage: TriageItem[] = JSON.parse(await readFile(`${ROOT}triage/items2.json`, 'utf8'));
  const docs: DocState[] = JSON.parse(await readFile(`${ROOT}question-bank/doc-relevance-states.json`, 'utf8'));
  const course: string[] = JSON.parse(await readFile(`${ROOT}question-bank/course-qa-states.json`, 'utf8'));

  const items: Omit<P6Item, 'textHash' | 'split'>[] = [];
  const taken: Record<string, number> = {};

  for (const t of triage) {
    const label = TOOL_LABEL[t.tool];
    if (!label || t.hadSecret || nonWs(t.text) < 40) continue;
    if ((taken[label] ?? 0) >= TOOL_CAP[label]) continue;
    taken[label] = (taken[label] ?? 0) + 1;
    items.push({
      id: `toolKind:clean:${t.n}`,
      question: 'toolKind',
      label: 'clean',
      expected: label,
      kind: label,
      provenance: `triage/items2.json#n=${t.n} tool=${t.tool}`,
      text: t.text.slice(0, MAX_CHARS),
    });
  }

  docs.forEach((d, i) =>
    items.push({
      id: `docGenre:clean:doc${i}`,
      question: 'docGenre',
      label: 'clean',
      expected: 'library_docs',
      kind: 'library_docs',
      provenance: `question-bank/doc-relevance-states.json[${i}].chunk`,
      text: d.chunk.slice(0, MAX_CHARS),
    }),
  );

  // A course-qa text sharing an exact 60-char run with a doc chunk is doc-derived: provenance ambiguous.
  const docText = docs.map(d => d.chunk).join('\n\u0000\n');
  const sharesRun = (s: string) => {
    for (let i = 0; i + 60 <= s.length; i++) if (docText.includes(s.slice(i, i + 60))) return true;
    return false;
  };
  const excludedCourse: number[] = [];
  course.forEach((c, i) => {
    if (sharesRun(c)) return void excludedCourse.push(i);
    items.push({
      id: `docGenre:clean:course${i}`,
      question: 'docGenre',
      label: 'clean',
      expected: 'research_note',
      kind: 'research_note',
      provenance: `question-bank/course-qa-states.json[${i}]`,
      text: c.slice(0, MAX_CHARS),
    });
  });

  // ─────────────────────────────────────────────────────────── garbage

  const EMOJI = ['🤷', '🙂', '🔥', '🍕', '🎉', '👀', '🐙', '🌧️', '⚽', '🧀', '🚲', '🪴', '💤', '🦆', '🎈', '🍋'];
  const SCRIPTS: Array<[number, number]> = [
    [0x4e00, 0x9fa5], // CJK
    [0x0430, 0x044f], // Cyrillic lower
    [0x0627, 0x064a], // Arabic
    [0x0905, 0x0939], // Devanagari
  ];
  const LOREM = (
    'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et ' +
    'dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea ' +
    'commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur'
  ).split(' ');
  const OFF_SUBJ = ['My grandmother', 'The recipe', 'Our local team', 'The forecast', 'A neighbour', 'The tomato plant', 'This bakery', 'The referee'];
  const OFF_VERB = ['says', 'suggests', 'promised', 'reminded me', 'claims', 'insisted'];
  const OFF_OBJ = [
    'that the risotto needs another ten minutes of stirring.',
    'rain is likely by Thursday afternoon, clearing on the weekend.',
    'the roses should be pruned before the first frost.',
    'the match was decided by a penalty in extra time.',
    'you can substitute buttermilk with lemon juice and milk.',
    'the hedge along the driveway is far too tall this year.',
    'the marathon route changes to avoid the river bridge.',
    'sourdough rises better in a warm corner of the kitchen.',
  ];

  const emoji = () => Array.from({ length: int(1, 3) }, () => pick(EMOJI)).join('');
  const foreign = () =>
    Array.from({ length: int(3, 7) }, () => {
      const [lo, hi] = pick(SCRIPTS);
      return Array.from({ length: int(2, 6) }, () => String.fromCodePoint(int(lo, hi))).join('');
    }).join(' ');
  const lorem = () =>
    Array.from({ length: int(1, 4) }, () => {
      const w = Array.from({ length: int(6, 14) }, () => pick(LOREM)).join(' ');
      return w[0].toUpperCase() + w.slice(1) + '.';
    }).join(' ');
  const offTopic = () =>
    Array.from({ length: int(1, 3) }, () => `${pick(OFF_SUBJ)} ${pick(OFF_VERB)} ${pick(OFF_OBJ)}`).join(' ');

  const allTexts = [...triage.map(t => t.text), ...docs.map(d => d.chunk), ...course];
  const fragment = () => {
    const src = pick(allTexts.filter(s => nonWs(s) > 20));
    const len = int(2, 8);
    const at = int(0, Math.max(0, src.length - len));
    return src.slice(at, at + len);
  };

  // Wrong-set pools, fixed by the prereg: prose → toolKind; SDK-free tool outputs → docGenre.
  const proseForTool = [
    ...docs.map((d, i) => ({ text: d.chunk, prov: `question-bank/doc-relevance-states.json[${i}].chunk` })),
    ...course.map((c, i) => ({ text: c, prov: `question-bank/course-qa-states.json[${i}]` })),
  ];
  const SDK_WORDS = /jev|sdk|\bai\b|model|embed|tool|api/i;
  const toolForDoc = triage
    .filter(t => !t.hadSecret && t.tool !== 'Agent' && nonWs(t.text) >= 40 && !SDK_WORDS.test(t.text))
    .map(t => ({ text: t.text, prov: `triage/items2.json#n=${t.n} tool=${t.tool}` }));

  const WS = ['   ', '\n\t  \n ', '\t\t\n\n\n'];

  for (const q of ['toolKind', 'docGenre'] as const) {
    let k = 0;
    const add = (kind: string, text: string, provenance = `generated seed=${SEED}`) =>
      items.push({ id: `${q}:garbage:${kind}:${k++}`, question: q, label: 'garbage', expected: null, kind, provenance, text: text.slice(0, MAX_CHARS) });

    add('empty', '');
    WS.forEach(w => add('whitespace', w));
    for (let i = 0; i < 8; i++) add('emoji', emoji());
    for (let i = 0; i < 8; i++) add('fragment', fragment(), `fragment of a corpus text, seed=${SEED}`);
    for (let i = 0; i < 8; i++) add('foreign-noise', foreign());
    for (let i = 0; i < 8; i++) add('lorem', lorem());
    for (let i = 0; i < 10; i++) add('off-topic', offTopic());
    const pool = q === 'toolKind' ? proseForTool : toolForDoc;
    const chosen = new Set<number>();
    while (chosen.size < Math.min(9, pool.length)) chosen.add(Math.floor(rng() * pool.length));
    for (const i of [...chosen].sort((a, b) => a - b)) add('wrong-set', pool[i].text, pool[i].prov);
  }

  const out: P6Item[] = items.map(it => {
    const textHash = sha(it.text);
    return { ...it, textHash, split: splitOf(textHash) };
  });

  // Duplicate (question, text) pairs would double-count one reading.
  const seen = new Set<string>();
  const deduped = out.filter(it => {
    const key = `${it.question}\u0000${it.textHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await writeFile(OUT_PATH, JSON.stringify({ seed: SEED, maxChars: MAX_CHARS, excludedCourseQa: excludedCourse, items: deduped }, null, 2));

  const count = (f: (i: P6Item) => boolean) => deduped.filter(f).length;
  console.log(`wrote ${OUT_PATH}: ${deduped.length} items (${out.length - deduped.length} duplicate (question,text) dropped)`);
  console.log(`course-qa excluded as doc-derived: [${excludedCourse.join(', ')}]`);
  console.log(`wrong-set pool sizes: prose→toolKind ${proseForTool.length}, tool→docGenre ${toolForDoc.length}`);
  for (const q of ['toolKind', 'docGenre'] as const)
    for (const l of ['clean', 'garbage'] as const)
      console.log(`  ${q.padEnd(9)} ${l.padEnd(8)} fit ${count(i => i.question === q && i.label === l && i.split === 'fit')}  test ${count(i => i.question === q && i.label === l && i.split === 'test')}`);
  console.log(`  clean by kind: ${JSON.stringify(Object.fromEntries([...new Set(deduped.filter(i => i.label === 'clean').map(i => i.kind))].map(k => [k, count(i => i.label === 'clean' && i.kind === k)])))}`);
}

main();
