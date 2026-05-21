'use client';

import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { useSession, signIn as nextAuthSignIn, signOut as nextAuthSignOut } from 'next-auth/react';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/app-role';

interface User {
	id: string;
	email: string;
	name?: string | null;
}

interface AuthContextType {
	user: User | null;
	session: ReturnType<typeof useSession>['data'];
	role: AppRole | null;
	loading: boolean;
	signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	// ── Dev bypass — set NEXT_PUBLIC_DEV_BYPASS=true in .env.local ────────
	const isDevBypass =
		process.env.NODE_ENV === 'development' &&
		process.env.NEXT_PUBLIC_DEV_BYPASS === 'true';

	const DEV_USER: User = { id: 'dev', email: 'dev@local', name: 'Dev Admin' };
	const DEV_ROLE: AppRole = 'admin';

	if (isDevBypass) {
		return (
			<AuthContext.Provider value={{
				user: DEV_USER,
				session: null,
				role: DEV_ROLE,
				loading: false,
				signIn: async () => ({ error: null }),
				signOut: async () => {},
			}}>
				{children}
			</AuthContext.Provider>
		);
	}

	// ── Normal auth ──────────────────────────────────────────────────────
	const { data: session, status } = useSession();
	const loading = status === 'loading';

	// Keep the client-side Supabase session in sync with the NextAuth session.
	// If the user has a NextAuth session but Supabase shows no user, the
	// Supabase auth listener or localStorage restore will handle it.
	// On signOut we explicitly clear both.
	useEffect(() => {
		if (status === 'unauthenticated') {
			// NextAuth session gone → make sure Supabase is also signed out
			supabase.auth.getSession().then(({ data }) => {
				if (data.session) {
					supabase.auth.signOut();
				}
			});
		}
	}, [status]);

	const user: User | null = session?.user
		? {
				id: session.user.id ?? '',
				email: session.user.email ?? '',
				name: session.user.name ?? null,
			}
		: null;

	const role: AppRole | null = (session?.user?.role as AppRole) ?? null;

	const signIn = async (email: string, password: string): Promise<{ error: Error | null }> => {
		// Step 1: NextAuth — establishes the authoritative server-side session
		// and verifies credentials via CredentialsProvider.
		// Do this FIRST so that if it fails nothing has been persisted anywhere.
		let result: Awaited<ReturnType<typeof nextAuthSignIn>>;
		try {
			result = await nextAuthSignIn('credentials', {
				email,
				password,
				redirect: false,
			});
		} catch (err) {
			return { error: err instanceof Error ? err : new Error('Sign-in failed') };
		}

		if (result?.error) {
			return { error: new Error(result.error) };
		}

		// Step 2: Establish a client-side Supabase session so components that
		// call supabase (client) directly have a valid JWT.
		// Non-fatal: API routes use requireAuth / supabaseAdmin, so the app
		// works even if the client session cannot be established.
		const { error: supabaseError } = await supabase.auth.signInWithPassword({
			email,
			password,
		});

		if (supabaseError) {
			console.warn('[auth] Client Supabase session not established:', supabaseError.message);
		}

		return { error: null };
	};

	const signOut = async () => {
		await Promise.all([
			supabase.auth.signOut(),
			nextAuthSignOut({ redirect: false }),
		]);
	};

	return (
		<AuthContext.Provider value={{ user, session, role, loading, signIn, signOut }}>
			{children}
		</AuthContext.Provider>
	);
};

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error('useAuth must be used within an AuthProvider');
	}
	return context;
};
