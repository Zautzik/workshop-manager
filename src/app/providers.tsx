/**
 * @fileoverview Global Providers Component
 * 
 * SYSTEM ROLE: State Management & Context Provider Layer
 * ORGAN ANALOGY: The "Nervous System" - Distributes state and context to entire app
 * 
 * This component wraps the entire application with multiple context providers:
 * 
 * 1. SessionProvider (NextAuth) - Manages user authentication state globally
 * 2. QueryClientProvider (React Query) - Manages server data caching and fetching
 * 3. ThemeProvider - Handles light/dark mode theming
 * 4. LanguageProvider - Manages multi-language localization state
 * 5. AuthProvider - Custom authentication context with role-based access control
 * 6. TooltipProvider - Enables tooltip functionality throughout the app
 * 7. Toaster components - Display toast notifications from multiple sources
 * 
 * All components below this provider have access to these contexts via hooks.
 * This is the central hub for all global state management in the application.
 */
'use client';

import '@/i18n/config';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import AppShell from '@/components/AppShell';
import { ReactNode, useState } from 'react';

/**
 * Global providers wrapper for the entire application
 * Establishes the context layer that all pages and components depend on
 */
export function Providers({ children }: { children: ReactNode }) {
	const [queryClient] = useState(() => new QueryClient());

	return (
		<SessionProvider>
			<QueryClientProvider client={queryClient}>
				<ThemeProvider>
					<LanguageProvider>
						<AuthProvider>
							<TooltipProvider>
								<Toaster />
								<Sonner />
								<AppShell>{children}</AppShell>
							</TooltipProvider>
						</AuthProvider>
					</LanguageProvider>
				</ThemeProvider>
			</QueryClientProvider>
		</SessionProvider>
	);
}
