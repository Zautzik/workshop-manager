'use client';

import { useRouter, usePathname } from 'next/navigation';

export function useNavigate() {
	const router = useRouter();

	return (path: string) => {
		router.push(path);
	};
}

export function useLocation() {
	const pathname = usePathname();

	return {
		pathname,
		search: '',
		hash: '',
		state: null,
		key: 'default',
	};
}
