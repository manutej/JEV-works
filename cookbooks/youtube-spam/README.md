# Comment Spam Filter (Trust & safety)

> Hide spam comments under a video, keep real people talking.

**Verdict: Jev better.** The frozen rule beat the fit-only keyword lists (92.7% vs 82.0%, McNemar p = 0.0015) and the post-hoc naive Bayes trained on 1412 comments (p = 2.5e-5). The win is on catching spam; on genuine comments the keyword lists were already right. The one broad question (isSpam) scored 93.3%, level with the decomposed rule: here decomposition bought an explainable rule, not accuracy.

Page: [demo/youtube-spam.html](../../demo/youtube-spam.html) · data notes: the header of [prepare.ts](prepare.ts)

## The problem
A moderation queue for public comments: advertising, channel-farming and money offers should be hidden; genuine reactions, even rude or off-topic ones, should stay.

**Data:** [UCI YouTube Spam Collection (Alberto, Lochter & Almeida, 2015)](https://archive.ics.uci.edu/dataset/380/youtube+spam+collection). **Licence:** CC BY 4.0.
T. C. Alberto, J. V. Lochter, T. A. Almeida. "TubeSpam: Comment Spam Filtering on YouTube." IEEE ICMLA 2015.

**What Jev reads:** { video, comment }. Author names, comment ids and dates were dropped; emails and phone numbers were masked (none survived to the sample).

## The question set
One call per item, all questions batched (P31). "ends" = the share of test answers that reached a confident end (kit label-free quality report).

| question | type | instructions | role / polarity | test quality |
|---|---|---|---|---|
| `isSpam` **(decision)** | noul | Is this YouTube comment spam? | The decision asked directly (labelled). Scored by the kit as a comparison; not used by the rule. | JEV-SAFE, ends 81% |
| `asksToVisit` | noul | Does the comment ask readers to visit, watch, check out, subscribe to or like something that belongs to the commenter (their channel, video, page, site or product)? | true → spam. Reads one thing: is the reader sent to the commenter's own stuff? | JEV-SAFE, ends 81% |
| `mentionsVideo` | noul | Does the comment say something about this video, this song or this artist? | true → keep. Talking about the song or artist is the plainest sign of a real reaction. | JEV-SAFE, ends 77% |
| `offersMoney` | noul | Does the comment offer money, prizes, free items, gift cards, or a way to earn money? | true → spam. Money, prizes and free stuff are named in the text or they are not. | JEV-SAFE, ends 95% |
| `kind` | choice (reaction, promotion, request, conversation, none) | What is this comment mainly doing? | Choice with an escape (`none`: empty, emoji-only, unreadable). Its promotion/request/reaction probabilities feed the rule. | JEV-SAFE, ends 67% |

Why these are literal: each asks about the one record in front of Jev, answerable by reading it: no counting, arithmetic, dates, cross-record comparison or degree judgement (NETER P18, P21; L37). Every choice has an escape option (P5).

**What the label-free quality pass changed**
- Pilot and fit: every question JEV-SAFE. No change was needed.

## Not for Jev
| judgement | instead |
|---|---|
| Does the comment contain a link? | A URL regex. Free, exact, and the link is not the spam; what it asks the reader to do is. |
| Has this account posted the same text elsewhere? | A hash over recent comments. Jev sees one comment at a time. |
| Is the account new, or posting in bursts? | Account metadata and timestamps, in code. |
| How annoying is the comment? | Not asked: a degree judgement, and annoyance is not spam. |

## The decision rule
Binary. A logistic regression (L2, λ = 1, fitted on the 100 fit items) over `asksToVisit`, `mentionsVideo`, `offersMoney`, `kind=promotion`, `kind=request`, `kind=reaction`.

Frozen weights: `asksToVisit` 1.942 · `mentionsVideo` -1.64 · `offersMoney` 0.377 · `kind=promotion` 1.515 · `kind=request` 0.306 · `kind=reaction` -1.743 · bias 0.519.

Decide "yes" when the score ≥ **0.5**; act automatically outside the escalate band **[0.5, 0.5)**, send the band to a human.

**How the thresholds were chosen** (fit split only, frozen in [rule.frozen.json](rule.frozen.json) and committed before any test call):
- **Cut:** minimises 3·FP + 1·FN on the fit split (fit cost 5). Hiding a genuine comment (false positive) silences a real person and costs a moderator appeal; a missed spam comment is one more link in a thread. 3:1 is a moderation-team convention, not a measured cost.
- **Band:** widest band whose auto-decided fit items stayed within 5.0% error (fit coverage 100.0%, fit error 3.0%). Auto-hide or auto-keep only where the fit split made at most 1 error in 20; everything between goes to the moderation queue.

## Results (test split, n = 150, one labelled run, `jev-1.13.0 (direct)`, answered by `jev-1.13.0`)

| system | accuracy (all items) | vs Jev rule: only Jev right / only other right | exact McNemar p | reading |
|---|---|---|---|---|
| **Jev, frozen rule** | **92.7%** | | | |
| Jev, one broad question `isSpam` (kit scorecard, p ≥ 0.5) | 93.3% | vs keywords: 19 / 2 | 2.2e-4 | Jev better (vs keywords) |
| Keyword lists, fit split only (**declared baseline**) | 82.0% | 20 / 4 | 0.0015 | Jev better |
| Naive Bayes on 1412 labelled rows (**post-hoc**) | 74.7% | 34 / 7 | 2.5e-5 | Jev better |
| Majority class ("true", from fit) | 50.0% | 72 / 8 | 5.4e-14 | Jev better |

**Coverage:** Jev answered 150/150. **Gated:** the frozen gate acted on 100.0% (150) at 92.7% accuracy and held 0 for a human; on those same auto-decided items the keyword lists scored 82.0%. (McNemar 20/4, p = 0.0015)

**By true label (L41: a pooled result must not hide a stratum going the other way)**

| label | n | Jev | keywords | p | naive Bayes | p |
|---|---|---|---|---|---|---|
| true | 75 | 89.3% | 66.7% | 7.6e-5 | 96.0% | 0.13 |
| false | 75 | 96.0% | 97.3% | 1 | 53.3% | 4.1e-9 |

Sources: [results/test.json](results/test.json) (kit), [results/decision-test.json](results/decision-test.json) (frozen rule), [results/strong-baseline-test.json](results/strong-baseline-test.json) (post-hoc). Fit: [results/fit.json](results/fit.json); pilot: [results/pilot.json](results/pilot.json). Calls: pilot 30, fit 100, test 150.

The naive Bayes was added after the test run, because the declared keyword lists (fitted on 100 items) were near chance in several domains. It does not alter the declared comparison (the keyword row above); it answers "would a cheap model with far more labels have done as well?", and where that changes the practical verdict (job-postings), the verdict line says so.

## Where it fails
- Spam that looks like a reaction: "CONGRASULATION I LIVE SO MUCH" followed by a news link (t088), or a rant with no ask in it (t052, t130). The narrow questions read these literally, and literally they don't promote anything.
- Genuine comments that look like spam: ":)" (t068) and "Hello. I am from Azerbaijan" (t010) scored just over the cut. They are short, say nothing about the video and ask nothing.
- The escalate band came out empty: at 97.0% fit accuracy the rule already met the 5% error budget everywhere, so nothing was held back. On test, the rule's errors all went through automatically.

## Honest limits
- Five music videos from 2013–2015; modern comment spam (crypto, bots replying to bots) is not in it.
- Balanced 50/50 sample; real comment sections are mostly not spam, so precision at live rates will be lower.
- A 3:1 cost ratio is a moderation convention, not a measured cost.
- The regression and its cut are fitted on the same 100 fit items, so fit-split numbers are optimistic; only the test numbers above are claims.
- n = 150: differences of a few points are not detectable; per-label numbers are small samples.

## Reproduce
```bash
cd JEV-works && source ~/.zshrc >/dev/null 2>&1
node cookbooks/youtube-spam/prepare.ts                        # fetch + build spec.json (seeded; byte-identical)
node kit/run.ts cookbooks/youtube-spam/spec.json --dry-run    # privacy scan, disjointness, call count
node kit/run.ts cookbooks/youtube-spam/spec.pilot.json        # label-free quality pass (30 calls)
node kit/run.ts cookbooks/youtube-spam/spec.fit.json  --out cookbooks/youtube-spam/results/fit.json
node cookbooks/_shared/decide.ts cookbooks/youtube-spam fit  cookbooks/youtube-spam/results/fit.json    # freezes rule.frozen.json
node kit/run.ts cookbooks/youtube-spam/spec.json      --out cookbooks/youtube-spam/results/test.json
node cookbooks/_shared/decide.ts cookbooks/youtube-spam test cookbooks/youtube-spam/results/test.json   # scored once
STRONG_BASELINE=1 node cookbooks/youtube-spam/prepare.ts && node cookbooks/_shared/compare-strong.ts cookbooks/youtube-spam
```
Use `/opt/homebrew/bin/node` (v25). decide.ts refuses to re-fit a frozen rule or re-score a test.
