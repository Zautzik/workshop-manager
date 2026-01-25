import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/integrations/supabase/server';
import type { AppRole } from '@/types/app-role';

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

				const { data: user, error } = await (supabaseAdmin as any)
					.from('users')
					.select('*, user_roles(*)')
					.eq('email', credentials.email)
					.single();

				if (!user) {
					throw new Error('Invalid credentials');
				}

				const isPasswordValid = await bcrypt.compare(
					credentials.password,
					user.password
				);

				if (!isPasswordValid) {
					throw new Error('Invalid credentials');
				}

				// Get primary role (first role in the array)
				const role = (user?.user_roles && user.user_roles[0]?.role) || null;

				return {
					id: user.id,
					email: user.email,
					name: user.name,
					role: role,
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
