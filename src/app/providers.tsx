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
import { ReactNode, useState } from 'react';

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
								{children}
							</TooltipProvider>
						</AuthProvider>
					</LanguageProvider>
				</ThemeProvider>
			</QueryClientProvider>
		</SessionProvider>
	);
}
