/**
 * @fileoverview NextAuth.js Type Extensions
 * 
 * SYSTEM ROLE: Authentication Type Definitions
 * ORGAN ANALOGY: The "Passport System" - Extends NextAuth types with application-specific data
 * 
 * This module augments NextAuth.js's built-in types to include:
 * 
 * 1. User type: Adds id and role to NextAuth's User interface
 * 2. Session type: Extends session to include id and role in session.user
 * 3. JWT type: Extends JWT token to include id and role for token signing
 * 
 * These extensions ensure that user role information flows through:
 * - User object during authentication
 * - Session object accessible to client components
 * - JWT token for secure session storage
 * 
 * Without these declarations, TypeScript won't recognize these properties.
 */
import type { AppRole } from '@/types/app-role';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
	interface User {
		id: string;
		email: string;
		name?: string | null;
		role?: AppRole | null;
		/** Supabase access_token from the authorize() sign-in — seeded into
		 *  the browser client via setSession() so browser queries have a JWT. */
		supabaseAccessToken?: string;
		/** Supabase refresh_token — kept server-side only (JWT cookie). */
		supabaseRefreshToken?: string;
	}

	interface Session {
		user: {
			id: string;
			email: string;
			name?: string | null;
			role?: AppRole | null;
		};
		/** Exposed to the browser so AuthContext can call
		 *  supabase.auth.setSession() without a second signInWithPassword. */
		supabaseAccessToken?: string;
		/** Supabase refresh_token — needed by setSession() so the browser
		 *  client can auto-refresh without a new sign-in. */
		supabaseRefreshToken?: string;
	}
}

declare module 'next-auth/jwt' {
	interface JWT {
		id: string;
		role?: AppRole | null;
		supabaseAccessToken?: string;
		supabaseRefreshToken?: string;
	}
}
