'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useSession, signIn as nextAuthSignIn, signOut as nextAuthSignOut } from 'next-auth/react';
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
	const { data: session, status } = useSession();
	const loading = status === 'loading';

	const user: User | null = session?.user
		? {
				id: session.user.id ?? '',
				email: session.user.email ?? '',
				name: session.user.name ?? null,
			}
		: null;

	const role: AppRole | null = (session?.user?.role as AppRole) ?? null;

	const signIn = async (email: string, password: string) => {
		const result = await nextAuthSignIn('credentials', {
			email,
			password,
			redirect: false,
		});

		if (result?.error) {
			return { error: new Error(result.error) };
		}

		return { error: null };
	};

	const signOut = async () => {
		await nextAuthSignOut({ redirect: false });
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
