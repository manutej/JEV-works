/**
 * youtube-spam/prepare.ts — build spec.json from the UCI YouTube Spam Collection, deterministically.
 *
 *   /opt/homebrew/bin/node cookbooks/youtube-spam/prepare.ts
 *
 * Source: https://archive.ics.uci.edu/dataset/380/youtube+spam+collection (CC BY 4.0)
 *   Alberto, Lochter & Almeida (2015), "TubeSpam: Comment Spam Filtering on YouTube", IEEE ICMLA.
 *   1,956 public comments on five 2013–2015 music videos, hand-labelled spam (1) / not spam (0).
 * What we keep: the comment text and which video it was posted under. AUTHOR, COMMENT_ID and DATE are dropped;
 * emails and phone numbers are masked (maskPrivate) before the kit's privacy scan.
 */
import { dedupe, fetchFile, keywordBaseline, maskPrivate, parseCsv, report, shuffle, stratified, unzipText, writeSpecs, type Built, writeStrongBaseline } from '../_shared/lib.ts';
import type { Question } from '../../kit/spec.ts';

const SEED = 20260922;
const URL = 'https://archive.ics.uci.edu/static/public/380/youtube+spam+collection.zip';
const VIDEOS: Record<string, string> = {
  'Youtube01-Psy.csv': 'PSY - Gangnam Style',
  'Youtube02-KatyPerry.csv': 'Katy Perry - Roar',
  'Youtube03-LMFAO.csv': 'LMFAO - Party Rock Anthem',
  'Youtube04-Eminem.csv': 'Eminem - Love the Way You Lie ft. Rihanna',
  'Youtube05-Shakira.csv': 'Shakira - Waka Waka',
};

export const QUESTIONS: Record<string, Question> = {
  // The decision itself, asked directly: labelled, so the kit scores it against the keyword baseline.
  isSpam: {
    type: 'noul',
    instructions: 'Is this YouTube comment spam?',
    criteria: {
      true: 'The comment exists to advertise or promote something (a channel, a website, a product, money-making) or to farm subscribers, likes or views.',
      false: 'The comment is a genuine reaction, opinion, question or conversation, even if it is rude, off-topic or low effort.',
    },
  },
  // Narrow, literal signals (recombined in code by rule.ts; none is labelled).
  asksToVisit: {
    type: 'noul',
    instructions: 'Does the comment ask readers to visit, watch, check out, subscribe to or like something that belongs to the commenter (their channel, video, page, site or product)?',
  },
  mentionsVideo: {
    type: 'noul',
    instructions: 'Does the comment say something about this video, this song or this artist?',
  },
  offersMoney: {
    type: 'noul',
    instructions: 'Does the comment offer money, prizes, free items, gift cards, or a way to earn money?',
  },
  kind: {
    type: 'choice',
    instructions: 'What is this comment mainly doing?',
    criteria: {
      reaction: 'Reacting to the video, song or artist: praise, criticism, a memory, a joke about it',
      promotion: 'Promoting something: a channel, video, website, product, app or offer',
      request: 'Asking readers for subscribers, likes, views or shares, without describing what is being promoted',
      conversation: 'Talking to other commenters or about something unrelated to the video, without promoting anything',
      none: 'None of these: empty, unreadable, only symbols or emoji, or not in a language you can read',
    },
  },
};

const zip = await fetchFile(URL, 'youtube-spam-collection.zip');
type Rec = { text: string; video: string; label: 'spam' | 'ham'; file: string; row: number };
const all: Rec[] = [];
for (const [file, video] of Object.entries(VIDEOS)) {
  parseCsv(unzipText(zip, file)).forEach((r, row) => all.push({ text: maskPrivate(r.CONTENT.replace(/﻿/g, '').trim()), video, label: r.CLASS.trim() === '1' ? 'spam' : 'ham', file, row }));
}
const pool = dedupe(shuffle(all.filter(r => r.text.length > 0), SEED), r => r.text);
console.log(`source: ${all.length} comments, ${pool.length} after dropping empty and duplicate text`);

// Balanced 50/50, matching the corpus (1,005 spam / 951 ham): fit 100, test 150, disjoint by construction.
const fit = stratified(pool, r => r.label, { spam: 50, ham: 50 });
const rest = pool.filter(r => !fit.includes(r));
const test = stratified(rest, r => r.label, { spam: 75, ham: 75 });

const base = keywordBaseline(fit.map(r => ({ text: r.text, label: r.label })));
console.log('baseline keywords:', JSON.stringify(base.keywords));
const build = (r: Rec, i: number, split: 'fit' | 'test'): Built => ({
  id: `${split === 'fit' ? 'f' : 't'}${String(i + 1).padStart(3, '0')}`,
  state: { video: r.video, comment: r.text },
  labels: { isSpam: r.label === 'spam' },
  baseline: split === 'test' ? { isSpam: base.predict(r.text) === 'spam' } : undefined,
  split,
  meta: { source: r.file, sourceRow: r.row },
});
const items = [...shuffle(fit, SEED + 1).map((r, i) => build(r, i, 'fit')), ...shuffle(test, SEED + 2).map((r, i) => build(r, i, 'test'))];
report(items, 'isSpam');
writeSpecs(import.meta.dirname, {
  name: 'youtube-spam',
  description: 'Trust & safety: is a public YouTube comment spam? One direct question plus narrow literal signals recombined in code. UCI YouTube Spam Collection (CC BY 4.0); authors, ids and dates dropped.',
  questions: QUESTIONS, items, baselineName: base.name,
});

// Post-hoc (added after the labelled test run; no Jev calls; never changes a declared verdict): STRONG_BASELINE=1 also
// writes baseline.strong.json, a naive Bayes trained on up to 2,000 labelled source rows that are neither fit nor test.
if (process.env.STRONG_BASELINE) writeStrongBaseline(import.meta.dirname, {
  train: pool.filter(r => !fit.includes(r) && !test.includes(r)),
  test: shuffle(test, SEED + 2).map((rec, i) => ({ id: `t${String(i + 1).padStart(3, '0')}`, rec })),
  textOf: r => r.text, labelOf: r => r.label, toValue: v => v === 'spam', source: 'UCI YouTube Spam Collection, rows not in fit or test', seed: SEED + 9,
});
