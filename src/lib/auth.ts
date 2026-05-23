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

				// Role is the only data we need from the DB; name comes from user_metadata
				// which is set during user provisioning via supabaseAdmin.auth.admin.createUser.
				// (There is no public.users profile table in this schema.)
				const { data: roleRow } = await supabaseAdmin
					.from('user_roles')
					.select('role')
					.eq('user_id', authUser.id)
					.order('created_at', { ascending: false })
					.maybeSingle();

				// Narrow the DB result to AppRole so TypeScript catches
				// field renames the moment real types are generated.
				const role = (roleRow as { role: AppRole } | null)?.role ?? null;
				const name =
					(authUser.user_metadata?.name as string | undefined) ?? null;

				return {
					id: authUser.id,
					email: authUser.email ?? credentials.email,
					name,
					role,
					// Carry the tokens the server already verified so the browser
					// Supabase client can be seeded via setSession() — no second
					// signInWithPassword call needed, no extra rate-limit hit.
					supabaseAccessToken: authData.session?.access_token,
					supabaseRefreshToken: authData.session?.refresh_token,
				};
			},
		}),
	],
	callbacks: {
		async jwt({ token, user }) {
			if (user) {
				token.id = user.id;
				token.role = user.role;
				// Carry the Supabase tokens so the browser client can be seeded
				// via setSession() — avoids a second signInWithPassword call.
				token.supabaseAccessToken = user.supabaseAccessToken;
				token.supabaseRefreshToken = user.supabaseRefreshToken;
			}
			return token;
		},
		async session({ session, token }) {
			if (session.user) {
				session.user.id = token.id as string;
				session.user.role = token.role as AppRole | null;
			}
			// Expose tokens to the browser so AuthContext.signIn() can call
			// supabase.auth.setSession() without a second credential round-trip.
			if (token.supabaseAccessToken) {
				session.supabaseAccessToken = token.supabaseAccessToken;
				session.supabaseRefreshToken = token.supabaseRefreshToken;
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
