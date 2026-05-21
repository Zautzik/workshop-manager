/**
 * @fileoverview Next.js Configuration File
 * 
 * SYSTEM ROLE: Build & Runtime Configuration
 * ORGAN ANALOGY: The "Skeleton" - Provides structural configuration for the entire application
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
// Security headers applied to every response.
//
// CSP notes:
//  - 'unsafe-inline' for style-src is required by Tailwind's runtime class
//    injection and shadcn/ui inline styles. Remove it once you adopt a
//    CSS-in-JS solution that supports nonces, or switch to Tailwind's JIT
//    build-time output only.
//  - connect-src includes Supabase (wss: for Realtime) and NextAuth.
//  - If you add a CDN, analytics service, or font host, extend the relevant
//    directive rather than widening to '*'.
// ---------------------------------------------------------------------------

const SUPABASE_HOST = process.env.NEXT_PUBLIC_SUPABASE_URL
	? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
	: '*.supabase.co';

const securityHeaders = [
	// Prevent clickjacking — deny all framing.
	{ key: 'X-Frame-Options', value: 'DENY' },

	// Stop browsers sniffing the MIME type away from the declared Content-Type.
	{ key: 'X-Content-Type-Options', value: 'nosniff' },

	// Don't send the full URL as Referer when navigating to external sites.
	{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

	// Opt in to stricter browser features; disable what this app doesn't use.
	{
		key: 'Permissions-Policy',
		value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
	},

	// Force HTTPS for 1 year (including subdomains). Only active once the app
	// is served over TLS; ignored by HTTP (localhost dev is unaffected).
	{
		key: 'Strict-Transport-Security',
		value: 'max-age=31536000; includeSubDomains',
	},

	// Content Security Policy.
	{
		key: 'Content-Security-Policy',
		value: [
			// Only load documents from the same origin.
			`default-src 'self'`,

			// Scripts: same origin + Next.js inline bootstrap (needs 'unsafe-inline'
			// in dev; in production Next uses nonces — switch to nonce-based CSP
			// via middleware.ts when you add a deploy pipeline that supports it).
			`script-src 'self' 'unsafe-inline' 'unsafe-eval'`,

			// Styles: same origin + inline (required by Tailwind runtime & shadcn).
			`style-src 'self' 'unsafe-inline'`,

			// Images: same origin + data URIs (for base64 avatars / QR codes).
			`img-src 'self' data: blob:`,

			// Fonts: same origin only (no Google Fonts or CDN in use).
			`font-src 'self'`,

			// XHR / fetch / WebSocket: same origin + Supabase (REST + Realtime).
			`connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,

			// Media: same origin.
			`media-src 'self'`,

			// Workers & service workers: same origin only.
			`worker-src 'self' blob:`,

			// Disallow <object>, <embed>, <applet>.
			`object-src 'none'`,

			// Disallow <base> tag hijacking.
			`base-uri 'self'`,

			// All form submissions must go to the same origin.
			`form-action 'self'`,

			// Disallow embedding this app in any frame (belt-and-suspenders with
			// X-Frame-Options above).
			`frame-ancestors 'none'`,
		].join('; '),
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
