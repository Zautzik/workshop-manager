import type { AppRole } from '@/types/app-role';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
	interface User {
		id: string;
		email: string;
		name?: string | null;
		role?: AppRole | null;
	}

	interface Session {
		user: {
			id: string;
			email: string;
			name?: string | null;
			role?: AppRole | null;
		};
	}
}

declare module 'next-auth/jwt' {
	interface JWT {
		id: string;
		role?: AppRole | null;
	}
}
