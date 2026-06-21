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
const { withSentryConfig } = require('@sentry/nextjs');

if (process.env.NEXT_PUBLIC_DEV_BYPASS === 'true' && process.env.NODE_ENV !== 'development') {
	throw new Error('FATAL: NEXT_PUBLIC_DEV_BYPASS must not be set in non-development builds');
}

// ---------------------------------------------------------------------------
// Static security headers applied to every response via next.config.js.
//
// Content-Security-Policy is intentionally omitted here because src/proxy.ts
// injects a stronger per-request nonce-based CSP at runtime. Keeping CSP in
// one place avoids a weaker static fallback drifting out of sync.
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

	// ---------------------------------------------------------------------------
	// Analítica module URL migration: the analytics sections were consolidated
	// from their legacy role-based trees (/financial, /admin/overview, /manager)
	// into a single /analitica/* tree that matches the module. These redirects
	// keep old links/bookmarks working. (permanent: false / 307 while the IA
	// migration is in progress — flip to true once it's settled.)
	// ---------------------------------------------------------------------------
	async redirects() {
		return [
			// ── Analítica consolidation (/financial + /manager + /admin/overview → /analitica) ──
			{ source: '/financial',            destination: '/analitica',                          permanent: false },
			{ source: '/financial/costos',     destination: '/analitica/costos',                   permanent: false },
			{ source: '/financial/costos-ot',  destination: '/analitica/rentabilidad?tab=costos',  permanent: false },
			{ source: '/financial/maquinas',   destination: '/equipos/economia',                   permanent: false },
			{ source: '/financial/inversion',  destination: '/equipos/economia?tab=inversion',     permanent: false },
			{ source: '/analitica/inversion',  destination: '/equipos/economia?tab=inversion',     permanent: false },
			{ source: '/financial/margenes',   destination: '/analitica/rentabilidad',             permanent: false },
			{ source: '/financial/nomina',     destination: '/analitica/nomina',                   permanent: false },
			{ source: '/financial/ots',        destination: '/analitica/rentabilidad?tab=seguimiento', permanent: false },

			// ── Rentabilidad consolidation: márgenes + costos-ot + ots merged into one tabbed workspace ──
			{ source: '/analitica/margenes',   destination: '/analitica/rentabilidad',                 permanent: false },
			{ source: '/analitica/costos-ot',  destination: '/analitica/rentabilidad?tab=costos',      permanent: false },
			{ source: '/analitica/ots',        destination: '/analitica/rentabilidad?tab=seguimiento', permanent: false },
			{ source: '/admin/overview',       destination: '/analitica/dashboard',    permanent: false },
			{ source: '/manager',              destination: '/analitica',              permanent: false },
			{ source: '/manager/kpis',         destination: '/analitica/dashboard',    permanent: false }, // dup of Dashboard
			{ source: '/manager/costos',       destination: '/analitica/rentabilidad?tab=costos', permanent: false }, // dup of Costo por OT
			{ source: '/manager/trabajadores', destination: '/analitica/rendimiento',  permanent: false },
			{ source: '/manager/trazabilidad', destination: '/analitica/trazabilidad', permanent: false },
			{ source: '/manager/tendencias',   destination: '/analitica/tendencias',   permanent: false },
			{ source: '/manager/actividad',    destination: '/analitica/actividad',    permanent: false },
			{ source: '/manager/auditoria',    destination: '/analitica/auditoria',    permanent: false },

			// ── Operaciones consolidation (/workflow → /operaciones; abastecimiento pulled from /admin) ──
			{ source: '/workflow',           destination: '/operaciones',             permanent: false },
			// Planificación consolidation: plan-semanal merged into the calendar tabs.
			{ source: '/operaciones/plan-semanal', destination: '/operaciones/calendar?tab=semanal', permanent: false },
			{ source: '/workflow/plan-semanal',    destination: '/operaciones/calendar?tab=semanal', permanent: false },
			{ source: '/workflow/:path*',    destination: '/operaciones/:path*',      permanent: false },
			{ source: '/admin/inventory',    destination: '/operaciones/inventario',  permanent: false },
			{ source: '/admin/purchases',    destination: '/operaciones/compras',     permanent: false },
			{ source: '/admin/suppliers',    destination: '/operaciones/proveedores', permanent: false },

			// ── Personas (/hr → /personas) + Equipos (/maintenance → /equipos) ──
			{ source: '/hr',                 destination: '/personas',                permanent: false },
			{ source: '/hr/:path*',          destination: '/personas/:path*',         permanent: false },
			{ source: '/maintenance',        destination: '/equipos',                 permanent: false },
			{ source: '/maintenance/:path*', destination: '/equipos/:path*',          permanent: false },

			// ── Administración (/admin → /administracion). Specific /admin/* relocations
			// above MUST precede this catch-all (Next matches top-to-bottom). ──
			{ source: '/admin/training',     destination: '/personas/capacitacion',   permanent: false },
			{ source: '/admin/workers',      destination: '/personas/operarios',      permanent: false },
			{ source: '/admin',              destination: '/administracion',          permanent: false },
			{ source: '/admin/:path*',       destination: '/administracion/:path*',   permanent: false },
		];
	},
};

module.exports = withSentryConfig(nextConfig, {
	org: process.env.SENTRY_ORG,
	project: process.env.SENTRY_PROJECT,
	authToken: process.env.SENTRY_AUTH_TOKEN,
	silent: true,
	disableLogger: true,
	sourcemaps: {
		disable: !process.env.SENTRY_AUTH_TOKEN,
	},
});
