/**
 * @fileoverview API Request Hook (useApi)
 * 
 * SYSTEM ROLE: HTTP Client / API Communication Layer
 * ORGAN ANALOGY: The "Postal Service" - Handles all communication with backend API
 * 
 * Custom React hook that provides methods for making authenticated HTTP requests:
 * 
 * - get<T>(url, options): Fetch data (GET)
 * - post<T>(url, data, options): Create resource (POST)
 * - patch<T>(url, data, options): Partial update (PATCH)
 * - put<T>(url, data, options): Full update (PUT)
 * - delete<T>(url, options): Delete resource (DELETE)
 * 
 * Features:
 * - Automatic JSON content-type header
 * - Generic TypeScript typing for response types
 * - Error handling with descriptive messages
 * - Session state available via isAuthenticated and session properties
 * 
 * Used throughout components to fetch/update data from REST API endpoints.
 */
import { useSession } from 'next-auth/react';

interface FetchOptions extends RequestInit {
	data?: any;
}

export function useApi() {
	const { data: session } = useSession();

	const fetchApi = async <T = any>(
		url: string,
		options: FetchOptions = {}
	): Promise<T> => {
		const { data, ...fetchOptions } = options;

		const config: RequestInit = {
			...fetchOptions,
			headers: {
				'Content-Type': 'application/json',
				...fetchOptions.headers,
			},
		};

		// Add body if data is provided
		if (data) {
			config.body = JSON.stringify(data);
		}

		const response = await fetch(url, config);

		if (!response.ok) {
			const error = await response.json().catch(() => ({
				error: 'An error occurred',
			}));
			throw new Error(error.error || `HTTP ${response.status}`);
		}

		return response.json();
	};

	return {
		get: <T = any>(url: string, options?: FetchOptions) =>
			fetchApi<T>(url, { ...options, method: 'GET' }),

		post: <T = any>(url: string, data: any, options?: FetchOptions) =>
			fetchApi<T>(url, { ...options, method: 'POST', data }),

		patch: <T = any>(url: string, data: any, options?: FetchOptions) =>
			fetchApi<T>(url, { ...options, method: 'PATCH', data }),

		put: <T = any>(url: string, data: any, options?: FetchOptions) =>
			fetchApi<T>(url, { ...options, method: 'PUT', data }),

		delete: <T = any>(url: string, options?: FetchOptions) =>
			fetchApi<T>(url, { ...options, method: 'DELETE' }),

		isAuthenticated: !!session,
		session,
	};
}

// Example usage in a component:
// const api = useApi();
//
// // Fetch machines
// const machines = await api.get('/api/machines');
//
// // Create a machine
// const newMachine = await api.post('/api/machines', {
//   name: 'New Machine',
//   type: 'offset_printer',
//   status: 'idle'
// });
//
// // Update a machine
// await api.patch(`/api/machines/${id}`, { status: 'running' });
//
// // Delete a machine
// await api.delete(`/api/machines/${id}`);
