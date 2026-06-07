import * as Sentry from '@sentry/nextjs';

const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1');

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.1,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
});
