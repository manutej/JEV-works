/**
 * One place that decides how Jev is reached. Scripts pass `JEV` as `model:` and never name a backend.
 *
 *   JEV_BACKEND=direct   TypeSafe API with TYPESAFE_API_KEY (no expiry)
 *   JEV_BACKEND=gateway  Vercel AI Gateway, 'typesafe-ai/jev' (OIDC token, ~12h)
 *   unset                direct when the key is present, otherwise gateway
 *
 * Direct defaults to the PINNED `jev-1.13.0` (the sibling repos' rule: never `jev-latest` in prod).
 * JEV_MODEL overrides the id on either backend, e.g. `jev-latest` to measure drift.
 * `JEV_ID` is what logs and result files record, so every run says which path produced it.
 * Pricing stays keyed on the gateway id — same model, and the only live price list we have.
 */
import { jevDirect } from './jev-direct.ts';

const backend = process.env.JEV_BACKEND ?? (process.env.TYPESAFE_API_KEY ? 'direct' : 'gateway');
if (backend !== 'direct' && backend !== 'gateway') throw new Error(`JEV_BACKEND must be direct|gateway, got ${backend}`);

const id = process.env.JEV_MODEL ?? (backend === 'direct' ? 'jev-1.13.0' : 'typesafe-ai/jev');

export const JEV_BACKEND: 'direct' | 'gateway' = backend;
export type JevModel = string | ReturnType<typeof jevDirect>;
export const JEV: JevModel = backend === 'direct' ? jevDirect(id) : id;
export const JEV_ID = `${id} (${backend})`;
export const JEV_PRICE_ID = 'typesafe-ai/jev';

/**
 * The version that actually answered, as the provider reported it. Record this next to JEV_ID: an alias
 * like `jev-latest` resolves server-side, and a result without the resolved version cannot be diffed later.
 * Direct returns e.g. `jev-1.13.0`; the gateway reports its alias, so there it equals the requested id.
 */
export const answeredBy = (r: { response: { modelId: string } }) => r.response.modelId;
