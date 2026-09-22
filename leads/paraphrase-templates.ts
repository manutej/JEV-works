/**
 * Message templates for the PARAPHRASE corpus variant (seeds written `p<n>`, e.g. `--seed p3001`).
 *
 * STRESS TEST, NOT A GENERALISATION TEST. These were written by someone who had read the regex
 * baseline's keyword lists, and every template is checked (paraphrase-templates.test.ts) to match
 * NONE of the baseline's message patterns. The corpus is therefore adversarial to the regex by
 * construction. What it can show: whether reading a message beats scoring a record's shape when
 * the two disagree. What it cannot show: that Jev generalises to paraphrase in the wild.
 *
 * Two kinds of lead, both at companies whose structured fields (ICP industry, 51+ employees) score
 * as qualified under the regex on their own:
 *   buyer      genuine intent to buy, in words the regex does not look for   -> qualified
 *   nonBuyer   an ICP-shaped record whose sender is not buying (support request from an existing
 *              customer, job applicant, unsubscribe, partnership pitch, analyst) -> not qualified
 */

export type TemplateSlots = { team: string; current: string; industry: string };

export const PARAPHRASE_BUYER_TEMPLATES: ReadonlyArray<(s: TemplateSlots) => string> = [
  s => `We have outgrown ${s.current} for tracking who has access to what, and I have been asked to find something that can handle it properly. Could you send over what it would take to roll this out across our ${s.team}?`,
  s => `I lead the platform group here and we need a better way to handle audit logging across our services. I would like to set up time with whoever can show us how your product works in practice for a team like ours.`,
  s => `Leadership has set aside spend for tooling in this area this year and your product is on our shortlist. What would onboarding look like for a ${s.team} of our size, and who should I work with on your side?`,
  s => `We are choosing between a couple of options for this and yours came up in a recommendation from a peer. Can you share how companies like ours usually get set up, and what you would need from us to start?`,
  s => `Our security review flagged gaps in how we manage service credentials, and fixing it is now one of my goals. I would like to understand whether your product covers that for a ${s.team} running mostly on ${s.current}.`,
];

export const NON_BUYER_TEMPLATES: ReadonlyArray<(s: TemplateSlots) => string> = [
  () => `We are already a customer and our admin account has been locked since the single sign-on change yesterday. Who on your support side can get us back in?`,
  () => `I am applying for the solutions engineer opening on your careers page and wanted to send my portfolio directly to the hiring manager for that role.`,
  () => `Please remove our company from your mailing list. We do not want further emails from your team, and nobody here asked to be contacted.`,
  s => `We build tooling for ${s.industry.toLowerCase()} teams and think there is a natural integration between our products. Would your partnerships lead be open to an introduction?`,
  () => `I am on the analyst team here, putting together a market map of products in your space for an internal report. We are not looking to use anything ourselves; I just want an accurate description of what you do.`,
];

/** Fixed sample slots used by the keyword-exclusion test, covering every value the generator can draw. */
export const SAMPLE_TEAMS = ['engineering team', 'platform team', 'security team', 'operations team'] as const;
