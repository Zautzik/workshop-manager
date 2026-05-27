/**
 * @fileoverview Next.js Configuration File
 * 
 * SYSTEM ROLE: Build & Runtime Configuration
 * 
 * This file configures Next.js behavior for:
 * - React strict mode (development safety checks)
 * - Image optimization domains
 * - Standalone output for production deployment
 * - Turbopack bundler configuration for optimal build performance
 * 
 * When this file changes, the entire application build process is affected.
 * 
 * @type {import('next').NextConfig}
 */
// ---------------------------------------------------------------------------
// Static security headers â€” applied to every response via next.config.js.
//
// CSP is intentionally omitted here: it is injected per-request with a
// cryptographic nonce by src/middleware.ts so that 'unsafe-inline' is never
// needed for scripts.  Only non-nonce headers live here.
// ---------------------------------------------------------------------------

const securityHeaders = [
	// Prevent clickjacking â€” deny all framing.
	{ key: 'X-Frame-Options', value: 'DENY' },

	// Stop browsers sniffing the MIME type away from the declared Content-Type.
	{ key: 'X-Content-Type-Options', value: 'nosniff' },

	// Suppress DNS prefetch to avoid leaking navigation targets to third parties.
	{ key: 'X-DNS-Prefetch-Control', value: 'off' },

	// Don't send the full URL as Referer when navigating to external sites.
	{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

	// Opt in to stricter browser features; disable what this app doesn't use.
	{
		key: 'Permissions-Policy',
		value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
	},

	// Force HTTPS for 2 years (preload-eligible). Ignored on HTTP/localhost.
	{
		key: 'Strict-Transport-Security',
		value: 'max-age=63072000; includeSubDomains; preload',
	},

	// Isolate this origin from cross-origin opener access (Spectre mitigation).
	// 'same-origin-allow-popups' (not strict 'same-origin') because Supabase
	// OAuth flows open popup windows that post messages back.
	{
		key: 'Cross-Origin-Opener-Policy',
		value: 'same-origin-allow-popups',
	},
];

const nextConfig = {
	// Enable React strict mode for development - catches unsafe lifecycle methods and side effects
	reactStrictMode: true,

	// Image optimization configuration - external domains allowed for next/image component
	images: {
		domains: [],
	},

	// Output as standalone for docker/production deployment - bundles all dependencies into .next/standalone
	output: 'standalone',

	// Configure Turbopack (fast bundler) root to this project to avoid parent folder lockfiles
	turbopack: {
		root: __dirname,
	},

	async headers() {
		return [
			{
				// Apply to every route.
				source: '/(.*)',
				headers: securityHeaders,
			},
		];
	},
};

module.exports = nextConfig;
