/**
 * Flat ESLint config (ESLint 9+). Replaces .eslintrc.json — `next lint` was
 * removed in Next 16, so the `lint` script now invokes eslint directly.
 *
 * eslint-config-next/core-web-vitals is the same preset the old
 * "next/core-web-vitals" extends pointed at, in flat-config form.
 */
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

export default [
	{
		ignores: [
			'.next/**',
			'node_modules/**',
			'out/**',
			'build/**',
			'next-env.d.ts',
		],
	},
	...nextCoreWebVitals,
	{
		// react-hooks v7 ships React-Compiler-assisted rules as errors. They
		// flag long-standing patterns across this codebase (~30 sites) that are
		// refactor work, not regressions — keep them visible as warnings so new
		// code improves without blocking CI. rules-of-hooks stays an error.
		rules: {
			'react-hooks/set-state-in-effect': 'warn',
			'react-hooks/static-components': 'warn',
			'react-hooks/preserve-manual-memoization': 'warn',
			'react-hooks/refs': 'warn',
			'react-hooks/purity': 'warn',
			'react-hooks/immutability': 'warn',
		},
	},
	{
		/**
		 * TRIPWIRE — the write door.
		 *
		 * Writing to Supabase straight from the browser bypasses requireAuth, Zod
		 * validation and the HR compliance log, and is rejected by RLS whenever the
		 * browser client has no session (dev bypass). It fails *silently*: the UI
		 * reports success and nothing is saved. That class cost us the worker
		 * assignment bug, the cost-model save, and 33 further call-sites across
		 * inventory, maintenance, finance, skills and the mutation hooks
		 * (2026-07 audit — this rule itself found the last 16, which grep missed).
		 *
		 * Every write in src now goes through an API route, so this is an error
		 * everywhere. Reads stay allowed — they are protected by RLS and don't
		 * corrupt anything. Server-side `supabaseAdmin.from(...)` is untouched.
		 *
		 * If you need a new write: add a route under src/app/api with
		 * requireAuth + a Zod schema, and call it with fetch(credentials:'include').
		 */
		files: ['src/**/*.ts', 'src/**/*.tsx'],
		// API routes ARE the write layer. Several of them import the server client
		// under the local name `supabase`, which the selector below would otherwise
		// match — the rule is about the browser, not about the identifier.
		ignores: ['src/app/api/**'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					// Matches `supabase.from(...).insert/update/upsert/delete(...)`.
					// Keyed to the browser client's identifier so server-side
					// `supabaseAdmin.from(...)` in shared lib code is untouched.
					selector:
						"CallExpression[callee.property.name=/^(insert|update|upsert|delete)$/][callee.object.callee.object.name='supabase']",
					message:
						'No escribas a Supabase desde el navegador: RLS lo rechaza en silencio y se salta requireAuth/Zod. Crea una ruta en src/app/api y llámala con fetch(credentials:"include").',
				},
			],
		},
	},
	{
		/**
		 * TRIPWIRE — the discarded `error`.
		 *
		 * `const { data } = await supabase.from(...)...` throws away the one
		 * field that says the query failed. A bad column or table name (a
		 * dropped `workstation_id`, a renamed `due_date`) makes PostgREST answer
		 * with `{ data: null, error }` — no exception, no crash — and
		 * `(data ?? [])` turns that into a silently empty result, indistinguishable
		 * from a genuinely empty table. This exact shape produced the calendar's
		 * blank maintenance layer and several more findings in one pass
		 * (2026-08 audit).
		 *
		 * Staged at `warn`, same convention this config already used for the
		 * write-tripwire's own rollout (B.4b, 2026-07): the rule found ~50
		 * pre-existing sites in one run, mostly in already-shipped API routes
		 * that would take individual verification to fix correctly, not a
		 * blanket edit. Visible and counted now; migrate the routes on the
		 * golden thread first, then flip to `error` once the count is zero.
		 */
		files: ['src/**/*.ts', 'src/**/*.tsx'],
		rules: {
			'no-restricted-syntax': [
				'warn',
				{
					selector:
						"VariableDeclarator[id.type='ObjectPattern'][init.type='AwaitExpression']:has(ObjectPattern > Property[key.name='data']):not(:has(ObjectPattern > Property[key.name='error'])):has(CallExpression[callee.property.name='from']):has(Identifier[name=/^supabase/])",
					message:
						'Se lee `data` sin leer `error`: un error real de Postgrest (columna/tabla que no existe) se confunde con un resultado vacío. Desestructura también `error` y decide qué hacer con él (throw, log, o un estado de error visible).',
				},
			],
		},
	},
];
