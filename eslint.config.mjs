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
];
