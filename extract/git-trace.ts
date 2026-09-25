/**
 * git-trace.ts — an authoring trace from the git history of an HTML or Markdown file.
 *
 *   node --experimental-strip-types extract/git-trace.ts <repo-dir> <file> --kind page|course --trace-id page:slug [--purpose "..."] [--ship-at sha] [--out trace.jsonl]
 *
 * Walks every commit that touched the file (oldest first), splits each version into units (HTML:
 * <section … id="…">; Markdown: "## " headings), computes metrics in code, and emits one trace event
 * per unit per commit. The action is inferred from the change in the unit's word count: created / cut /
 * shortened (≤ −20%) / expanded (≥ +20%) / edited. Authors are never read; actor is "unknown". No
 * shipped event is invented: pass --ship-at <sha> for the commit that went out. Content is the
 * author's own material; the trace privacy walk (hub/wiring/trace.mjs check) refuses addresses in it.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

export type Unit = { unit: string; heading: string; text: string; metrics: Record<string, number>; has_code_sample: boolean; has_figure: boolean };

const strip = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const EXERCISE = /\b(try it|exercise|your turn|now you|task:|do this)\b/i;

export function metricsOf(raw: string, text: string, html: boolean): Record<string, number> {
  return {
    words: text ? text.split(/\s+/).length : 0,
    bullets: html ? count(raw, /<li\b/gi) : count(raw, /^\s*[-*]\s/gm),
    figures: html ? count(raw, /<(svg|img|figure|canvas)\b/gi) : count(raw, /!\[/g),
    code_samples: html ? count(raw, /<pre\b/gi) : count(raw, /^```/gm) / 2,
    links: html ? count(raw, /<a\s[^>]*href/gi) : count(raw, /\]\(/g),
    headings: html ? Math.max(0, count(raw, /<h[1-6]\b/gi) - 1) : Math.max(0, count(raw, /^#{3,}\s/gm)),
    exercises: count(text, new RegExp(EXERCISE.source, 'gi')),
  };
}

/** Split one version of the file into units. HTML: every <section> with an id (not nested). Markdown: "## " headings. */
export function unitsOf(content: string, file: string): Unit[] {
  const html = /\.html?$/i.test(file);
  const out: Unit[] = [];
  if (html) {
    const re = /<section\b[^>]*\bid="([^"]+)"[^>]*>/gi; let m: RegExpExecArray | null; const starts: Array<{ id: string; at: number; end: number }> = [];
    while ((m = re.exec(content))) starts.push({ id: m[1], at: m.index, end: m.index + m[0].length });
    starts.forEach((s, i) => {
      const close = content.indexOf('</section>', s.end); const next = starts[i + 1]?.at ?? content.length;
      const raw = content.slice(s.end, close >= 0 && close < next ? close : next);
      const h = raw.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i); const text = strip(raw);
      out.push({ unit: s.id, heading: h ? strip(h[1]) : '', text, metrics: metricsOf(raw, text, true), has_code_sample: /<pre\b|<code\b/i.test(raw), has_figure: /<(svg|img|figure|canvas)\b/i.test(raw) });
    });
  } else {
    const parts = content.split(/^(?=## )/m).filter((p) => p.startsWith('## '));
    parts.forEach((p, i) => {
      const heading = p.split('\n')[0].replace(/^##\s*/, '').trim(); const body = p.split('\n').slice(1).join('\n'); const text = body.replace(/\s+/g, ' ').trim();
      out.push({ unit: heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `section-${i + 1}`, heading, text, metrics: metricsOf(body, text, false), has_code_sample: /```/.test(body), has_figure: /!\[/.test(body) });
    });
  }
  return out;
}

export function inferAction(prevWords: number | undefined, words: number): string {
  if (prevWords === undefined) return 'created';
  if (prevWords === 0) return words ? 'expanded' : 'edited';
  const d = (words - prevWords) / prevWords;
  return d <= -0.2 ? 'shortened' : d >= 0.2 ? 'expanded' : 'edited';
}

export function traceFromGit(repo: string, file: string, opts: { kind: 'page' | 'course'; traceId: string; purpose?: string; shipAt?: string; textMax?: number }) {
  const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const log = git('log', '--reverse', '--format=%H %cI', '--', file).trim().split('\n').filter(Boolean).map((l) => { const [sha, ts] = l.split(' '); return { sha, ts }; });
  const events: Record<string, unknown>[] = []; let seq = 0; let prev = new Map<string, Unit>();
  const textMax = opts.textMax ?? 1500;
  for (const { sha, ts } of log) {
    let content = ''; try { content = git('show', `${sha}:${file}`); } catch { content = ''; }
    const units = unitsOf(content, file); const now = new Map(units.map((u) => [u.unit, u]));
    const ship = opts.shipAt && sha.startsWith(opts.shipAt);
    for (const u of units) {
      const p = prev.get(u.unit); const action = ship ? 'shipped' : inferAction(p?.metrics.words, u.metrics.words);
      const text = u.text.length > textMax ? u.text.slice(0, textMax) + ' …' : u.text;
      const state = opts.kind === 'page' ? { heading: u.heading, text, has_code_sample: u.has_code_sample, has_figure: u.has_figure, page_purpose: opts.purpose ?? '' } : { state: (u.heading ? u.heading + '\n\n' : '') + text };
      events.push({ schema_version: '0.1.0', trace_id: opts.traceId, kind: opts.kind, unit: u.unit, seq: seq++, ts, stage: ship ? 'ship' : p ? 'revise' : 'draft', actor: 'unknown', action, state, metrics: u.metrics, source: { repo: path.basename(repo), path: file, commit: sha.slice(0, 7) }, note: p ? `words ${p.metrics.words} → ${u.metrics.words}` : null });
    }
    for (const [id, p] of prev) if (!now.has(id)) events.push({ schema_version: '0.1.0', trace_id: opts.traceId, kind: opts.kind, unit: id, seq: seq++, ts, stage: 'revise', actor: 'unknown', action: 'cut', state: opts.kind === 'page' ? { heading: p.heading, text: '', has_code_sample: false, has_figure: false, page_purpose: opts.purpose ?? '' } : { state: '' }, metrics: { words: 0 }, source: { repo: path.basename(repo), path: file, commit: sha.slice(0, 7) }, note: `cut (had ${p.metrics.words} words)` });
    prev = now;
  }
  return { commits: log.length, events };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const [, , repo, file, ...args] = process.argv;
  const flag = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const kind = flag('--kind') as 'page' | 'course' | undefined; const traceId = flag('--trace-id');
  if (!repo || !file || !kind || !traceId) { console.error('usage: git-trace.ts <repo-dir> <file> --kind page|course --trace-id kind:slug [--purpose "..."] [--ship-at sha] [--out trace.jsonl]'); process.exit(1); }
  const { commits, events } = traceFromGit(repo, file, { kind, traceId, purpose: flag('--purpose'), shipAt: flag('--ship-at') });
  const out = flag('--out');
  if (out) { writeFileSync(out, events.map((e) => JSON.stringify(e)).join('\n') + '\n'); console.error(`${commits} commits → ${events.length} events → ${out}`); }
  else console.log(events.map((e) => JSON.stringify(e)).join('\n'));
}
