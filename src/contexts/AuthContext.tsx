'use client';

import React, {
	createContext,
	useContext,
	useState,
	useEffect,
	ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/app-role';

interface User {
	id: string;
	email: string;
	name?: string | null;
}

interface AuthContextType {
	user: User | null;
	session: any | null;
	role: AppRole | null;
	loading: boolean;
	signIn: (email: string, password: string) => Promise<{ error: any }>;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
	children,
}) => {
	const [user, setUser] = useState<User | null>(null);
	const [role, setRole] = useState<AppRole | null>(null);
	const [session, setSession] = useState<any | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let mounted = true;

		const getSession = async () => {
			setLoading(true);
			const {
				data: { session },
			} = await supabase.auth.getSession();

			setSession(session);

			if (!mounted) return;

			if (session?.user) {
				const authUser = session.user;

				// Try to fetch profile and role from user tables
				const { data: profile } = await (supabase as any)
					.from('users')
					.select('id, email, name')
					.eq('id', authUser.id)
					.single();

				const { data: userRole } = await (supabase as any)
					.from('user_roles')
					.select('role')
					.eq('user_id', authUser.id)
					.order('created_at', { ascending: true })
					.limit(1)
					.maybeSingle();

				setUser({
					id: authUser.id,
					email: authUser.email ?? '',
					name: profile?.name ?? null,
				});
				setRole((userRole as any)?.role ?? null);
			} else {
				setUser(null);
				setRole(null);
			}

			setLoading(false);
		};

		getSession();

		const { data: listener } = supabase.auth.onAuthStateChange(
			(_event, session) => {
				setSession(session);
				if (session?.user) {
					const authUser = session.user;
					(async () => {
						const { data: profile } = await (supabase as any)
							.from('users')
							.select('id, email, name')
							.eq('id', authUser.id)
							.single();

						const { data: userRole } = await (supabase as any)
							.from('user_roles')
							.select('role')
							.eq('user_id', authUser.id)
							.order('created_at', { ascending: true })
							.limit(1)
							.maybeSingle();

						setUser({
							id: authUser.id,
							email: authUser.email ?? '',
							name: profile?.name ?? null,
						});
						setRole((userRole as any)?.role ?? null);
					})();
				} else {
					setUser(null);
					setRole(null);
				}
			}
		);

		return () => {
			mounted = false;
			listener?.subscription.unsubscribe();
		};
	}, []);

	const signIn = async (email: string, password: string) => {
		const { data, error } = await supabase.auth.signInWithPassword({
			email,
			password,
		});

		if (error) return { error };

		// Fetch profile and role after sign in
		const authUser = data?.user;
		if (authUser) {
			const { data: profile } = await (supabase as any)
				.from('users')
				.select('id, email, name')
				.eq('id', authUser.id)
				.single();

			const { data: userRole } = await (supabase as any)
				.from('user_roles')
				.select('role')
				.eq('user_id', authUser.id)
				.order('created_at', { ascending: true })
				.limit(1)
				.maybeSingle();

			setUser({
				id: authUser.id,
				email: authUser.email ?? '',
				name: profile?.name ?? null,
			});
			setRole((userRole as any)?.role ?? null);
		}

		setSession((data as any)?.session ?? null);

		return { error: null };
	};

	const signOut = async () => {
		await supabase.auth.signOut();
		setUser(null);
		setRole(null);
		setSession(null);
	};

	return (
		<AuthContext.Provider
			value={{ user, session, role, loading, signIn, signOut }}
		>
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
