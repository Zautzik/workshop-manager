/**
 * Fixed-window in-memory rate limiter.
 *
 * Suitable for single-instance (standalone) Next.js deployments.
 * For multi-instance or serverless deployments replace with an
 * Upstash Redis implementation: https://github.com/upstash/ratelimit-js
 *
 * The store is a module-level Map so it persists across requests for
 * the lifetime of the Node.js process. A background interval sweeps
 * expired windows every 5 minutes to keep memory bounded.
 */

interface RateWindow {
  count: number;
  /** Unix ms when this window expires and the counter resets. */
  resetAt: number;
}

const store = new Map<string, RateWindow>();

// Tope duro, independiente del barrido de 5 minutos. Cada key nueva es una
// entrada que sobrevive hasta el próximo barrido — si alguien encuentra la
// forma de mandar una key distinta por request (spoofear el actor detrás de
// la key es el ejemplo real: ver getClientIp en src/lib/client-ip.ts), el
// Map crece sin freno hasta ese barrido. Este tope no arregla eso —arreglar
// la key es lo que lo arregla— pero evita que un bug futuro reproduzca la
// misma forma sin depender de que alguien se acuerde del barrido.
const MAX_ENTRIES = 50_000;

const SWEEP_INTERVAL_MS = 5 * 60 * 1_000;
let sweepTimer: ReturnType<typeof setInterval> | undefined;

function ensureSweep(): void {
  if (sweepTimer !== undefined) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, win] of store) {
      if (win.resetAt <= now) store.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  // Don't keep the Node.js event loop alive solely for sweeping.
  sweepTimer.unref?.();
}

export interface RateLimitResult {
  /** True if the request is within the allowed limit. */
  ok: boolean;
  limit: number;
  remaining: number;
  /** Unix ms when the current window resets. */
  resetAt: number;
}

/**
 * Check whether `key` has exceeded `limit` requests within `windowMs`.
 *
 * @param key      Unique string identifying the caller + action.
 *                 Examples: `"login:1.2.3.4"`, `"whatsapp:+5491112345678"`
 * @param limit    Max requests allowed inside one window.
 * @param windowMs Window length in milliseconds.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  ensureSweep();
  const now = Date.now();

  if (store.size >= MAX_ENTRIES && !store.has(key)) {
    // Evict the oldest entry (Map preserves insertion order) rather than
    // reject the request — a false "not limited" for one caller is safer
    // than an unbounded Map under sustained key-spoofing.
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) store.delete(oldestKey);
  }

  let win = store.get(key);
  if (!win || win.resetAt <= now) {
    win = { count: 0, resetAt: now + windowMs };
    store.set(key, win);
  }

  win.count += 1;

  return {
    ok: win.count <= limit,
    limit,
    remaining: Math.max(0, limit - win.count),
    resetAt: win.resetAt,
  };
}

/** Seconds until the rate-limit window resets (for the Retry-After header). */
export function retryAfterSeconds(result: RateLimitResult): number {
  return Math.ceil((result.resetAt - Date.now()) / 1_000);
}
