const DEV_BYPASS_FATAL_MESSAGE =
  'FATAL: NEXT_PUBLIC_DEV_BYPASS must not be set to true outside development.';

export const isDevEnvironment = process.env.NODE_ENV === 'development';
export const isDevBypassRequested = process.env.NEXT_PUBLIC_DEV_BYPASS === 'true';
export const isDevBypassEnabled = isDevEnvironment && isDevBypassRequested;

export function assertDevBypassConfigSafe(): void {
  if (isDevBypassRequested && !isDevEnvironment) {
    throw new Error(DEV_BYPASS_FATAL_MESSAGE);
  }
}
