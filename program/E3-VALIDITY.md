# E3 validity index (read before quoting anything from E3)

| artifact | validity |
|---|---|
| program/results/e3-blind.json, runs/e3-holdout*.jsonl, program/e3-review.html | **VOID**: the "holdout" is the fit set's approved subset (L31) |
| program/results/e3-fit.json, runs/e3-fit*.jsonl | **IN-SAMPLE**: descriptions written from these items |
| program/results/e3-kfold*.json, runs/e3-kfold*.jsonl, program/e3-kfold-review.html | **IN-SAMPLE-ASYMMETRIC**: Jev in-sample, baseline held out per fold |

What survives: P30 (option wording as a *lead*, not a law) and P32 (in-sample, asymmetric). The only route to evidence is a
freshly written, independently labelled CETI hook set that passes G3 (text + 8-word runs) against these 80.
**Internal only:** the 80 CETI hook texts have no stated licence; exclude program/e3-* and runs/e3-* from any public copy.
