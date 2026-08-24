/**
 * @fileoverview Global Providers Component
 * 
 * SYSTEM ROLE: State Management & Context Provider Layer
 * 
 * This component wraps the entire application with multiple context providers:
 * 
 * 1. SessionProvider (NextAuth) - Manages user authentication state globally
 * 2. QueryClientProvider (React Query) - Manages server data caching and fetching
 * 3. ThemeProvider - Handles light/dark mode theming
 * 4. AuthProvider - Custom authentication context with role-based access control
 * 5. TooltipProvider - Enables tooltip functionality throughout the app
 * 6. Toaster components - Display toast notifications from multiple sources
 *
 * All components below this provider have access to these contexts via hooks.
 * This is the central hub for all global state management in the application.
 */
'use client';

import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import AppShell from '@/components/AppShell';
import { ReactNode, useState } from 'react';
import { toast } from 'sonner';

/**
 * Global providers wrapper for the entire application
 * Establishes the context layer that all pages and components depend on
 */
export function Providers({ children, nonce }: { children: ReactNode; nonce?: string }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						// Data is fresh for 1 minute â€” avoids redundant refetches when
						// multiple components mount and request the same key.
						staleTime: 60_000,
						// One automatic retry is enough; the default of 3 delays error
						// surfaces by several seconds on genuinely broken endpoints.
						retry: 1,
						// This app is used on a single focused tab. Window-focus
						// refetches add noise without benefit.
						refetchOnWindowFocus: false,
					},
				},
				// Before this, a thrown query error had nowhere to land unless the
				// component that called useQuery happened to read `isError` itself
				// — most (118 of 128 sampled) don't, and default `data` to `[]` at
				// the destructuring site instead. A real failure and a genuinely
				// empty result then render identically: the exact shape behind the
				// `due_date` bug and several more (2026-08 audit). This doesn't
				// replace a component's own error handling where it exists — it's
				// the floor under the ones that have none.
				queryCache: new QueryCache({
					onError: (error, query) => {
						// A background refetch failing while the screen still shows the
						// last good data isn't worth interrupting anyone for — only
						// surface it when there's nothing else on screen to fall back on.
						if (query.state.data !== undefined) return;
						toast.error('No se pudo cargar la información', {
							id: query.queryHash,
							description: error instanceof Error ? error.message : undefined,
						});
					},
				}),
			})
	);

	// SessionProvider: same rationale as refetchOnWindowFocus above — one
	// focused tab, so re-fetching the session on every tab switch is pure
	// request noise against the /api/auth rate limit.
	return (
		<SessionProvider refetchOnWindowFocus={false}>
			<QueryClientProvider client={queryClient}>
				<ThemeProvider nonce={nonce}>
					<AuthProvider>
						<TooltipProvider>
							<Toaster />
							<Sonner />
							<AppShell>{children}</AppShell>
						</TooltipProvider>
					</AuthProvider>
				</ThemeProvider>
			</QueryClientProvider>
		</SessionProvider>
	);
}
