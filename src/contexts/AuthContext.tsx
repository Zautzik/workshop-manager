'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useSession, signIn as nextAuthSignIn, signOut as nextAuthSignOut, getSession } from 'next-auth/react';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/app-role';
import { assertDevBypassConfigSafe, isDevBypassEnabled } from '@/lib/dev-bypass-guard';

assertDevBypassConfigSafe();

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

// ── Dev bypass — renders when NEXT_PUBLIC_DEV_BYPASS=true ────────────────────
const DEV_USER: User = { id: 'dev', email: 'dev@local', name: 'Dev Admin' };
const DEV_ROLE: AppRole = 'admin';
// Per-tab so a fresh tab still opens straight into the dev session, while a
// reload after signing out stays signed out.
const DEV_SIGNED_OUT_KEY = 'dev-bypass-signed-out';

function DevBypassProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(DEV_USER);
	// Start loading so the first client render matches the server render; the
	// sessionStorage check below can only run after hydration.
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (sessionStorage.getItem(DEV_SIGNED_OUT_KEY) === '1') {
			setUser(null);
		}
		setLoading(false);
	}, []);

	const signIn = async () => {
		sessionStorage.removeItem(DEV_SIGNED_OUT_KEY);
		setUser(DEV_USER);
		return { error: null };
	};

	const signOut = async () => {
		sessionStorage.setItem(DEV_SIGNED_OUT_KEY, '1');
		setUser(null);
	};

	return (
		<AuthContext.Provider value={{
			user,
			session: null,
			role: user ? DEV_ROLE : null,
			loading,
			signIn,
			signOut,
		}}>
			{children}
		</AuthContext.Provider>
	);
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	// ── Dev bypass — set NEXT_PUBLIC_DEV_BYPASS=true in .env.local ────────
	// Branching between components (instead of before hooks in one component)
	// keeps every hook call unconditional per component (rules-of-hooks).
	if (isDevBypassEnabled) {
		return <DevBypassProvider>{children}</DevBypassProvider>;
	}
	return <SessionAuthProvider>{children}</SessionAuthProvider>;
};

const SessionAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
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

		// Step 2: Seed the browser Supabase client with the tokens the server
		// already verified — no second credential round-trip, no rate-limit hit.
		const nextSession = await getSession();
		const accessToken = nextSession?.supabaseAccessToken;
		const refreshToken = nextSession?.supabaseRefreshToken;

		if (accessToken && refreshToken) {
			const { error: setSessionError } = await supabase.auth.setSession({
				access_token: accessToken,
				refresh_token: refreshToken,
			});
			if (setSessionError) {
				console.warn('[auth] Could not seed Supabase browser session:', setSessionError.message);
			}
		} else {
			console.warn('[auth] Supabase tokens missing from NextAuth session — browser queries will run as anon');
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
