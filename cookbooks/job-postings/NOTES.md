# job-postings — notes for the lead

**Decision:** is a job ad fraudulent? (noul `isFraudulent`, true = fraud)

## Dataset
- **EMSCAD**, the Employment Scam Aegean Dataset (University of the Aegean, Laboratory of Information & Communication Systems Security). It has 17,880 real job ads from 2012–2014, labelled by hand: 17,014 legitimate and 866 fraudulent.
- **Citation:** Vidros, Kolias, Kambourakis & Akoglu (2017), "Automatic Detection of Online Recruitment Frauds: Characteristics, Methods, and a Public Dataset", *Future Internet* 9(1):6, doi:10.3390/fi9010006.
- **Fetched from:** a single CSV on the Hugging Face mirror, pinned to commit a751f55:
  `https://huggingface.co/datasets/victor/real-or-fake-fake-jobposting-prediction/resolve/a751f55136a26da3c36e26aa207a9e187ca24b45/fake_job_postings.csv`.
  I used this CSV instead of `hfAll` because the datasets-server returned HTTP 429 on the rows API.
- **Licence (what I could verify, and where):**
  - The HF dataset card says `license: cc0-1.0`.
  - The Kaggle API for `shivamb/real-or-fake-fake-jobposting-prediction` (the same file) says `"CC0: Public Domain"`.
  - The original site, emscad.samos.aegean.gr (checked live and in a Wayback capture from 2019-10), calls the dataset "publicly available". It puts downloads behind a login and **states no licence**.
  - So the CC0 comes from the mirror uploaders, not from the authors. If the demo will be published, treat the licence as **unconfirmed by the rights holder**. The citation is in the prepare.ts header in either case.

## Sampling (SEED 20260922, deterministic; spec.json md5 `b2ce79b758d363dc97455ff621be49d3`, the same on two runs)
- **Cleaning:** decode HTML entities and put back the missing spaces between glued sentences and list items.
- **Dedupe:** drop ads whose description and requirements have fewer than 5 words. Then dedupe on the full, untruncated description + requirements, so the same ad reposted in another city counts once. That leaves 15,005 ads (628 fraudulent).
- **Splits:** fit is **30 fraud / 70 legit**; test is **45 fraud / 105 legit**. The split is stratified, and fit and test share no ids and no text (kit check: overlap 0).
- **Why 30% fraud:** the natural rate is about 5%. At 5%, a test set of 150 would hold only about 7 positives, too few for a paired test or a precision estimate. 30% gives 45 positives without pretending fraud is common.
- **Base rates to compare against:** always answering "legit" scores 70% on test.

## State (what Jev reads)
- **Fields:** title, location (country + city only; the state/region is dropped), employment_type, company_profile (cut to 60 words), description (150 words), requirements (80 words), benefits (50 words).
- **Truncation** is done in code on word boundaries and marked `…[truncated]`. The longest state is 358 words; the mean is 229.
- **Empty fields** read `(not given)`.

## Questions (polarity is declared in a comment beside each question in prepare.ts)
| id | type | why it is literal / what it decides | polarity |
|---|---|---|---|
| `isFraudulent` | noul, **labelled** | The decision, asked directly; scored against the baseline | true = fraud |
| `asksForPaymentOrDetails` | noul | Is there a request, in the text, to pay a fee or send bank/ID details? A classic scam marker | true → fraud |
| `promisesEasyEarnings` | noul | Does the text make an easy/quick/from-home earnings claim? It is asked as "does it promise", not "is the pay too high" | true → fraud |
| `describesCompany` | noul | Is the employer named and its business stated? Scams hide the employer | true → legit |
| `directContactToApply` | noul | Does the text route applicants to a direct contact instead of an application process? Contacts are masked, so this asks what the ad *tells* applicants to do, not who the contact is | true → fraud |
| `listsSpecificDuties` | noul | Are concrete tasks described? Fake ads are often vague | true → legit |

There are no choice or score questions, so no escape options are needed.

**rule.ts:**
- kind `binary`, using the five narrow nouls as features.
- Threshold: fit precision of at least 0.8. A false fraud flag takes down a real employer's ad.
- `escalate.maxAutoError` is 0.05; everything in between goes to a human reviewer.

## Not for Jev (code does it instead)
| judgement | what does it instead | why |
|---|---|---|
| `has_company_logo` | read the field in code | Structured, and it leaks the label: 7/30 fit fraud have a logo vs 54/70 legit |
| `telecommuting`, `has_questions` | read the fields in code | Structured booleans |
| Is company_profile empty? | `company_profile === ''` in code | It is computable, and strong: 22/30 fit fraud vs 15/70 legit. **Caution:** Jev can see `(not given)`, so `describesCompany` will partly echo it. Compare Jev with a code feature built on this field before crediting Jev |
| salary_range: is the pay unusually high? | parse the numbers in code, compare with industry/location | Numbers and comparison; never Jev |
| "Is this a real company?" | registry or domain lookup | World knowledge, not about the one record |
| "How legitimate does it look?" | none (a degree judgement) | Replaced by the literal nouls |
| required_experience / education, industry, function, department | category fields, available to code | Structured; left out of the state |
| length or amount of text, count of [url]/[email] tokens | code | Counting |

## Baseline
`keywordBaseline`, fitted on fit only, over the joined state text Jev sees.
- **fraud keywords:** below, clerical, annual, clerk, cuts, income, input, link
- **legit keywords:** growing, complex, every, projects, year, established, fun, things
- **On test:** 75.3% accuracy, with 9 true positives and 1 false positive. Majority is 70%.

## Risks
- **Label noise:** the authors say some entries "might belong to the wrong class" because of human annotation error. The fraud labels are one annotator group's judgement, and there is no appeal record.
- **Age:** the ads date from 2012–2014, so today's scams (crypto, fake remote-work tasks, messaging-app recruiting) are under-represented. Some patterns, such as data-entry/clerical work-from-home ads concentrated in the US, may be specific to that corpus.
- **Truncation:** a payment request placed late in a long description can fall past the cut, which biases `asksForPaymentOrDetails` toward false.
- **Precision on the rule:** fit has 30% fraud, not 5%. Precision measured at fit/test prevalence will be higher than live precision.

## Masked or dropped
- **Contacts:** the source's `#EMAIL_…#`, `#PHONE_…#` and `#URL_…#` markers are replaced with `[email]`, `[phone number]` and `[url]` (on test and fit: 11, 5 and 86 of them). maskPrivate then runs again, followed by the kit's privacy scan, which found 0 hits.
- **Dropped from the state:** job_id (kept in items.meta.json as `sourceJobId`), plus department, salary_range, industry, function, required_experience, required_education and the three flags. items.meta.json keeps the flags for use as code features.
