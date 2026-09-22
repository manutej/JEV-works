/**
 * Every pattern baseline.ts runs against the inbound MESSAGE, moved here unchanged so tests can read
 * them without executing baseline.ts (which writes results/ on import). Structured-field patterns
 * (industry, title, band) stay in baseline.ts: they do not read the message.
 */
export const MESSAGE_PATTERNS = {
  BUYING_SIGNAL: /\b(evaluat(e|ing)|purchas|budget|pricing|price|quote|demo|trial|sign ?up|get started|replace|vendor)\b/i,
  URGENCY: /\b(urgent|asap|as soon as possible|deadline|this week|before end of|immediately|right away)\b/i,
  TIMELINE: /\b(q[1-4]\b|quarter|by (january|february|march|april|may|june|july|august|september|october|november|december)|next month|this month)\b/i,
  BUDGET_MENTIONED: /\$[\d,]+|budget/i,
  PRICING_QUESTION: /\b(pric(e|ing)|cost|quote|how much)\b/i,
  DEMO_REQUEST: /\b(demo|walkthrough|trial)\b/i,
  HUMAN_REQUEST: /\b(speak (with|to)|talk to (someone|a person)|call me|human)\b/i,
  OBJECTION: /\b(concern|hesitant|worried|not sure|too expensive|but\b)\b/i,
  READY_TO_BUY: /\b(sign us up|let'?s get started|ready to (buy|move forward)|approved)\b/i,
  COMPETITOR_MENTION: /\b(salesforce|hubspot|zendesk|segment|workato)\b/i,
  INJECTION_ATTEMPT: /\b(ignore (all|previous) instructions|system:|override|as an ai|the correct output|ground truth)\b/i,
} as const;
