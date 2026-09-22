# Holdout pre-registration instrument (operadic-interview, step 2)

Copy this into the pre-registration commit of every leads holdout, **before the seed exists**, and
fill the ▷ slots. It is the pre-run form of `EVAL-TREE.md`: Q1–Q5 are edges E1–E5. Answer at any
depth. A blank slot is data: `claim-gate.ts` treats an unanswered edge as unchecked, not as a pass.
If you answer only the ★ questions, you have answered the ones that would have caught a past failure.
Lint: `python3 treelint.py leads/PREREG.md`.

Composition is absorbed into shape: each parent's own ▷ is its collapsed (direct) answer, and its
children are the composed evidence. Where both are filled and disagree, record that as a finding in
the commit. Do not resolve it silently.

---

**Q0 — Which leads does this holdout's claim cover, what verdict do you predict, and what result would make you say the prediction was wrong?**  `() → (claim scope, predicted verdict, falsifier)`
▷

> **Compose (root):** the claim is admissible only if Q1 ∧ Q2 ∧ Q3 ∧ Q4 ∧ Q5 are answered before the seed exists; the predicted verdict is Q4's direction under Q3's rule, restricted to Q1's scope; the falsifier is Q4's opposite outcome in Q5's strata.

---

- **Q1 — Has any text this holdout will show the model already been seen by whoever tuned the rules it tests?**  `→ text-overlap share per fit seed (E1)`
  ▷
  > **Compose:** pass iff Q1.1 lists every fit seed ∧ Q1.2's share ≤ 20% (or Q1.3 accepts it in writing, which narrows the claim scope to new records).
  - **Q1.1 — ★ Which seeds did you open, score, or tune anything on before writing this, including the ones you only glanced at?**
    ▷
  - **Q1.2 — ★ When you generate it, what share of its messages appear word for word in those seeds (not whole records: messages)?**
    ▷
  - **Q1.3 — If that share is high, are you claiming anything about new wording, or only about new records, and does the claim sentence say which?**
    ▷

- **Q2 — What share of leads must get a verdict for the headline to count, and what happens to the ones that do not?**  `→ minimum coverage + escalation accounting (E2)`
  ▷
  > **Compose:** pass iff Q2.1 states a number ∧ Q2.2 counts escalations in the headline denominator ∧ Q2.3 names who reads the escalations.
  - **Q2.1 — ★ What is the minimum coverage, written as a number, below which you will report a failure no matter how accurate the rest looks?**
    ▷
  - **Q2.2 — Is the headline accuracy computed over every lead, with each escalation counted by the scoring policy, rather than only over the leads that got an answer?**
    ▷
  - **Q2.3 — In the last run, which category produced most escalations, and do you expect that to change?**
    ▷

- **Q3 — Which rule decides whether each outcome is correct, and did you choose it before seeing any result it will be applied to?**  `→ scoring policy + declared-before flag (E3)`
  ▷
  > **Compose:** pass iff Q3.1 names a policy version ∧ Q3.2 says "before" ∧ Q3.3's answer is reflected in the policy text.
  - **Q3.1 — Which scoring policy version is primary, and which is printed beside it?**
    ▷
  - **Q3.2 — ★ When was that policy written down relative to the first time you saw any score it changes?**
    ▷
  - **Q3.3 — For each category, is "escalate" correct, wrong, or neither, and where is that written?**
    ▷

- **Q4 — How will you decide whether a gap between Jev and the regex is real?**  `→ paired test + threshold (E4)`
  ▷
  > **Compose:** pass iff Q4.1 is a paired test on per-lead correctness ∧ Q4.2 fixes alpha ∧ Q4.3 does not borrow a threshold measured for a different quantity.
  - **Q4.1 — Which test compares the two systems on the same leads, lead by lead?**
    ▷
  - **Q4.2 — At what p-value will you call it a difference, and what will you call it otherwise?**
    ▷
  - **Q4.3 — ★ Does any number in your decision rule come from a measurement of something else (a noise band, a threshold from another experiment), and if so, what did it originally measure?**
    ▷

- **Q5 — Which parts of the corpus must agree with the headline for you to believe it?**  `→ strata + agreement rule (E5)`
  ▷
  > **Compose:** pass iff Q5.1 lists strata ∧ Q5.2 names the stratum the claim lives in ∧ Q5.3 is answered for each stratum.
  - **Q5.1 — Which strata will the result be split into (seen vs novel messages, each category), and what is the minimum size for a stratum to count?**
    ▷
  - **Q5.2 — ★ In which single stratum would a win count for the claim you actually want to make, and is that stratum large enough to decide anything?**
    ▷
  - **Q5.3 — Is any stratum confounded with another (for example, novel messages coming mostly from one category), and how will you tell a wording effect from a category effect?**
    ▷
