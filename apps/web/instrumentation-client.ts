// ─── Sentry (Better Stack error tracking) ───────────────────────────────────
import './sentry.client.config';
import * as Sentry from '@sentry/nextjs';

// Instrument client-side navigations for performance tracing
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

// PostHog was removed (self-hosted internal deployment — no product
// analytics). Sentry above remains the only client instrumentation.
