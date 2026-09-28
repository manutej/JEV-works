# Which Browser Use Cases Are Worth Measuring First? — Answer Sheet for Manu

v1.0 — generated 2026-09-28 · depth budget 3 (materiality stopped at 2) · decision: what the 100-page, ten-agent measurement should target

## How to answer this sheet

Answer at any depth, in any order, and skip freely. Deep answers compose upward into
evidence for the questions above them. A direct answer to a shallow question stands on
its own as your collapsed call on that whole branch. Answering both a parent and its
children at different depths is the built-in consistency check — if they disagree, that
disagreement is the finding.

Every question has its own `▷` line — write there, plain language, badly is fine.
The ★ questions are the minimum viable interview: if you only answer the ★ set, the
sheet still works. Q0's stars are delegated to its subtrees: it is a filter over all of them.

Already known and not re-asked: Jev decides a literal claim about one page in ~250 ms and
was right on 73 of 73 decided pages today; the model loop takes 15–150 s; recordings can be
saved per row as a zip; ten agents can run in parallel. The open question is *which pages and
which claims* are worth that spend.

---

**Q0 — If the ten agents could only prove one thing about Jev in a browser by tomorrow, what would you want that proof to say, and to whom?**
▷
`() → a ranked list of use-case families, each with the claim it must prove and the result that would make you drop it`
*Compose: filter-chain (∧) over Q1–Q5 — Q1 supplies candidate families from where time is lost today; Q2 keeps only those whose measurement would change a real decision; Q3 adds the page and file types that break current tools; Q4 orders by what can be shown to someone who matters; Q5 removes anything that touches money, sends, or other people's data.*

- **Q1 — Where did browser automation actually cost you or a client time in the last month?**
  ▷
  `() → list of concrete flows, each with who waited and how long`
  *Compose: union (∪) of Q1.1–Q1.4; a flow that appears in two answers counts double.*

  - ★ **Q1.1 — Narrate the last time you or an agent sat through a slow model-driven browser task: what was the task, how long did it take, and what did you do while waiting?**
    ▷
  - **Q1.2 — Which repeated browser job do you or a client run every week that a person could describe in five steps or fewer?**
    ▷
  - **Q1.3 — Which browser task has failed silently on you, where you only found out later that a click or a form never took?**
    ▷
  - **Q1.4 — Which task did you give up automating because the pages kept changing or blocking you?**
    ▷

- **Q2 — What result would actually change a decision you or a buyer are about to make?**
  ▷
  `() → the decision, the number that moves it, and the threshold`
  *Compose: weighted read, honesty-doubled — Q2.2 (a decision already on the table) counts double over Q2.1 (a number that would be nice to have).*

  - **Q2.1 — If Jev were shown right on 95 of 100 verifications across varied pages, what would you do differently next week?**
    ▷
  - ★ **Q2.2 — Is there a conversation, proposal, or build already scheduled where a browser-speed or reliability number would be quoted? Which one, and what number is it waiting for?**
    ▷
  - **Q2.3 — What result would make you stop this line of work: an error rate, a page type it cannot read, a cost per decision?**
    ▷

- **Q3 — Which kinds of pages and files does your current tooling handle worst?**
  ▷
  `() → list of page and file types to include, each with the failure it caused`
  *Compose: union (∪) of Q3.1–Q3.4; a type named with a specific failure counts double over one named in general.*

  - ★ **Q3.1 — Think of a PDF, a spreadsheet export, a JSON response, or an image a browser agent had to read: what was it, and where did it go wrong?**
    ▷
  - **Q3.2 — Which sites throw a login wall, a cookie banner, a captcha, or a "verifying your browser" page at you, and what do you do when they do?**
    ▷
  - **Q3.3 — Which single-page apps or dashboards have you tried to drive, where the URL never changes when the content does?**
    ▷
  - **Q3.4 — Have you needed to read pages in a language other than English, and what happened?**
    ▷

- **Q4 — Who needs to see this working, and what would convince them?**
  ▷
  `() → the audience, the artifact they would look at, and the one thing it must show`
  *Compose: argmax over Q4.1–Q4.3 by how soon the audience acts on it.*

  - ★ **Q4.1 — When you last showed someone an automation demo, what did they literally ask or object to afterwards?**
    ▷
  - **Q4.2 — Would a recording they can scrub through, a table of numbers, or a live run in front of them convince them most, and why that one?**
    ▷
  - **Q4.3 — Which of these three would a sceptic attack first: the speed, the accuracy, or the safety, and what would they say?**
    ▷

- **Q5 — What must the ten agents never touch, whatever the page?**
  ▷
  `() → the exclusion list, each with its reason`
  *Compose: union (∪) of Q5.1–Q5.3; anything named here is removed from every other branch.*

  - **Q5.1 — Which accounts, sites, or credentials are off limits even for a read-only visit?**
    ▷
  - ★ **Q5.2 — Has an automated agent ever done something on a site that you had to apologise for or undo? What was it?**
    ▷
  - **Q5.3 — Is there any page whose content should never be stored in a recording or a corpus, and why?**
    ▷

---

When you send this back: your answers get composed up each branch by the rules printed
under each question, disagreements between your shallow calls and your deep episodes get
surfaced back to you first, and only then does the sheet resolve Q0 into the ranked list
that the catalog and the ten-agent workflow are built from.
