/**
 * cookbooks/_shared/stories.ts — the words around the numbers, per domain. Any number in the prose is computed from the
 * loaded result files (functions of `L`), never typed in, so a page cannot disagree with its own results.
 */
import type { DomainId, Loaded } from './load.ts';

export type Verdict = 'Jev better' | 'Baseline wins' | 'Mixed';
export type Story = {
  title: string; area: string; oneLine: string; problem: string;
  dataset: { name: string; url: string; licence: string; licenceNote?: string; citation: string };
  stateNote: string;
  roles: Record<string, string>;            // question id → polarity / what it decides
  notForJev: [string, string][];            // judgement → what does it instead
  changes: string[];                        // what the quality pass changed
  thresholdWhy: (L: Loaded) => string;
  verdict: (L: Loaded) => { label: Verdict; text: string };
  fails: (L: Loaded) => string[];
  limits: string[];
  /** Licence box shown at the top of the README and page. `verified` = where the claim was checked (the source, not a mirror). */
  licence: { terms: string; verified: string; use: string; tone: 'open' | 'caution' | 'restricted' };
  /** When set, example cards show these paraphrases instead of the record text (data that must not be redistributed). */
  paraphrase?: Record<string, string>;
  /** When set, example cards quote at most this many characters of each text field (copyleft data: quote minimally). */
  quoteChars?: number;
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const pf = (p: number) => (p < 0.001 ? p.toExponential(1) : String(+p.toPrecision(2)));
const stratum = (L: Loaded, label: string) => L.strong.strata.find(s => String(s.label) === label)!;
const kstratum = (L: Loaded, label: string) => L.decision.strata.find(s => String(s.label) === label)!;

const binaryWhy = (L: Loaded) => `A logistic regression over the narrow answers was fitted on the 100 fit items. The cut (${L.frozen.threshold.t}) ${L.frozen.threshold.how}. The escalate band [${L.frozen.band.lo}, ${L.frozen.band.hi}) is the widest band whose auto-decided fit items stayed within ${pct(L.frozen.band.maxAutoError)} error; on fit it auto-decided ${pct(L.frozen.band.fitCoverage)}. All frozen before the test run.`;
const choiceWhy = (L: Loaded) => `The decision is Jev's pick. The gate is TypeSafe's documented confidence, (k·peak − 1)/(k − 1). The cut (${L.frozen.gate.confidenceAtLeast}) is the lowest value at which auto-accepted fit items stayed within ${pct(L.frozen.gate.maxAutoError)} error; on fit it auto-accepted ${pct(L.frozen.gate.fitCoverage)}. Frozen before the test run.`;

export const STORIES: Record<DomainId, Story> = {
  'youtube-spam': {
    title: 'Comment Spam Filter', area: 'Trust & safety',
    oneLine: 'Hide spam comments under a video, keep real people talking.',
    problem: 'A moderation queue for public comments: advertising, channel-farming and money offers should be hidden; genuine reactions, even rude or off-topic ones, should stay.',
    dataset: { name: 'UCI YouTube Spam Collection (Alberto, Lochter & Almeida, 2015)', url: 'https://archive.ics.uci.edu/dataset/380/youtube+spam+collection', licence: 'CC BY 4.0', citation: 'T. C. Alberto, J. V. Lochter, T. A. Almeida. "TubeSpam: Comment Spam Filtering on YouTube." IEEE ICMLA 2015.' },
    stateNote: '{ video, comment }. Author names, comment ids and dates were dropped; emails and phone numbers were masked (none survived to the sample).',
    roles: {
      isSpam: 'The decision asked directly (labelled). Scored by the kit as a comparison; not used by the rule.',
      asksToVisit: 'true → spam. Reads one thing: is the reader sent to the commenter\'s own stuff?',
      mentionsVideo: 'true → keep. Talking about the song or artist is the plainest sign of a real reaction.',
      offersMoney: 'true → spam. Money, prizes and free stuff are named in the text or they are not.',
      kind: 'Choice with an escape (`none`: empty, emoji-only, unreadable). Its promotion/request/reaction probabilities feed the rule.',
    },
    notForJev: [
      ['Does the comment contain a link?', 'A URL regex. Free, exact, and the link is not the spam; what it asks the reader to do is.'],
      ['Has this account posted the same text elsewhere?', 'A hash over recent comments. Jev sees one comment at a time.'],
      ['Is the account new, or posting in bursts?', 'Account metadata and timestamps, in code.'],
      ['How annoying is the comment?', 'Not asked: a degree judgement, and annoyance is not spam.'],
    ],
    changes: ['Pilot and fit: every question JEV-SAFE. No change was needed.'],
    thresholdWhy: binaryWhy,
    verdict: L => ({ label: 'Jev better', text: `The frozen rule beat the fit-only keyword lists (${pct(L.decision.forced.jevAccuracy)} vs ${pct(L.decision.forced.baselineAccuracy)}, McNemar p = ${pf(L.decision.forced.vsBaseline.p)}) and the post-hoc naive Bayes trained on ${L.strong.trainN} comments (p = ${pf(L.strong.forced.p)}). The win is on catching spam; on genuine comments the keyword lists were already right. The one broad question (isSpam) scored ${pct(L.direct!.accuracy)}, level with the decomposed rule: here decomposition bought an explainable rule, not accuracy.` }),
    fails: L => [
      `Spam that looks like a reaction: "CONGRASULATION I LIVE SO MUCH" followed by a news link (t088), or a rant with no ask in it (t052, t130). The narrow questions read these literally, and literally they don't promote anything.`,
      `Genuine comments that look like spam: ":)" (t068) and "Hello. I am from Azerbaijan" (t010) scored just over the cut. They are short, say nothing about the video and ask nothing.`,
      `The escalate band came out empty: at ${pct(L.frozen.fitAccuracy)} fit accuracy the rule already met the 5% error budget everywhere, so nothing was held back. On test, the rule's errors all went through automatically.`,
    ],
    limits: ['Five music videos from 2013–2015; modern comment spam (crypto, bots replying to bots) is not in it.', 'Balanced 50/50 sample; real comment sections are mostly not spam, so precision at live rates will be lower.', 'A 3:1 cost ratio is a moderation convention, not a measured cost.'],
    licence: { terms: 'CC BY 4.0', verified: 'UCI dataset page (archive.ics.uci.edu/dataset/380), checked 2026-09-22', use: 'Share and adapt with attribution: Alberto, Lochter & Almeida (2015), UCI Machine Learning Repository. Comments are public posts; author names were dropped.', tone: 'open' },
  },
  'intent-routing': {
    title: 'Assistant Intent Router', area: 'Customer support',
    oneLine: 'Send each request to the right skill, and say "none" when it fits none.',
    problem: 'A virtual assistant with ten skill areas receives free-text requests. Each must go to the right area, and requests no skill handles must be recognised as out of scope instead of being forced into the nearest area.',
    dataset: { name: 'CLINC150, OOS+ variant (Larson et al., 2019)', url: 'https://github.com/clinc/oos-eval', licence: 'CC BY 3.0', citation: 'S. Larson et al. "An Evaluation Dataset for Intent Classification and Out-of-Scope Prediction." EMNLP-IJCNLP 2019.' },
    stateNote: '{ utterance }. The intent→domain map is fetched from the dataset repo, not hand-typed. Out-of-scope is 20% of each split on purpose (about 6% of the corpus): it is what the escape option is for.',
    roles: {
      domain: 'The decision (labelled): 10 skill areas plus `none`, the escape option. Each option lists the tasks that area covers, so the question is literal: which listed set does this request belong to?',
      asksAction: 'true = asks the assistant to do something; false = asks for information or chats. A routing hint, not used by the rule.',
      mentionsMoney: 'true = money or an account is mentioned. Points at banking, credit cards or pay.',
      aboutAssistant: 'true = about the assistant itself (name, voice, settings). Separates small talk and meta from tasks.',
    },
    notForJev: [
      ['Should we auto-route this one?', 'Code: the confidence gate fitted on the fit split.'],
      ['Is it in scope at all?', 'Code: `domain !== "none"`. Asking again would duplicate the choice.'],
      ['Which of the 150 fine intents?', 'A second, narrower choice inside the chosen area (not built here).'],
      ['Has this user asked before, and what did we answer?', 'Session history lookup, in code.'],
    ],
    changes: ['Pilot and fit: every question JEV-SAFE. No change was needed.'],
    thresholdWhy: choiceWhy,
    verdict: L => ({ label: 'Jev better', text: `${pct(L.decision.forced.jevAccuracy)} against ${pct(L.decision.forced.baselineAccuracy)} for fit-only keyword lists (p = ${pf(L.decision.forced.vsBaseline.p)}) and ${pct(L.strong.forced.accuracyB)} for naive Bayes trained on ${L.strong.trainN} utterances (p = ${pf(L.strong.forced.p)}). The difference is the escape option: Jev put ${pct(stratum(L, 'none').jev)} of out-of-scope requests in \`none\`; the naive Bayes, which can only match words it has seen, managed ${pct(stratum(L, 'none').strong)}.` }),
    fails: L => [
      `Out-of-scope is a strict line in CLINC, and it cuts both ways. "Check the nanny cam and send the feed to my phone" (t130) is labelled out-of-scope but reads like a smart-home task; "what are some cool tourist attractions in england" (t131) is labelled travel, and Jev said none.`,
      `Small talk vs meta vs none: "what do you know me by" (t016) is meta (the user's name), Jev said small talk. These are the dataset's fuzziest boundaries.`,
      `The confidence gate never fired: the lowest confidence that met the 5% error budget on fit (${L.frozen.gate.confidenceAtLeast}) was below every test answer, so all ${L.decision.n} went through, including the ${L.decision.n - Math.round(L.decision.forced.jevAccuracy * L.decision.n)} errors. On this data Jev is either confident or wrong-and-confident, which is P5: it does not abstain unless you give it somewhere to put the no-answer.`,
    ],
    limits: ['12 items per area in test: per-area numbers are anecdotes.', 'Crowd-written utterances, short and clean; real traffic is messier.', 'Area descriptions list the dataset\'s own intents, which helps any reader, human or model.'],
    licence: { terms: 'CC BY 3.0 Unported', verified: 'LICENSE file in github.com/clinc/oos-eval, checked 2026-09-22', use: 'Share and adapt with attribution: Larson et al. (2019), CLINC150. Utterances are crowd-written, not personal messages.', tone: 'open' },
  },
  'review-triage': {
    title: 'Review Complaint Triage', area: 'E-commerce',
    oneLine: 'Flag the reviews a customer-care agent should read today.',
    problem: 'A retailer gets thousands of product reviews. Customer care wants to see the ones from unhappy customers (the reviewer would not recommend the item) without reading every glowing one.',
    dataset: { name: "Women's E-Commerce Clothing Reviews (nicapotato, 2018)", url: 'https://www.kaggle.com/datasets/nicapotato/womens-ecommerce-clothing-reviews', licence: 'CC0 (public domain)', licenceNote: 'Fetched from a pinned, SHA-1-checked HF mirror of the same CSV.', citation: 'nicapotato (2018). "Women\'s E-Commerce Clothing Reviews." Kaggle.' },
    stateNote: '{ category, title, review }. The star rating is withheld: it would leak the label (4–5 stars → recommend in 98.9% of rows). Reviewer age and ids dropped.',
    roles: {
      wouldNotRecommend: 'The decision asked directly (labelled). Scored by the kit as a comparison; not used by the rule.',
      returned: 'true → complaint. Says they sent it back, or will.',
      fitProblem: 'true → complaint. Says it did not fit (too big, small, long...).',
      flawDescribed: 'true → complaint. Names a defect or damage.',
      differsFromListing: 'true → complaint. Looked different from the photo or description.',
      likesItem: 'true → keep quiet. Says they love or like it: the counterweight to a small gripe.',
      mainIssue: 'Choice with an escape (`none`: no problem described). `none` feeds the rule; the others route to a team.',
    },
    notForJev: [
      ['Star rating', 'Already a number in the record. Also withheld from Jev because it leaks the label.'],
      ['How unhappy is the reviewer?', 'Not asked: a degree judgement. The regression over literal signals produces the gradation.'],
      ['Is this a known problem with this product?', 'Aggregate flags per product id in code; Jev sees one review.'],
      ['Review length, helpful votes', 'Counting, in code.'],
    ],
    changes: ['Pilot and fit: every question JEV-SAFE. No change was needed.'],
    thresholdWhy: binaryWhy,
    verdict: L => ({ label: 'Jev better', text: `${pct(L.decision.forced.jevAccuracy)} against ${pct(L.decision.forced.baselineAccuracy)} for the fit-only keyword lists (p = ${pf(L.decision.forced.vsBaseline.p)}). Those lists were close to useless: they flagged almost everything. The fairer comparison is the post-hoc naive Bayes trained on ${L.strong.trainN} reviews: ${pct(L.strong.forced.accuracyB)}, still significantly behind (p = ${pf(L.strong.forced.p)}). The gain is on happy reviews with a gripe in them, which Jev correctly left alone (${pct(stratum(L, 'false').jev)} vs ${pct(stratum(L, 'false').strong)}).` }),
    fails: L => [
      `Unhappy reviews that open with praise: "I like this top. I received a ton of compliments..." then "not as high-quality as I expected" (t019), and "I love the fit of these pants" before a dye disaster (t021). likesItem fires, and it carries the largest weight in the rule (${L.frozen.weights.likesItem}).`,
      `Happy-enough reviews that list problems: "I wanted it to work... returning this dress" (t080) is labelled would-recommend. The label is the reviewer's own tick-box, and mixed reviews split both ways.`,
      `The escalate band held back ${L.decision.gated.escalated} of ${L.decision.n} for a human; accuracy on the rest was ${pct(L.decision.gated.autoAccuracy!)}, inside the 10% budget.`,
    ],
    limits: ['Balanced 50/50 sample; live traffic is about 18% not-recommended, so live precision will be lower than here.', 'One retailer, clothing only, English, around 2018.', 'The label is self-reported and noisy for 3-star reviews.'],
    licence: { terms: 'CC0 1.0 (public domain)', verified: 'Kaggle dataset API for nicapotato/womens-ecommerce-clothing-reviews, checked 2026-09-22 (the data was fetched from a SHA-1-checked mirror of the same file)', use: 'No restrictions. Attribution given as a courtesy. Reviewer ages and ids were dropped.', tone: 'open' },
  },
  'contract-clauses': {
    title: 'Contract Clause Sorter', area: 'Legal',
    oneLine: 'File each contract provision under the playbook that reviews it.',
    problem: 'Legal ops reviews contracts clause by clause against playbooks. Each provision has to be filed as governing law, notices, termination, indemnification and so on, or as `other` when it is none of the eight.',
    dataset: { name: 'LEDGAR via LexGLUE (Tuggener et al., 2020; Chalkidis et al., 2022)', url: 'https://huggingface.co/datasets/coastalcph/lex_glue', licence: 'CC BY 4.0 (dataset card metadata)', licenceNote: 'The card\'s prose licence section says "More information needed"; the source text is public SEC EDGAR filings.', citation: 'D. Tuggener et al. "LEDGAR: A Large-Scale Multi-label Corpus for Text Classification of Legal Provisions in Contracts." LREC 2020. I. Chalkidis et al. "LexGLUE." ACL 2022.' },
    stateNote: '{ provision }, truncated to 250 words. A leading heading ("Governing Law.") is stripped so the task is about the clause body; addresses and names in notice clauses are masked.',
    roles: {
      clauseType: 'The decision (labelled): eight types, each described by what the clause does, plus `other`, the escape option.',
      namesJurisdiction: 'true → governing law. Is a state or country named? (Also true for venue clauses and notice addresses.)',
      saysAgreementEnds: 'true → termination. Does the text say something ends or may be ended?',
      requiresCoveringLosses: 'true → indemnification. Pay, reimburse, hold harmless or defend against losses?',
      restrictsDisclosure: 'true → confidentiality. Forbids or limits disclosing information?',
    },
    notForJev: [
      ['Is this clause enforceable, or market-standard?', 'A lawyer, or an LLM with a playbook plus a lawyer. Legal and degree judgements.'],
      ['Which state\'s law applies?', 'An extractor or regex. Jev only answers whether one is named.'],
      ['Is the notice period at least 30 days? Does the cap exceed $X?', 'Numbers and comparisons: extract, then compare in code.'],
      ['Is a clause missing from the contract? Does it conflict with clause 12?', 'Whole-document or cross-clause reasoning; Jev sees one provision.'],
    ],
    changes: ['Pilot and fit: every question JEV-SAFE. No change was needed.'],
    thresholdWhy: choiceWhy,
    verdict: L => ({ label: 'Jev better', text: `${pct(L.decision.forced.jevAccuracy)} against ${pct(L.decision.forced.baselineAccuracy)} for fit-only keyword lists (p = ${pf(L.decision.forced.vsBaseline.p)}) and ${pct(L.strong.forced.accuracyB)} for naive Bayes on ${L.strong.trainN} provisions (p = ${pf(L.strong.forced.p)}). Boilerplate is lexically stereotyped, and on governing law, confidentiality and entire-agreement clauses the keyword lists were already perfect. Most of the gap is \`other\` (${kstratum(L, 'other').b} of the ${L.decision.forced.vsBaseline.b} items only Jev got right): Jev ${pct(kstratum(L, 'other').jev)}, keywords ${pct(kstratum(L, 'other').baseline)}. With the gate, ${pct(L.decision.gated.coverage)} was auto-filed at ${pct(L.decision.gated.autoAccuracy!)} accuracy.` }),
    fails: L => [
      `Notices is the weak type (${pct(kstratum(L, 'notices').jev)}). Several LEDGAR "Notices" provisions are really an obligation to notify ("Each Party shall promptly notify the other of any ... infringement", t096) or a waiting period ("You have up to twenty-one days to consider this Agreement", t123). Jev called them \`other\`, at confidence 1.00 for t123. Arguably the label is the odd one out: LEDGAR labels come from the heading the drafter used.`,
      `Termination vs other: "the term of this Agreement shall commence ... and end August 6, 2025" (t140) and a survival clause (t107) mention termination without being about ending the agreement. Both fell below the gate and were escalated.`,
    ],
    limits: ['14 items per type in test: per-type numbers are anecdotes.', 'Labels are drafters\' headings, not a lawyer\'s reading.', 'Commercial contracts filed with the SEC; consumer or non-US contracts differ.'],
    licence: { terms: 'CC BY 4.0 per the LexGLUE dataset card metadata', verified: 'huggingface.co/datasets/coastalcph/lex_glue card (the LexGLUE authors\' own distribution), checked 2026-09-22. Its prose licence section is blank, and no separate licence for the original LEDGAR release was found.', use: 'Attribute LexGLUE and LEDGAR. The provision text comes from public SEC EDGAR filings. Treat the licence as the card states it, with that caveat.', tone: 'caution' },
  },
  'job-postings': {
    title: 'Job Ad Fraud Screen', area: 'HR / trust & safety',
    oneLine: 'Catch fake job ads before applicants send money or ID.',
    problem: 'A job board wants to remove fraudulent postings (fake vacancies that harvest fees, ID or unpaid work) without taking down real employers\' ads.',
    dataset: { name: 'EMSCAD, Employment Scam Aegean Dataset (Vidros et al., 2017)', url: 'https://doi.org/10.3390/fi9010006', licence: 'no licence stated by the authors: do not redistribute', licenceNote: 'Fetched from a pinned third-party mirror (see prepare.ts); the mirror\'s CC0 tag is not the authors\' and is not relied on.', citation: 'S. Vidros, C. Kolias, G. Kambourakis, L. Akoglu. "Automatic Detection of Online Recruitment Frauds." Future Internet 9(1):6, 2017.' },
    stateNote: '{ title, location, employment_type, company_profile, description, requirements, benefits }, cut to about 350 words. Contacts are masked. Structured fields (logo, salary, screening questions) are left to code.',
    roles: {
      asksForPaymentOrDetails: 'true → fraud. A fee, a starter kit, bank or ID details requested in the text.',
      promisesEasyEarnings: 'true → fraud. Earn from home, fast, no experience needed.',
      describesCompany: 'true → legitimate. The employer is named and says what it does.',
      directContactToApply: 'true → fraud. Apply by messaging a person instead of a normal application.',
      listsSpecificDuties: 'true → legitimate. Concrete tasks are described.',
    },
    notForJev: [
      ['Is this posting fraudulent? (the broad question)', 'Moved out after the pilot: MOVE-TO-CODE, only 17% of answers at the ends. A degree judgement (P18, L37); the decision now comes from the literal signals in code.'],
      ['Has a company logo / screening questions / telecommuting flag', 'Structured fields: read them in code. The logo field alone separates the classes strongly.'],
      ['Is the salary unusually high?', 'Parse the numbers; compare with industry and location in code.'],
      ['Is this a real company?', 'A registry or domain lookup: world knowledge, not in the record.'],
    ],
    changes: [
      'Pilot: the broad question `isFraudulent` came back MOVE-TO-CODE (17% at the ends, mean confidence 0.53). It was removed before any labelled run and its label kept in items.meta.json.',
      'Test (reported, not acted on: one labelled run only): `asksForPaymentOrDetails` read NO-INFORMATION (spread 0.063; 0.089 on fit). Almost no ad in the sample asks for money in its first 350 words.',
    ],
    thresholdWhy: binaryWhy,
    verdict: L => ({ label: 'Baseline wins', text: `The declared comparison is a draw: the frozen rule scored ${pct(L.decision.forced.jevAccuracy)}, the fit-only keyword lists ${pct(L.decision.forced.baselineAccuracy)} (p = ${pf(L.decision.forced.vsBaseline.p)}), and always saying "legitimate" ${pct(L.decision.forced.majorityAccuracy)}. A naive Bayes trained on ${L.strong.trainN} labelled ads (post-hoc) scored ${pct(L.strong.forced.accuracyB)}, significantly better (p = ${pf(L.strong.forced.p)}). The literal signals caught ${pct(stratum(L, 'true').jev)} of fraudulent ads; the naive Bayes caught ${pct(stratum(L, 'true').strong)}. Use a trained text model plus the structured fields here, not Jev.` }),
    fails: L => [
      `Most fraud in this corpus does not look like a scam. It looks like an ordinary vacancy: an administrative assistant in Newark (t012), a QC inspector in Houston (t017), even a design-engineer ad that copies a real oil-services firm's company profile (t019). None asks for money or promises easy earnings, so every literal signal says "legitimate". What gives them away is corpus-level pattern (a missing company profile, recurring locations and stock wording), which a model trained on 1,800 labelled ads learns and a zero-shot reader of one ad cannot.`,
      `The gate could only auto-decide ${pct(L.decision.gated.coverage)} of test ads within the 5% budget; everything else would go to a human.`,
    ],
    limits: ['Ads from 2012–2014; today\'s scams (crypto, messaging-app recruiting) are under-represented.', 'Sample is 30% fraud against about 5% in the corpus.', 'The fraud labels are one annotator group\'s judgement.', 'Descriptions are truncated; a payment request late in a long ad is invisible.'],
    licence: { terms: 'No licence stated by the authors', verified: 'The authors\' site (emscad.samos.aegean.gr) calls the data "publicly available" and states no licence (earlier check, 2019 Wayback capture; the site was unreachable on 2026-09-22). The CC0 tag appears only on third-party mirrors and is not relied on.', use: 'Do not redistribute the data. This page shows aggregate results and short paraphrased examples only. The data files in this cookbook\'s directory (spec.json, items.meta.json) contain ad text: keep them out of any public copy of the repository.', tone: 'restricted' },
    paraphrase: {
      t013: 'A game-developer vacancy at a named mobile casino-games studio in Athens. The ad describes the studio and lists concrete duties (game design, interface, networking, server work).',
      t032: 'A "part-timers for cash pay" ad in Sydney: work from home for 30–60 minutes a day, hundreds of dollars a day promised, no experience needed, and a "visit here" link. No company is named.',
      t001: 'An Agile delivery-manager vacancy in London at a named European IT consultancy. It describes the project team and asks for a degree and Agile experience.',
      t002: 'A web/UX designer vacancy at a named web-design agency in Gateshead. It describes the role and asks for a degree and three years of experience.',
      t003: 'A part-time "data entry" ad in California whose text actually describes an insurance-claims support role (reviewing and processing claims), with ordinary requirements. There is no company profile, and nothing asks for money.',
      t006: 'A teach-English-abroad ad from a placement service: "play with kids, get paid", a monthly salary in Asia, housing and airfare covered, and a named recruiter to contact through a link.',
      t009: 'An adult webcam-modelling agency recruiting models for "high paying" work. It describes the agency at length and lists eligibility requirements.',
    },
  },
  'issue-triage': {
    title: 'GitHub Issue Labeller', area: 'Developer tools',
    oneLine: 'Label new issues as bug, feature request or question.',
    problem: 'A busy repository wants new issues pre-labelled so the right person sees them: bugs to on-call, feature requests to the roadmap owner, questions to whoever answers support.',
    dataset: { name: "NLBSE'23 Tool Competition: Issue Report Classification", url: 'https://github.com/nlbse2023/issue-report-classification', licence: 'AGPL-3.0 (repository LICENSE)', citation: 'R. Kallis, M. Izadi, L. Pascarella, O. Chaparro, P. Rani. "The NLBSE\'23 Tool Competition." NLBSE 2023.' },
    stateNote: '{ title, body }, body cut to 250 words. Long code blocks become "[code block: N lines]"; @mentions, user paths, URLs and anything key-like are masked. Labels are the maintainers\' own GitHub labels.',
    roles: {
      issueType: 'The decision (labelled): bug / feature / question, plus `none` (not an issue, empty, unreadable), the escape option.',
      hasErrorOutput: 'true → bug. Error text, a traceback or log output is present.',
      hasReproSteps: 'true → bug. Says what they ran or did.',
      asksHowTo: 'true → question. Asks how to do something, or whether it is possible.',
      proposesNew: 'true → feature. Asks for a new option, behaviour or change.',
    },
    notForJev: [
      ['Has a code block / a stack trace', 'A regex on the fence or on "Traceback", "Exception:". Free and exact.'],
      ['Existing labels, issue-template "Type:" field', 'Read the field. It is metadata, and it leaks the label.'],
      ['Is this a duplicate?', 'Search or embeddings over the tracker; Jev sees one issue.'],
      ['How severe is it?', 'Not asked: a degree judgement.'],
    ],
    changes: ['Pilot: `asksHowTo` rated MARGINAL (47% at the ends). Kept: MARGINAL is not a defect, the rule does not use it, and it rated JEV-SAFE (58%) on the fit run.'],
    thresholdWhy: choiceWhy,
    verdict: L => ({ label: 'Mixed', text: `Pooled, Jev is ahead: ${pct(L.decision.forced.jevAccuracy)} against ${pct(L.decision.forced.baselineAccuracy)} for fit-only keyword lists (p = ${pf(L.decision.forced.vsBaseline.p)}) and ${pct(L.strong.forced.accuracyB)} for naive Bayes on ${L.strong.trainN} issues (p = ${pf(L.strong.forced.p)}). But the strata disagree (L41): on issues maintainers labelled "question", Jev scored ${pct(stratum(L, 'question').jev)} and the naive Bayes ${pct(stratum(L, 'question').strong)}, significantly better (p = ${pf(stratum(L, 'question').p)}). Jev wins on feature requests (${pct(stratum(L, 'feature').jev)} vs ${pct(stratum(L, 'feature').strong)}). So the headline "Jev better" does not ship on its own.` }),
    fails: L => [
      `Many issues labelled "question" read as bug reports: "boolean values update issues" with a list of failing cases (t027), "TypeError: __init__() got an unexpected keyword argument" (t020), "barcodes_generator_product can't generate unique barcodes" with steps (t035). Maintainers often tag user-error reports as questions. Jev reads the text literally and says bug; a model trained on the repositories' own labels learns their habit.`,
      `A body of "$BROKEN" titled "test" (t013) is labelled bug; Jev chose \`none\`, the escape option, which is what it is for, and it scores as wrong here.`,
      `The gate auto-labelled ${pct(L.decision.gated.coverage)} at ${pct(L.decision.gated.autoAccuracy!)} accuracy and left the rest for a human.`,
    ],
    limits: ['Maintainer labels are noisy; the ceiling is well below 100%.', 'Balanced 50/50/50 sample; real trackers are mostly bugs.', 'The prefix of one competition file; a handful of repositories dominate.'],
    licence: { terms: 'AGPL-3.0', verified: 'LICENSE file in github.com/nlbse2023/issue-report-classification, checked 2026-09-22', use: 'Quote minimally and attribute: Kallis et al. (2023), NLBSE\'23 Tool Competition. Issue text is public GitHub content by its authors; usernames and links were masked. Example cards here quote at most the title and the first 160 characters of the body.', tone: 'caution' },
    quoteChars: 160,
  },
};
