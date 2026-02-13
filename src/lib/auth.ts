/**
 * @fileoverview Authentication Configuration (NextAuth.js)
 * 
 * SYSTEM ROLE: Authentication Engine & Session Management
 * ORGAN ANALOGY: The "Immune System" - Controls access and verifies user identity
 * 
 * This file sets up NextAuth.js authentication with:
 * - Credentials provider (email/password login)
 * - Password verification via Supabase Auth
 * - User profile and role fetching from database
 * - JWT token management with user role information
 * - Session callbacks that attach user ID and role to session
 * - Custom login page redirect
 * 
 * All login requests are processed here, and session data is enriched with user role
 * for role-based access control throughout the application.
 */
import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/integrations/supabase/server';
import type { Database } from '@/integrations/supabase/types';
import type { AppRole } from '@/types/app-role';

const SUPABASE_URL =
	process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
	process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
	process.env.SUPABASE_ANON_KEY;

const getSupabaseAuthClient = () => {
	if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
		throw new Error('Supabase auth configuration missing');
	}

	return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
		auth: {
			persistSession: false,
			storage: undefined,
		},
	});
};

export const authOptions: NextAuthOptions = {
	providers: [
		CredentialsProvider({
			name: 'Credentials',
			credentials: {
				email: { label: 'Email', type: 'email' },
				password: { label: 'Password', type: 'password' },
			},
			async authorize(credentials) {
				if (!credentials?.email || !credentials?.password) {
					throw new Error('Email and password required');
				}

				const supabaseAuth = getSupabaseAuthClient();
				const { data: authData, error: authError } =
					await supabaseAuth.auth.signInWithPassword({
						email: credentials.email,
						password: credentials.password,
					});

				if (authError || !authData?.user) {
					throw new Error('Invalid credentials');
				}

				const authUser = authData.user;
				const { data: profile } = await (supabaseAdmin as any)
					.from('users')
					.select('*, user_roles(*)')
					.eq('id', authUser.id)
					.single();

				// Get primary role (first role in the array)
				const role = profile?.user_roles?.[0]?.role ?? null;
				const name =
					profile?.name ??
					(authUser.user_metadata?.name as string | undefined) ??
					null;

				return {
					id: authUser.id,
					email: authUser.email ?? credentials.email,
					name,
					role,
				};
			},
		}),
	],
	callbacks: {
		async jwt({ token, user }) {
			if (user) {
				token.id = user.id;
				token.role = user.role;
			}
			return token;
		},
		async session({ session, token }) {
			if (session.user) {
				session.user.id = token.id as string;
				session.user.role = token.role as AppRole | null;
			}
			return session;
		},
	},
	pages: {
		signIn: '/login',
	},
	session: {
		strategy: 'jwt',
	},
	secret: process.env.NEXTAUTH_SECRET,
};
