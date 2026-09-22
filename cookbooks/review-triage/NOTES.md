# review-triage — notes for the lead

**Decision:** `wouldNotRecommend` (noul; true = the reviewer would not recommend = a complaint the CX team should see).

## Dataset
- **Women's E-Commerce Clothing Reviews**, nicapotato (2018), Kaggle: https://www.kaggle.com/datasets/nicapotato/womens-ecommerce-clothing-reviews
- **Licence: CC0 (public domain).** Checked against Kaggle's dataset API (`licenseNameNullable: "CC0: Public Domain"`). Commercial use is fine.
- **Fetched from** an unmodified CSV mirror on HF, pinned to a revision and checked by SHA-1 (`0593955f…754d`): `abayuu/Womens_Clothing_E-Commerce_Reviews@347c89d6`. The mirror declares no licence of its own; the content is the CC0 file. Censius-AI holds the same blob. The CC0 parquet repack `chibifire/kaggle-womens-ecom-clothing-reviews` has a CITATION.cff, but its rows API returned HTTP 429, so we don't use it.
- **Citation:** nicapotato (2018), "Women's E-Commerce Clothing Reviews", Kaggle, CC0.
- **Label:** `Recommended IND` = 0 → `wouldNotRecommend = true`. 23,486 rows; 22,641 have review text; 22,636 remain after dedupe; 4,101 are not-recommended (18.1%).

## Splits (SEED 20260922; dedupe on title+review; fit and test disjoint by construction; kit dry-run finds 0 id overlap and 0 text overlap)
| split | true (not rec.) | false (rec.) |
|---|---|---|
| fit | 50 | 50 |
| test | 75 | 75 |
- Both splits are **balanced 50/50, not the natural 18%.** At 18%, a test set of 150 would hold only ~27 positives, too few for a paired comparison. Live precision will therefore be lower than on fit or test (see Risks).
- Pilot = the first 30 fit items, labels stripped.

## State
- `{ category, title?, review }`. `category` is the product class ("Dresses", "Knits" ...). `title` is omitted when the review has none.
- Reviews are truncated to 400 words in code. It never triggers: the longest review is 115 words.

## Dropped / masked
- **Star rating: withheld.** It leaks the label (rating 4–5 → recommend in 98.9% of rows; rating 1–2 → not recommend in 95.4%).
- **Age: dropped** (personal data). Clothing ID, Positive Feedback Count, Division and Department are also dropped.
- `maskPrivate` runs on title and review. The kit's privacy scan finds 0 hits. The company name was already replaced by "retailer" upstream.

## Questions (1 labelled + 6 unlabelled)
| id | type | polarity | why it is literal / what it decides |
|---|---|---|---|
| `wouldNotRecommend` | noul, **labelled** | + | The decision itself, asked directly. The kit scores it against the keyword baseline. |
| `returned` | noul | + | Asks whether a return is stated ("sent it back"). This is the clearest literal sign of an unhappy purchase. |
| `fitProblem` | noul | + | Asks whether the reviewer says it did not fit (lists the forms: too big, too small, too long ...). This is the most common complaint. |
| `flawDescribed` | noul | + | Asks whether a defect or damage is named (hole, pilling, see-through, broken zipper ...). A quality team acts on these. |
| `differsFromListing` | noul | + | Asks whether the reviewer says the item looked different from the photo or description. This is a catalogue issue, not a sizing one. |
| `likesItem` | noul | − | Asks whether the reviewer says they love, like, or are happy with the item. This is the counterweight to a small gripe. |
| `mainIssue` | choice | `none` −, others + | fit / quality / appearance / other / **none** (escape option). Routes the flagged review to a team. When several issues appear, the first one mentioned wins, so the pick depends on position, not on how much the reviewer complains. |

`rule.ts`: binary. Features = the 5 narrow nouls + `mainIssue=none`. Cost threshold is fnCost 3 : fpCost 1 (a missed unhappy customer vs about a minute of an agent's time). `escalate.maxAutoError` = 0.10 (low-stakes CX triage, so the band is looser than moderation's 0.05).

## Not for Jev (code does these, or they are not asked)
- **Star rating** → not asked: code already has it, and it would leak the label.
- **Review length / word count / "is the review long"** → code (counting).
- **Product category, department** → code (a structured field).
- **Helpful-vote count** → code (numeric; dropped anyway).
- **"How unhappy is the reviewer" (a degree)** → not asked. The logistic regression over the literal signals, fitted in decide.ts, produces that gradation.
- **"Is this a known problem with this product"** → not asked (relational: needs other reviews of the same Clothing ID). It could be done in code by aggregating flags per ID, but we dropped the ID.

## Baseline (keywords fitted on fit only)
- `rec`: being, easy, leggings, winter, although, brown, cozy, dressed
- `notRec`: reviews, couldn't, disappointed, two, can't, extremely, holes, neck
- Test accuracy is **0.527**, near chance. With only 100 fit texts the lists are mostly noise, so the bar is low. Expect Jev to beat it easily, and don't oversell the win.

## Risks
- **The label is self-reported and noisy.** 3-star reviews split 1,653 not-recommended vs 1,170 recommended. "I love it but it runs small, would still buy" is common, so this target is genuinely ambiguous: expect accuracy below 90% even for a good reader.
- **Prior shift.** Fit and test are balanced, but live traffic is 18% positive. The 3:1 cost threshold was fitted at a 50% prior, so it will over-flag live. Re-weight or re-state the threshold before quoting live precision.
- **Mixed reviews.** Many negatives open with praise, so `likesItem` fires on both classes. Its weight may come out small.
- **Single retailer, clothing only, English, ~2018.** Delivery and shipping complaints are rare in this data, so `mainIssue=other` will be thin.
- `mainIssue`'s "mentioned first" rule may pick a minor gripe over the real complaint. It is unlabelled, so we can only check it through the pilot's question-quality report.
