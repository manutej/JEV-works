# contract-clauses: notes for the lead

**Task.** Legal ops: route one contract provision to its clause type (8 types + `other`).

## Dataset
- **LEDGAR via LexGLUE**: https://huggingface.co/datasets/coastalcph/lex_glue, config `ledgar`. It has 100 ClassLabel names, which prepare.ts checks with `hfLabelNames`. Splits are train 60k, validation 10k and test 10k.
- **Licence**: the card's YAML says `license: cc-by-4.0`. Its "Licensing Information" section says "[More Information Needed]", and it gives no separate licence for LEDGAR. The source text is SEC EDGAR filings, which are public records.
- **Citations**: Tuggener, Säuberli, Oppliger & Tanner (2020), *LEDGAR: A Large-Scale Multi-label Corpus for Text Classification of Legal Provisions in Contracts*, LREC 2020. Chalkidis et al. (2022), *LexGLUE*, ACL 2022.
- **Rows used**: fit comes from the first 5,000 rows of `validation` and test from the first 5,000 rows of `test`. At 100 rows per request that is 100 HF API requests, and the rows API returns HTTP 429 when hit hard. Everything is cached under `cookbooks/.cache`.

## Classes and counts
| clauseType | LEDGAR label | fit | test |
|---|---|---|---|
| governingLaw | Governing Laws | 9 | 14 |
| notices | Notices | 9 | 14 |
| entireAgreement | Entire Agreements | 9 | 14 |
| amendment | Amendments | 9 | 14 |
| termination | Terminations | 9 | 14 |
| assignment | Assignments | 9 | 14 |
| confidentiality | Confidentiality | 9 | 14 |
| indemnification | Indemnifications | 9 | 14 |
| other | any other label (see below) | 28 (28%) | 38 (25%) |

## Sampling
- **Seed and order**: SEED 20260922, fixed. The two splits are shuffled and then deduped together, validation first. As a result no test provision's text repeats a fit text, and the dry run reports text overlap 0.
- **Per-type quotas**: every type gets an equal quota, so per-class accuracy can be compared across types. Fit has only 100 slots, so it gets 9 per type; test gets 14.
- **`other`**: filled round-robin across LEDGAR labels, at most about 1 per label. It covers 28 labels in fit and 38 in test, so it is a stratified sample of the long tail rather than mostly Counterparts and Severability.
- **Labels excluded from `other`**:
  - Near-synonyms of a chosen type: Applicable Laws, Indemnity, Modifications, Integration, Assigns, Successors and Binding Effects. A correct answer on these would otherwise be scored as wrong.
  - Grab-bag headings: General and Miscellaneous.
- **Text processing**: each provision gets heading-stripped, then truncated to 250 words, then masked. The median length is about 80 words.

## Heading leakage
LEDGAR's label *is* the provision's original heading. LexGLUE has already removed the heading from almost every provision: only about 30 of 10,000 rows start with anything heading-shaped, and about half of those are false positives such as "This Amendment No. 1", "Mr. Smith" and "B. Riley".

prepare.ts still strips a leading 1–6-word Title-Case heading followed by a period. It uses stop-lists, so it leaves sentence starts and abbreviations alone. In the 9,304-row pool it stripped 14 headings, and 3 of them made it into the sample (tracked as `headingStripped` in items.meta.json). The keyword baseline sees exactly the same stripped text as Jev. The task is therefore about the clause body.

## Masking
Before the kit's privacy scan runs, prepare.ts applies `maskPrivate` (emails and phone numbers), then masks:
- `Attention:`/`Attn:` recipient names → `[name]`
- street addresses → `[street address]`
- Suite, Floor and PO Box → `[address]`
- ZIP+4 codes, and ZIPs that follow a state code → `[zip]`

77 provisions in the pool were masked. None of the 250 sampled items needed masking. The privacy scan reports 0 hits. Nothing was dropped except empty text, duplicates and the excluded labels.

## Questions
| id | type | why it is literal | what it decides | polarity |
|---|---|---|---|---|
| `clauseType` | choice (labelled) | Asks what the provision *does*, one option per type. Options describe function, not heading words. `other` is the escape option. | The routing decision. | One option per class. |
| `namesJurisdiction` | noul | Is a named state or country present in the text? | Governing-law evidence. | true → governingLaw. Also true for venue clauses and for notice addresses. |
| `saysAgreementEnds` | noul | Does the text say something ends or may be terminated? | Termination evidence. | true → termination |
| `requiresCoveringLosses` | noul | Does the text say pay, reimburse, hold harmless or defend against losses? | Indemnification evidence. | true → indemnification |
| `restrictsDisclosure` | noul | Does the text forbid or limit disclosing or using information? | Confidentiality evidence. | true → confidentiality |

**Rule** (`rule.ts`): kind `choice`, target `clauseType`, `maxAutoError` 0.05. A mis-filed clause gets checked against the wrong playbook and costs a lawyer's re-read. Anything below the fitted confidence cut goes to a review queue.

## Not for Jev
- **"Is this clause enforceable?" / "Is it market-standard?" / "How favourable is it to us?"** These are legal judgements and degree judgements, which belong to a lawyer, or to an LLM with a playbook plus a lawyer.
- **"Which state's law applies?"** Extracting the name is a job for a regex or an extractor. Jev only answers whether a jurisdiction is named.
- **"Is the notice period at least 30 days?" / "Does the cap exceed $X?" / "When does it terminate?"** These are numbers, dates and comparisons, so they belong in code after extraction.
- **"Is this clause present in the contract?" / "Does it conflict with clause 12?"** These are about the whole document or the relation between clauses. They belong to document-level code or to a lawyer.
- **"Does it start with a heading?" / "How many words is it?"** Code computes these.

## Baseline
`keywordBaseline` has the top 8 words per class by log-odds, fitted on the FIT split only and applied to the stripped text:
- governingLaw: governed, state, choice, conflicts, construed, laws, consents, delaware
- entireAgreement: matter, entire, understandings, supersedes, agreements, supersede, among, oral
- notices: notices, address, addressed, communications, sent, mail, mailed, overnight
- indemnification: expenses, incurred, indemnify, costs, asserted, damages, liabilities, losses
- confidentiality: information, confidential, confidentiality, public, disclosure, confidence, disclose, accountants
- termination: automatically, termination, terminate, terminated, grant, article, force, further
- amendment: amendment, modification, supplement, amended, waived, amend, advance, benefits
- assignment: assign, assigned, substantially, successor, assignment, assigning, assignor, fee
- other: adverse, property, timely, withholding, subsidiaries, arbitrator, avoidance, basis

**Baseline accuracy on test: 0.767.** governingLaw, entireAgreement and confidentiality score 14/14, amendment 13/14, and `other` only 19/38.

## Risks
1. **The baseline is strong.** Contract boilerplate is lexically stereotyped, so Jev may show "no difference" at n=150. Jev's edge, if it has one, will come from `other` and from edge phrasings.
2. **LEDGAR labels are noisy**, because a heading is not always the clause's function. In validation, one "Amendments" row is actually an entire-agreement clause and one "Terminations" row is an ERISA covenant. Some of Jev's errors against the labels will be label errors. Consider a hand audit of the test mismatches before quoting per-class numbers.
3. **Borderline labels in `other`.** Terms (the duration of the agreement), Consent To Jurisdiction and Survival can read like termination or governing law. Only clear synonyms were excluded.
4. **Fit is small**: 9 per type.
5. `namesJurisdiction` also fires on addresses in notice clauses and on the Delaware General Corporation Law cited in indemnification clauses.
