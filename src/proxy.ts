import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, retryAfterSeconds } from '@/lib/rate-limiter';
import { getClientIp } from '@/lib/client-ip';

// ---------------------------------------------------------------------------
// Supabase CSP sources.
// Resolve once at module load and fall back to the hosted Supabase wildcard
// when the env var is missing or malformed during local boot / type analysis.
// ---------------------------------------------------------------------------
function getSupabaseCspSources() {
	const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

	if (!rawUrl) {
		return {
			http: 'https://*.supabase.co',
			ws: 'wss://*.supabase.co',
		};
	}

	try {
		const url = new URL(rawUrl);
		const wsProtocol = url.protocol === 'http:' ? 'ws:' : 'wss:';

		return {
			http: url.origin,
			ws: `${wsProtocol}//${url.host}`,
		};
	} catch {
		return {
			http: 'https://*.supabase.co',
			ws: 'wss://*.supabase.co',
		};
	}
}

const SUPABASE_CSP_SOURCES = getSupabaseCspSources();

// ── Rate limiting ────────────────────────────────────────────────────────────
//
// Implemented in src/lib/rate-limiter.ts (fixed window, in-process Map).
// Tiers differ by route sensitivity:
//   auth     →  10 req / 60 s  (brute-force / credential-stuffing defence)
//   webhook  → 100 req / 60 s  (WhatsApp inbound — generous for retries)
//   api      → 200 req / 60 s  (general API — DoS threshold)
//
// Page routes are not rate-limited here; humans browsing quickly shouldn't
// hit a 429.  The /api/auth/callback/credentials handler adds its own tighter
// per-IP limit (5 attempts / 60 s) on top.
//
// The `auth` tier covers only requests that actually submit credentials.
// Most of /api/auth is read-only chatter from the NextAuth client — it fetches
// /session on mount and on every tab focus, /providers + /csrf before each
// signIn, and POSTs its own errors to /_log. Counting those against 10/60 s
// exhausted the window during normal use, and because /_log is itself under
// /api/auth, one 429 fed back into the next.

const RATE_LIMITS = {
	auth:    { requests: 10,  windowMs: 60_000 },
	webhook: { requests: 100, windowMs: 60_000 },
	api:     { requests: 200, windowMs: 60_000 },
} as const;

type RlTier = keyof typeof RATE_LIMITS;

/**
 * NextAuth paths that carry credentials. Sign-in POSTs land on
 * /api/auth/callback/<provider>; /api/auth/signin/<provider> is the
 * non-JS form-post fallback.
 */
const CREDENTIAL_SUBMISSION_PATHS = ['/api/auth/callback', '/api/auth/signin'];

/** Map a request to its rate-limit tier, or null to skip limiting. */
function getRlTier(pathname: string, method: string): RlTier | null {
	if (pathname.startsWith('/api/auth')) {
		const submitsCredentials =
			method === 'POST' &&
			CREDENTIAL_SUBMISSION_PATHS.some((p) => pathname.startsWith(p));
		return submitsCredentials ? 'auth' : 'api';
	}
	if (pathname.startsWith('/api/whatsapp')) return 'webhook';
	if (pathname.startsWith('/api/'))         return 'api';
	return null;
}

/**
 * Build a per-request Content-Security-Policy using the supplied nonce.
 *
 * Why nonce-based CSP?
 *   A static CSP that allows 'unsafe-inline' for scripts can be bypassed by
 *   any XSS payload that injects a <script> tag.  A per-request nonce means
 *   only script tags that carry the exact nonce value can execute — the
 *   attacker cannot predict it.
 *
 * 'strict-dynamic' behaviour:
 *   - Modern browsers: 'unsafe-inline' and host allowlists in script-src are
 *     ignored; only nonce-tagged scripts (and scripts they dynamically load)
 *     are permitted.  This is the tight path.
 *   - Older browsers that don't support 'strict-dynamic': they fall back to
 *     the host allowlist ('self') and 'unsafe-inline', which preserves
 *     compatibility without crashing the app.
 *
 * 'unsafe-eval' is included only in development (NODE_ENV !== 'production')
 *   because Next.js hot-module replacement uses eval().  It is stripped in
 *   production builds where eval() is never needed.
 *
 * Dev-only websocket sources:
 *   Fast Refresh pushes rebuild notifications over a websocket to the dev
 *   server's own origin. Per CSP Level 3, `'self'` does NOT cover a ws:// URL
 *   from an http:// page — only an https:/wss: upgrade of the page origin
 *   matches — so `connect-src 'self'` silently blocks that socket and the
 *   browser never learns a rebuild finished (the page stops auto-reloading on
 *   save). The socket's host is derived from the request rather than hardcoded
 *   to localhost so this also works when the dev server is reached over a LAN
 *   IP — e.g. testing the estación kiosk on a tablet.
 */
function buildCsp(nonce: string, host: string): string {
	const isDev = process.env.NODE_ENV !== 'production';

	// Same-origin HMR socket, dev only. Both schemes so it holds behind a
	// TLS-terminating tunnel (ngrok/Cloudflare) as well as plain http.
	const devWs = isDev ? ` ws://${host} wss://${host}` : '';

	return [
		`default-src 'self'`,

		// Nonce covers Next.js hydration scripts + any explicitly nonce'd tags.
		// 'strict-dynamic' lets those scripts load further chunks without
		// requiring every chunk URL to be listed here.
		// 'unsafe-inline' is present for fallback in browsers without nonce
		// support; modern browsers ignore it when 'strict-dynamic' is active.
		`script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,

		// Tailwind JIT + shadcn/ui need inline styles; there is no safe nonce
		// alternative for style-src without a full CSS-in-JS migration.
		`style-src 'self' 'unsafe-inline'`,

		// Same-origin images + data URIs + blobs + Supabase public storage.
		`img-src 'self' data: blob: ${SUPABASE_CSP_SOURCES.http}`,

		// All fonts served from the same origin (no Google Fonts / CDN).
		`font-src 'self'`,

		// XHR/fetch to same origin + Supabase REST API + Supabase Realtime WS
		// (+ the Fast Refresh socket in development).
		`connect-src 'self' ${SUPABASE_CSP_SOURCES.http} ${SUPABASE_CSP_SOURCES.ws}${devWs}`,

		`media-src 'self'`,

		// Web Workers / Service Workers from same origin or blob: (Next.js uses blob:).
		`worker-src 'self' blob:`,

		// Disallow plugins (<object>, <embed>, <applet>).
		`object-src 'none'`,

		// Prevent <base> tag hijacking.
		`base-uri 'self'`,

		// All form submissions stay on this origin.
		`form-action 'self'`,

		// Belt-and-suspenders: also block framing inside the CSP.
		`frame-ancestors 'none'`,
	].join('; ');
}

/**
 * Next.js Proxy — runs before every non-static request.
 *
 * Responsibilities:
 *  1. Attach a trace request ID (from upstream proxy or freshly generated).
 *  2. Generate a cryptographic nonce and set it as Content-Security-Policy
 *     so Next.js can stamp its inline hydration scripts with the nonce.
 *  3. Forward the nonce to the layout via x-nonce so the server component
 *     can pass it to any explicit <Script> tags or meta elements.
 */
export function proxy(req: NextRequest) {
	// ── 0. Rate limiting ─────────────────────────────────────────────────────
	const { pathname } = req.nextUrl;
	const tier = getRlTier(pathname, req.method);
	if (tier) {
		const ip = getClientIp(req);
		const { requests, windowMs } = RATE_LIMITS[tier];
		const result = checkRateLimit(`${tier}:${ip}`, requests, windowMs);
		if (!result.ok) {
			return new NextResponse(
				JSON.stringify({ error: 'Too Many Requests' }),
				{
					status: 429,
					headers: {
						'Content-Type': 'application/json',
						'Retry-After': String(retryAfterSeconds(result)),
					},
				},
			);
		}
	}

	// ── 1. Request-ID tracing ────────────────────────────────────────────────
	const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

	// ── 2. Per-request CSP nonce ─────────────────────────────────────────────
	// Base64-encode a UUID so it is safe to embed directly in a header value.
	const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
	const csp = buildCsp(nonce, req.nextUrl.host);

	// ── 3. Build the forwarded request headers ───────────────────────────────
	// Next.js reads the nonce from the *request* Content-Security-Policy header
	// to stamp its inline hydration scripts. Without this, that inline bootstrap
	// script carries no nonce and is blocked by the response CSP (surfacing as the
	// app-wide "1 Issue" dev-overlay error).
	const requestHeaders = new Headers(req.headers);
	requestHeaders.set('x-request-id', requestId);
	requestHeaders.set('x-nonce', nonce);
	requestHeaders.set('Content-Security-Policy', csp);

	const res = NextResponse.next({
		request: { headers: requestHeaders },
	});

	// ── 4. Set response headers ──────────────────────────────────────────────
	// Echo request ID so clients / curl / Sentry can correlate with server logs.
	res.headers.set('x-request-id', requestId);

	// Per-request CSP with nonce — overrides any static CSP from next.config.js.
	res.headers.set('Content-Security-Policy', csp);

	return res;
}

export const config = {
	matcher: [
		/*
		 * Match all request paths EXCEPT:
		 *  - _next/static  (compiled JS/CSS bundles — already content-hashed)
		 *  - _next/image   (Next.js image optimisation endpoint)
		 *  - Static assets with known-safe extensions
		 *
		 * This ensures every HTML page and API route gets a fresh nonce and
		 * request ID, while static file serving is not needlessly intercepted.
		 */
		'/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
	],
};
