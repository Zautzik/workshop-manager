'use client';

import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { useSession, signIn as nextAuthSignIn, signOut as nextAuthSignOut } from 'next-auth/react';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/app-role';

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';

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
	// ── Dev bypass ──────────────────────────────────────────────────────────
	if (DEV_BYPASS) {
		const mockUser = { id: 'dev-user', email: 'dev@local.dev', name: 'Dev Admin' };
		const mockRole: AppRole = 'admin';
		return (
			<AuthContext.Provider
				value={{
					user: mockUser,
					session: null,
					role: mockRole,
					loading: false,
					signIn: async () => ({ error: null }),
					signOut: async () => {},
				}}
			>
				{children}
			</AuthContext.Provider>
		);
	}
	// ── Normal auth ─────────────────────────────────────────────────────────
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

	const signIn = async (email: string, password: string) => {
		// 1. Sign into Supabase Auth first so the client-side Supabase
		//    client has a valid JWT and auth.uid() works for RLS policies.
		const { error: supabaseError } = await supabase.auth.signInWithPassword({
			email,
			password,
		});

		if (supabaseError) {
			return { error: new Error(supabaseError.message) };
		}

		// 2. Sign into NextAuth for server-side session / role info.
		const result = await nextAuthSignIn('credentials', {
			email,
			password,
			redirect: false,
		});

		if (result?.error) {
			// NextAuth failed — clean up the Supabase session
			await supabase.auth.signOut();
			return { error: new Error(result.error) };
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
