# After Sign-in, May the Agent Keep Going? — Answer Sheet for the operator

v0.1 — generated 2026-09-28 · depth budget 3 (materiality stopped at 2) · task: "sign in to the portal, then continue"

## How to answer this sheet

Answer at any depth, in any order, and skip freely. Deep answers compose upward into
evidence for the questions above them. A direct answer to a shallow question stands on
its own as your collapsed call on that whole branch. Answering both a parent and its
children at different depths is the built-in consistency check — if they disagree, that
disagreement is the finding.

Every question has its own `▷` line — write there, plain language, badly is fine.
The ★ questions are the minimum viable interview: if you only answer the ★ set, the
sheet still works.

One thing you do NOT need to tell us — it is already known and pre-filled: the agent
types the credentials and clicks Sign in through Vibium, and it re-maps the page after
the click. The sheet is about what happens next.

---

**Q0 — Once the agent has typed your credentials and clicked Sign in, what has to be true on the screen before you would let it carry on to the next step without asking you?**
▷
`() → verify-spec: the visible signs of success, the visible signs of failure, the checks code owns, the moments that always stop for you, and the wait budget`
*Compose: filter-chain (∧) over Q1, Q2, Q3, Q4, Q5 — Q1 names the signs that must be present, Q2 the signs that must be absent, Q3 moves exact checks out of the model's list into code, Q4 lists the steps that park for you even on a clean pass, Q5 caps how long the agent waits before it asks.*

- **Q1 — What does a successful sign-in look like on the page, the moment it lands?**
  ▷
  `() → list of visible signs of success`
  *Compose: union (∪) of Q1.1–Q1.4; a sign that appears in two answers counts double.*

  - ★ **Q1.1 — Think of the last time you signed in by hand: what was the very first thing on the screen that told you "I'm in"?**
    ▷
  - **Q1.2 — Which words or controls are on the landed page every single time, and which only sometimes, like a promo banner or a "what's new" popup?**
    ▷
  - **Q1.3 — Does the address bar change once you are in, and to what, or does it stay where it was?**
    ▷
  - **Q1.4 — If a colleague glanced at your screen, what would they point at to prove you are signed in and not just looking at the login page again?**
    ▷

- **Q2 — What does a failed or stuck sign-in look like, including the ones that fool you?**
  ▷
  `() → list of visible signs of failure or interruption`
  *Compose: union (∪) of Q2.1–Q2.4; a sign that has fooled you once (Q2.2) counts double.*

  - **Q2.1 — Narrate the last time the sign-in did not work: what did the page show, where on the page, and in what words?**
    ▷
  - ★ **Q2.2 — Has a sign-in ever looked like it worked and turned out not to have? What did you see at the time, and what did you find later?**
    ▷
  - **Q2.3 — What does the portal throw at you that is not a failure but stops you anyway, like a code by text message, a captcha, a cookie banner, or an expired-password prompt?**
    ▷
  - **Q2.4 — When the page just sits there spinning, what do you see, and what is the first thing you do about it?**
    ▷

- **Q3 — Which of those signs would you rather have a script check exactly than have anyone judge by eye?**
  ▷
  `() → list of checks owned by code, not by a model`
  *Compose: filter-chain (∧) — every sign from Q1 and Q2 that Q3.1–Q3.3 mark as an exact string, address, or cookie leaves the model's question list and becomes a code check.*

  - ★ **Q3.1 — Of the success signs you named, which are an exact word or web address you could paste into a test right now?**
    ▷
  - **Q3.2 — Of the failure signs, which are exact too, and which does only a person recognise, like a page that just looks "off"?**
    ▷
  - **Q3.3 — Is there anything you would check that is not on the page at all, like a cookie, a second tab opening, or an email arriving?**
    ▷

- **Q4 — After sign-in, which next steps should always stop and wait for you, even when everything looks right?**
  ▷
  `() → list of always-park moments`
  *Compose: union (∪) of Q4.1–Q4.3; any step that moves money or sends data to someone outside is included whatever you answer.*

  - ★ **Q4.1 — When has an automation, a macro, or a colleague done the step after sign-in for you, and you wished they had not? What did it do?**
    ▷
  - **Q4.2 — Which page after sign-in would you never want clicked through without seeing it yourself, and why that one?**
    ▷
  - **Q4.3 — When the step after sign-in has gone wrong, what is the worst thing that has actually happened to you, not could happen?**
    ▷

- **Q5 — How long is the agent allowed to wait for the page to settle before it gives up and asks you?**
  ▷
  `() → seconds, plus what to do on timeout`
  *Compose: weighted read, honesty-doubled — Q5.2 (what you actually do) counts double over Q5.1 (what you think is reasonable); Q5.3 decides whether a retry is ever allowed.*

  - **Q5.1 — When you sign in by hand, how many seconds do you usually wait before you start to worry?**
    ▷
  - ★ **Q5.2 — The last time it was slow, what did you actually do: wait it out, refresh, click Sign in again, or open a new tab?**
    ▷
  - **Q5.3 — Has refreshing or clicking Sign in twice ever made it worse, like a double submit or a locked account? What happened?**
    ▷

---

When you send this back: your answers get composed up each branch by the rules printed
under each question, disagreements between your shallow calls and your deep episodes get
surfaced back to you first, and only then does the sheet resolve Q0 into a verify-spec.
Q1 and Q2 become the model's literal questions, Q3 becomes the code checks that run
before any model is asked, Q4 becomes the human gate, and Q5 becomes the timeout.
