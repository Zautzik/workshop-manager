/**
 * @fileoverview Navigation Utilities (React Router-like hooks)
 * 
 * SYSTEM ROLE: Client-side Navigation Helper
 * ORGAN ANALOGY: The "Traffic Control System" - Directs user navigation within the app
 * 
 * Provides custom hooks that abstract Next.js routing:
 * 
 * - useNavigate(): Returns a function to programmatically navigate to paths
 *   Similar to React Router's useNavigate hook
 * 
 * - useLocation(): Returns current pathname and location info
 *   Provides location object compatible with React Router's useLocation
 * 
 * These hooks wrap Next.js's built-in useRouter and usePathname for consistency.
 */
'use client';

import { useRouter, usePathname } from 'next/navigation';

export function useNavigate() {
	const router = useRouter();

	return (path: string) => {
		router.push(path);
	};
}

export function useLocation() {
	const pathname = usePathname();

	return {
		pathname,
		search: '',
		hash: '',
		state: null,
		key: 'default',
	};
}
