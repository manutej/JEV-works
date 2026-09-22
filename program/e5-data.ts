/**
 * E5 — masked targets: data, splits, privacy scan and the naive-Bayes baseline. No model calls here.
 *
 * Three real categorical fields that nobody on this team planted are hidden and predicted from the
 * rest of the record (PROGRAM.md, Escape A). This module turns each source file into items:
 *
 *   hotpot   HotpotQA dev-distractor sample, `type` (bridge | comparison) from `question` only
 *   housing  Kaggle Housing.csv, `furnishingstatus` (3 classes) from every other column
 *   faf      FAF6.0 State, `trade_type` (1 | 2 | 3) from every other column, 600 rows sampled
 *
 * Split: sha256(`e5:<SEED>:split:<target>:<key>`) → the top 32 bits as a fraction; < 0.5 is FIT,
 * otherwise TEST. The key is HotpotQA's `_id`, or the 0-based data-row index for the CSVs. Test is
 * capped at 300 by keeping the 300 test items with the smallest sha256(`e5:<SEED>:cap:…`).
 * FAF sample: the 600 data rows with the smallest sha256(`e5:<SEED>:sample:faf:<rowIndex>`), read in
 * two streaming passes (the 23 MB file is never held as one string).
 *
 *   /opt/homebrew/bin/node program/e5-data.ts            # print split, disjointness and privacy stats
 *   /opt/homebrew/bin/node program/e5-data.ts --fit      # also print FIT-half examples (for the prereg)
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

export const SEED = 20260922;
export const TEST_CAP = 300;
export const FAF_SAMPLE = 600;

export const PATHS = {
  hotpot:
    '/Users/manu/Downloads/224415-GAI-2201 2/GAI-2201-1.0.3-Supporting/LabFiles/a-b-testing-strategy-pt2-evaluation/solutions/hotpot_dev_distractor_v1_sample.json',
  housing: '/Users/manu/Downloads/Housing.csv',
  faf: '/Users/manu/Downloads/FAF6.0_State/FAF6.0_State.csv',
} as const;

export type TargetName = keyof typeof PATHS;
export type Item = {
  id: string;
  label: string;
  /** Exactly what Jev is sent. */
  state: Record<string, string | number>;
  /** What the naive-Bayes baseline sees. */
  tokens: string[];
  split: 'fit' | 'test';
};
export type Target = {
  name: TargetName;
  field: string;
  classes: string[];
  items: Item[];
  fit: Item[];
  test: Item[];
  /** Test items beyond the cap, never scored. */
  testDropped: number;
  disjointness: { keyOverlap: number; stateOverlap: number };
  privacy: { scanned: number; hits: { id: string; kind: string; match: string }[] };
  sampling?: string;
};

const unit = (s: string) => parseInt(createHash('sha256').update(s).digest('hex').slice(0, 8), 16) / 2 ** 32;

// ───────────────────────────────────────────────────────── privacy scan

const PRIVACY: [string, RegExp][] = [
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['phone', /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/],
  ['phone', /\+\d{8,15}\b/],
  ['phone', /\b\d{10,}\b/],
  ['credential', /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/],
  ['credential', /\bAKIA[0-9A-Z]{16}\b/],
  ['credential', /\b(?:api[_-]?key|secret|passw(?:or)?d|bearer|token)\b\s*[:=]/i],
  ['credential', /[A-Za-z0-9+/_-]{40,}/],
];

export function scanState(state: Record<string, unknown>): { kind: string; match: string }[] {
  const s = Object.entries(state).map(([k, v]) => `${k}: ${v}`).join('\n');
  return PRIVACY.flatMap(([kind, re]) => {
    const m = s.match(re);
    return m ? [{ kind, match: m[0].slice(0, 40) }] : [];
  });
}

// ───────────────────────────────────────────────────────── naive Bayes (mirrors q4-baselines.ts)

export const textTokens = (s: string) => s.toLowerCase().match(/[a-z0-9_]+|[^\sa-z0-9_]/g) ?? [];

/** Multinomial NB, Laplace α = 1, ties to the first class in sorted order. */
export function trainNB(items: readonly Item[]) {
  const classes = [...new Set(items.map(i => i.label))].sort();
  const docs = new Map(classes.map(c => [c, 0]));
  const counts = new Map(classes.map(c => [c, new Map<string, number>()]));
  const totals = new Map(classes.map(c => [c, 0]));
  const vocab = new Set<string>();
  for (const it of items) {
    docs.set(it.label, docs.get(it.label)! + 1);
    const m = counts.get(it.label)!;
    for (const w of it.tokens) {
      vocab.add(w);
      m.set(w, (m.get(w) ?? 0) + 1);
      totals.set(it.label, totals.get(it.label)! + 1);
    }
  }
  return (tokens: readonly string[]) => {
    let best = classes[0];
    let bestLp = -Infinity;
    for (const c of classes) {
      let lp = Math.log(docs.get(c)! / items.length);
      const m = counts.get(c)!;
      const denom = totals.get(c)! + vocab.size;
      for (const w of tokens) lp += Math.log(((m.get(w) ?? 0) + 1) / denom);
      if (lp > bestLp) { bestLp = lp; best = c; }
    }
    return best;
  };
}

export function majorityOf(xs: readonly string[]): string {
  const c = new Map<string, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

// ───────────────────────────────────────────────────────── tabular tokens

type Row = Record<string, string>;
const isNum = (v: string) => v !== '' && Number.isFinite(Number(v));

/**
 * "col=value" tokens. A declared quantity column whose fit-half values are all numeric with more than 10
 * distinct values is binned by the fit half's quartiles (q0..q3); every other column — including numeric
 * CODES such as FAF state or commodity numbers — is a categorical token as-is (empty cell → "col=").
 */
function tabularTokenizer(fitRows: readonly Row[], cols: readonly string[], quantities: readonly string[]) {
  const cuts = new Map<string, number[]>();
  for (const c of cols.filter(c => quantities.includes(c))) {
    const vals = fitRows.map(r => r[c]);
    if (!vals.every(isNum) || new Set(vals).size <= 10) continue;
    const xs = vals.map(Number).sort((a, b) => a - b);
    cuts.set(c, [0.25, 0.5, 0.75].map(q => xs[Math.floor(q * (xs.length - 1))]));
  }
  const tok = (r: Row) =>
    cols.map(c => {
      const q = cuts.get(c);
      if (!q || !isNum(r[c])) return `${c}=${r[c]}`;
      return `${c}=q${q.filter(x => Number(r[c]) > x).length}`;
    });
  return { tok, binned: Object.fromEntries([...cuts].map(([c, q]) => [c, q])) };
}

function parseCsvLine(line: string): string[] {
  // Both CSVs are plain: no quoted fields (checked by the column-count assertion below).
  return line.replace(/\r$/, '').split(',');
}

// ───────────────────────────────────────────────────────── FAF code tables (FAF6_Metadata.xlsx, transcribed)

const STATE: Record<string, string> = {"01": "Alabama", "02": "Alaska", "04": "Arizona", "05": "Arkansas", "06": "California", "08": "Colorado", "09": "Connecticut", "10": "Delaware", "11": "Washington DC", "12": "Florida", "13": "Georgia", "15": "Hawaii", "16": "Idaho", "17": "Illinois", "18": "Indiana", "19": "Iowa", "20": "Kansas", "21": "Kentucky", "22": "Louisiana", "23": "Maine", "24": "Maryland", "25": "Massachusetts", "26": "Michigan", "27": "Minnesota", "28": "Mississippi", "29": "Missouri", "30": "Montana", "31": "Nebraska", "32": "Nevada", "33": "New Hampshire", "34": "New Jersey", "35": "New Mexico", "36": "New York", "37": "North Carolina", "38": "North Dakota", "39": "Ohio", "40": "Oklahoma", "41": "Oregon", "42": "Pennsylvania", "44": "Rhode Island", "45": "South Carolina", "46": "South Dakota", "47": "Tennessee", "48": "Texas", "49": "Utah", "50": "Vermont", "51": "Virginia", "53": "Washington", "54": "West Virginia", "55": "Wisconsin", "56": "Wyoming"};
const FOREIGN: Record<string, string> = {"801": "Canada", "802": "Mexico", "803": "Rest of Americas", "804": "Europe", "805": "Africa", "806": "SW & Central Asia", "807": "Eastern Asia", "808": "SE Asia & Oceania"};
const SCTG2: Record<string, string> = {"01": "Live animals/fish", "02": "Cereal grains", "03": "Other ag prods.", "04": "Animal feed", "05": "Meat/seafood", "06": "Milled grain prods.", "07": "Other foodstuffs", "08": "Alcoholic beverages", "09": "Tobacco prods.", "10": "Building stone", "11": "Natural sands", "12": "Gravel", "13": "Nonmetallic minerals", "14": "Metallic ores", "15": "Coal", "16": "Crude petroleum", "17": "Gasoline", "18": "Fuel oils", "19": "Natural gas and other fossil products", "20": "Basic chemicals", "21": "Pharmaceuticals", "22": "Fertilizers", "23": "Chemical prods.", "24": "Plastics/rubber", "25": "Logs", "26": "Wood prods.", "27": "Newsprint/paper", "28": "Paper articles", "29": "Printed prods.", "30": "Textiles/leather", "31": "Nonmetal min. prods.", "32": "Base metals", "33": "Articles-base metal", "34": "Machinery", "35": "Electronics", "36": "Motorized vehicles", "37": "Transport equip.", "38": "Precision instruments", "39": "Furniture", "40": "Misc. mfg. prods.", "41": "Waste/scrap", "43": "Mixed freight"};
const MODE: Record<string, string> = {"1": "Truck (include customer pick-up)", "2": "Rail", "3": "Water", "4": "Air (include truck-air)", "5": "Multiple modes & mail", "6": "Pipeline", "7": "Other and unknown", "8": "No domestic mode"};

const decode = (table: Record<string, string>, v: string) => (v === '' ? 'none' : table[v] ?? `unknown code ${v}`);

/** The FAF row as Jev sees it: every code decoded through the data dictionary, units from it too. */
function fafState(r: Row): Record<string, string | number> {
  return {
    foreign_origin_region: decode(FOREIGN, r.fr_orig),
    domestic_origin_state: decode(STATE, r.dms_origst),
    domestic_destination_state: decode(STATE, r.dms_destst),
    foreign_destination_region: decode(FOREIGN, r.fr_dest),
    mode_from_foreign_origin_into_us: decode(MODE, r.fr_inmode),
    domestic_mode: decode(MODE, r.dms_mode),
    mode_from_us_to_foreign_destination: decode(MODE, r.fr_outmode),
    commodity: decode(SCTG2, r.sctg2),
    thousand_short_tons_2022: Number(r.tons_2022),
    million_dollars_2022: Number(r.value_2022),
  };
}

// ───────────────────────────────────────────────────────── loaders

type Raw = { id: string; key: string; label: string; state: Record<string, string | number>; row?: Row; text?: string };

async function loadHotpot(): Promise<Raw[]> {
  const rows: any[] = JSON.parse(await readFile(PATHS.hotpot, 'utf8'));
  // State is the question text only — never answer, supporting_facts or context.
  return rows.map(r => ({ id: `hotpot:${r._id}`, key: String(r._id), label: String(r.type), state: { question: String(r.question) }, text: String(r.question) }));
}

async function readCsv(path: string, keep?: (i: number) => boolean): Promise<{ header: string[]; rows: { i: number; row: Row }[]; total: number }> {
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  let header: string[] | null = null;
  const rows: { i: number; row: Row }[] = [];
  let i = -1;
  for await (const line of rl) {
    if (!header) { header = parseCsvLine(line); continue; }
    if (line.trim() === '') continue;
    i++;
    if (keep && !keep(i)) continue;
    const vals = parseCsvLine(line);
    if (vals.length !== header.length) throw new Error(`${path} row ${i}: ${vals.length} fields, header has ${header.length}`);
    rows.push({ i, row: Object.fromEntries(header.map((h, k) => [h, vals[k]])) });
  }
  return { header: header!, rows, total: i + 1 };
}

async function loadHousing(): Promise<{ raws: Raw[]; cols: string[] }> {
  const { header, rows } = await readCsv(PATHS.housing);
  const cols = header.filter(h => h !== 'furnishingstatus');
  return {
    cols,
    raws: rows.map(({ i, row }) => ({
      id: `housing:${i}`,
      key: String(i),
      label: row.furnishingstatus,
      state: Object.fromEntries(cols.map(c => [c, isNum(row[c]) ? Number(row[c]) : row[c]])),
      row,
    })),
  };
}

async function loadFaf(): Promise<{ raws: Raw[]; cols: string[]; total: number }> {
  // Pass 1: hash every data-row index, keep the FAF_SAMPLE smallest. Pass 2: read just those rows.
  const hs: [number, number][] = [];
  const counted = await readCsv(PATHS.faf, i => { hs.push([unit(`e5:${SEED}:sample:faf:${i}`), i]); return false; });
  hs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const chosen = new Set(hs.slice(0, FAF_SAMPLE).map(([, i]) => i));
  const { header, rows } = await readCsv(PATHS.faf, i => chosen.has(i));
  const cols = header.filter(h => h !== 'trade_type');
  return {
    total: counted.total,
    cols,
    raws: rows.map(({ i, row }) => ({ id: `faf:${i}`, key: String(i), label: row.trade_type, state: fafState(row), row })),
  };
}

// ───────────────────────────────────────────────────────── build

function finish(name: TargetName, field: string, raws: Raw[], tokens: (r: Raw, fitRaws: Raw[]) => string[], sampling?: string): Target {
  const splitOf = (r: Raw) => (unit(`e5:${SEED}:split:${name}:${r.key}`) < 0.5 ? 'fit' : 'test') as Item['split'];
  const fitRaws = raws.filter(r => splitOf(r) === 'fit');
  const tok = (r: Raw) => tokens(r, fitRaws);
  const items: Item[] = raws.map(r => ({ id: r.id, label: r.label, state: r.state, tokens: tok(r), split: splitOf(r) }));
  const fit = items.filter(i => i.split === 'fit');
  const testAll = items
    .filter(i => i.split === 'test')
    .map(i => [unit(`e5:${SEED}:cap:${name}:${i.id}`), i] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([, i]) => i);
  const test = testAll.slice(0, TEST_CAP);

  const fitIds = new Set(fit.map(i => i.id));
  const fitStates = new Set(fit.map(i => JSON.stringify(i.state)));
  const privacyHits = items.flatMap(i => scanState(i.state).map(h => ({ id: i.id, ...h })));
  return {
    name,
    field,
    classes: [...new Set(items.map(i => i.label))].sort(),
    items,
    fit,
    test,
    testDropped: testAll.length - test.length,
    disjointness: {
      keyOverlap: test.filter(i => fitIds.has(i.id)).length,
      /** Test items whose exact state also occurs in the fit half — informational, not a key collision. */
      stateOverlap: test.filter(i => fitStates.has(JSON.stringify(i.state))).length,
    },
    privacy: { scanned: items.length, hits: privacyHits },
    sampling,
  };
}

export type Built = Record<TargetName, Target> & { meta: { fafRowsTotal: number; binned: Record<string, Record<string, number[]>> } };

export async function buildTargets(): Promise<Built> {
  const hotpot = finish('hotpot', 'type', await loadHotpot(), r => textTokens(r.text!));

  const h = await loadHousing();
  let housingBins: Record<string, number[]> = {};
  const housing = finish('housing', 'furnishingstatus', h.raws, (r, fitRaws) => {
    const t = tabularTokenizer(fitRaws.map(x => x.row!), h.cols, ['price', 'area', 'bedrooms', 'bathrooms', 'stories', 'parking']);
    housingBins = t.binned;
    return t.tok(r.row!);
  });

  const f = await loadFaf();
  let fafBins: Record<string, number[]> = {};
  const faf = finish(
    'faf',
    'trade_type',
    f.raws,
    (r, fitRaws) => {
      const t = tabularTokenizer(fitRaws.map(x => x.row!), f.cols, ['tons_2022', 'value_2022']);
      fafBins = t.binned;
      return t.tok(r.row!);
    },
    `${FAF_SAMPLE} of ${f.total} data rows: the ${FAF_SAMPLE} smallest sha256("e5:${SEED}:sample:faf:<0-based data-row index>"), two streaming passes`,
  );
  return { hotpot, housing, faf, meta: { fafRowsTotal: f.total, binned: { housing: housingBins, faf: fafBins } } };
}

// ───────────────────────────────────────────────────────── CLI

if (import.meta.url === `file://${process.argv[1]}`) {
  const b = await buildTargets();
  for (const t of [b.hotpot, b.housing, b.faf]) {
    const dist = (xs: Item[]) => Object.fromEntries(t.classes.map(c => [c, xs.filter(i => i.label === c).length]));
    console.log(`\n== ${t.name}.${t.field}  rows ${t.items.length}  fit ${t.fit.length}  test ${t.test.length} (+${t.testDropped} over cap, unscored)`);
    console.log(`   fit  ${JSON.stringify(dist(t.fit))}  majority ${majorityOf(t.fit.map(i => i.label))}`);
    console.log(`   disjointness: key overlap ${t.disjointness.keyOverlap}, identical-state overlap ${t.disjointness.stateOverlap}`);
    console.log(`   privacy: scanned ${t.privacy.scanned}, hits ${t.privacy.hits.length}${t.privacy.hits.length ? ' ' + JSON.stringify(t.privacy.hits.slice(0, 5)) : ''}`);
    if (t.sampling) console.log(`   sampling: ${t.sampling}`);
    if (process.argv.includes('--fit')) {
      for (const c of t.classes) {
        console.log(`   FIT examples, ${c}:`);
        for (const i of t.fit.filter(x => x.label === c).slice(0, 8)) console.log('     ', JSON.stringify(i.state));
      }
    }
  }
  console.log('\nbinned numeric columns (fit-half quartile cuts):', JSON.stringify(b.meta.binned));
}
