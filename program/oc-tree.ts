/**
 * OC gate — the frozen question trees, their compose rules and the four collapses. No model calls here.
 *
 * The trees live in `.toq/<slug>/toq.yaml` and are frozen by SHA-256 in `.toq/FROZEN.sha256`. This module
 * verifies the hash before parsing and refuses a mismatch, so the run can only ever read the frozen text.
 * There is no YAML dependency in this repo (and no `npm install` in a shared tree), so the parser below reads
 * exactly the depth-3 shape the three trees share and asserts it: root R, internal M*, leaves L* in flow maps.
 *
 * Collapses (tier "deep", k = 4, each one fresh Jev call per item):
 *   direct      ask R alone
 *   mid         ask every M in one call, compose to R
 *   decomposed  ask every L in one call, compose to each M, then to R
 *   highrisk    ask the high-risk edge's M directly plus the other Ms' leaves in one call, compose to R
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const TOQ_DIR = new URL('../.toq/', import.meta.url).pathname;
export const SLUGS = ['hotpot-type', 'leads-qualified', 'doc-admit'] as const;
export type Slug = (typeof SLUGS)[number];
export const COLLAPSES = ['direct', 'mid', 'decomposed', 'highrisk'] as const;
export type Collapse = (typeof COLLAPSES)[number];

/** Declared equivalence for every tree: bool-exact after thresholding a noul p at 0.5 (p ≥ 0.5 → true). */
export const THRESHOLD = 0.5;
export const toBool = (p: number) => p >= THRESHOLD;

export type Leaf = { id: string; text: string };
export type Mid = { id: string; text: string; compose: string; children: Leaf[] };
export type Tree = {
  slug: Slug;
  sha256: string;
  state: string;
  root: { id: 'R'; text: string; compose: string; children: Mid[] };
  highRiskEdge: string;
  /** The M node whose edge to R is the declared high-risk edge. */
  highRiskMid: string;
};

// ───────────────────────────────────────────────────────── frozen-hash check

export function frozenHashes(): Map<string, string> {
  const lines = readFileSync(TOQ_DIR + 'FROZEN.sha256', 'utf8').split('\n').filter(l => l.trim());
  return new Map(lines.map(l => { const [h, f] = l.trim().split(/\s+/); return [f, h]; }));
}

/** Throws unless every tree's bytes hash to the value in FROZEN.sha256. */
export function verifyFrozen(): Record<Slug, string> {
  const want = frozenHashes();
  const out = {} as Record<Slug, string>;
  for (const slug of SLUGS) {
    const rel = `${slug}/toq.yaml`;
    const got = createHash('sha256').update(readFileSync(TOQ_DIR + rel)).digest('hex');
    if (want.get(rel) !== got) throw new Error(`FROZEN hash mismatch for ${rel}: file ${got}, FROZEN ${want.get(rel)} — abort`);
    out[slug] = got;
  }
  return out;
}

// ───────────────────────────────────────────────────────── parser (this shape only)

const unquote = (s: string) => {
  s = s.replace(/\s+#.*$/, '').trim();
  return s.startsWith('"') ? JSON.parse(s) as string : s;
};

export function loadTree(slug: Slug): Tree {
  const text = readFileSync(`${TOQ_DIR}${slug}/toq.yaml`, 'utf8');
  const sha256 = createHash('sha256').update(text).digest('hex');
  const lines = text.split('\n');
  const top = (key: string) => {
    const l = lines.find(x => x.startsWith(`${key}:`));
    if (!l) throw new Error(`${slug}: missing top-level ${key}`);
    return unquote(l.slice(key.length + 1));
  };
  if (top('slug') !== slug) throw new Error(`${slug}: slug field is ${top('slug')}`);
  if (top('total_collapse_verified') !== 'true') throw new Error(`${slug}: total_collapse_verified is not true — gate undefined`);
  if (!/equivalence: bool-exact-at-0\.5/.test(top('answer_space'))) throw new Error(`${slug}: equivalence is not bool-exact-at-0.5`);

  type Internal = { id: string; text?: string; compose?: string; children: Leaf[] };
  const internals: Internal[] = [];
  for (const l of lines) {
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^\s*(?:- )?id: (\w+)\s*$/))) internals.push({ id: m[1], children: [] });
    else if ((m = l.match(/^\s*- \{id: (\w+), text: (".*")\}\s*$/))) internals.at(-1)!.children.push({ id: m[1], text: JSON.parse(m[2]) });
    else if ((m = l.match(/^\s+text: (.*)$/))) internals.at(-1)!.text = unquote(m[1]);
    else if ((m = l.match(/^\s+compose: (.*)$/))) internals.at(-1)!.compose = unquote(m[1]);
  }
  const [r, ...ms] = internals;
  if (r?.id !== 'R' || r.children.length) throw new Error(`${slug}: root must be R with no direct leaves`);
  const mids: Mid[] = ms.map(m => {
    if (!/^M\d$/.test(m.id) || !m.text || !m.compose || !m.children.length) throw new Error(`${slug}: bad internal node ${m.id}`);
    return { id: m.id, text: m.text, compose: m.compose, children: m.children };
  });
  const tree: Tree = {
    slug,
    sha256,
    state: top('state'),
    root: { id: 'R', text: r.text!, compose: r.compose!, children: mids },
    highRiskEdge: top('high_risk_edge'),
    highRiskMid: top('high_risk_edge').split('-')[0],
  };
  // Every compose rule must mention exactly its children, so a typo cannot silently drop a node.
  const check = (node: string, rule: string, kids: string[]) => {
    const used = [...new Set(rule.match(/[A-Z]\d/g))].sort();
    if (used.join() !== [...kids].sort().join()) throw new Error(`${slug}: ${node} compose "${rule}" uses ${used}, children are ${kids}`);
    compose(rule, Object.fromEntries(kids.map(k => [k, true]))); // parses
  };
  check('R', tree.root.compose, mids.map(m => m.id));
  for (const m of mids) check(m.id, m.compose, m.children.map(c => c.id));
  if (!mids.some(m => m.id === tree.highRiskMid) || !tree.highRiskEdge.endsWith('-R')) throw new Error(`${slug}: high_risk_edge ${tree.highRiskEdge} is not an M-R edge`);
  return tree;
}

// ───────────────────────────────────────────────────────── compose: AND / OR / parens, AND binds tighter

export function compose(rule: string, v: Record<string, boolean>): boolean {
  const toks = rule.match(/\(|\)|AND|OR|[A-Z]\d/g) ?? [];
  if (toks.join('') !== rule.replace(/\s+/g, '')) throw new Error(`unparseable compose rule "${rule}"`);
  let i = 0;
  const atom = (): boolean => {
    const t = toks[i++];
    if (t === '(') { const x = or(); if (toks[i++] !== ')') throw new Error(`unbalanced "${rule}"`); return x; }
    if (!t || !(t in v)) throw new Error(`compose "${rule}": no value for ${t}`);
    return v[t];
  };
  const and = (): boolean => { let x = atom(); while (toks[i] === 'AND') { i++; const y = atom(); x = x && y; } return x; };
  const or = (): boolean => { let x = and(); while (toks[i] === 'OR') { i++; const y = and(); x = x || y; } return x; };
  const out = or();
  if (i !== toks.length) throw new Error(`trailing tokens in "${rule}"`);
  return out;
}

// ───────────────────────────────────────────────────────── collapses

/** The node ids each collapse asks in its single call. */
export function askedNodes(t: Tree, c: Collapse): string[] {
  const mids = t.root.children;
  switch (c) {
    case 'direct': return ['R'];
    case 'mid': return mids.map(m => m.id);
    case 'decomposed': return mids.flatMap(m => m.children.map(l => l.id));
    case 'highrisk': return mids.flatMap(m => (m.id === t.highRiskMid ? [m.id] : m.children.map(l => l.id)));
  }
}

/** Edges collapsed by each collapse, in the skill's childId-parentId syntax. */
export function collapsedEdges(t: Tree, c: Collapse): string[] | 'all' {
  const mids = t.root.children;
  const leafEdges = (m: Mid) => m.children.map(l => `${l.id}-${m.id}`);
  switch (c) {
    case 'direct': return 'all';
    case 'mid': return mids.flatMap(leafEdges);
    case 'decomposed': return [];
    case 'highrisk': return leafEdges(mids.find(m => m.id === t.highRiskMid)!);
  }
}

export const nodeText = (t: Tree): Record<string, string> => ({
  R: t.root.text,
  ...Object.fromEntries(t.root.children.flatMap(m => [[m.id, m.text], ...m.children.map(l => [l.id, l.text])])),
});

/** Thresholded answers for the asked nodes → every M and R that collapse determines. */
export function resolve(t: Tree, c: Collapse, asked: Record<string, boolean>): { R: boolean; M: Record<string, boolean> } {
  if (c === 'direct') return { R: asked.R, M: {} };
  const M: Record<string, boolean> = {};
  for (const m of t.root.children) M[m.id] = m.id in asked ? asked[m.id] : compose(m.compose, asked);
  return { R: compose(t.root.compose, M), M };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const h = verifyFrozen();
  for (const s of SLUGS) {
    const t = loadTree(s);
    console.log(`${s}  sha ${h[s].slice(0, 12)}  R = ${t.root.compose}  high-risk ${t.highRiskEdge}`);
    for (const c of COLLAPSES) console.log(`   ${c.padEnd(10)} asks ${askedNodes(t, c).join(',')}  collapsed ${JSON.stringify(collapsedEdges(t, c))}`);
  }
}
