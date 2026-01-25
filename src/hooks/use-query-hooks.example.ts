/**
 * Example React Query hooks for the GonsAdmin API
 *
 * These examples show how to use React Query with the new API routes
 * to replace Supabase queries throughout your application.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';

// Types (should match your Supabase schema)
interface Machine {
	id: string;
	name: string;
	type: string;
	status: string;
	createdAt: string;
	updatedAt: string;
}

interface Job {
	id: string;
	description: string;
	status: string;
	assignedMachineId?: string;
	createdBy?: string;
	createdAt: string;
	updatedAt: string;
	machine?: Machine;
}

interface Worker {
	id: string;
	name: string;
	department: string;
	sheetsPerHour: number;
	teamworkRating: number;
	overtimeAvailability: boolean;
	// ... other fields
}

// ==================== MACHINES ====================

/**
 * Fetch all machines
 */
export function useMachines() {
	const api = useApi();

	return useQuery({
		queryKey: ['machines'],
		queryFn: () => api.get<Machine[]>('/api/machines'),
		enabled: api.isAuthenticated,
	});
}

/**
 * Fetch a single machine by ID
 */
export function useMachine(id: string) {
	const api = useApi();

	return useQuery({
		queryKey: ['machines', id],
		queryFn: () => api.get<Machine>(`/api/machines/${id}`),
		enabled: api.isAuthenticated && !!id,
	});
}

/**
 * Create a new machine
 */
export function useCreateMachine() {
	const api = useApi();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: Partial<Machine>) =>
			api.post<Machine>('/api/machines', data),
		onSuccess: () => {
			// Invalidate machines cache to refetch
			queryClient.invalidateQueries({ queryKey: ['machines'] });
		},
	});
}

/**
 * Update a machine
 */
export function useUpdateMachine() {
	const api = useApi();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Partial<Machine> }) =>
			api.patch<Machine>(`/api/machines/${id}`, data),
		onSuccess: data => {
			// Update specific machine cache
			queryClient.invalidateQueries({ queryKey: ['machines', data.id] });
			// Refetch all machines
			queryClient.invalidateQueries({ queryKey: ['machines'] });
		},
	});
}

/**
 * Delete a machine
 */
export function useDeleteMachine() {
	const api = useApi();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => api.delete(`/api/machines/${id}`),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['machines'] });
		},
	});
}

// ==================== JOBS ====================

/**
 * Fetch all jobs
 */
export function useJobs() {
	const api = useApi();

	return useQuery({
		queryKey: ['jobs'],
		queryFn: () => api.get<Job[]>('/api/jobs'),
		enabled: api.isAuthenticated,
	});
}

/**
 * Create a new job
 */
export function useCreateJob() {
	const api = useApi();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: Partial<Job>) => api.post<Job>('/api/jobs', data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['jobs'] });
		},
	});
}

// ==================== WORKERS ====================

/**
 * Fetch all workers
 */
export function useWorkers() {
	const api = useApi();

	return useQuery({
		queryKey: ['workers'],
		queryFn: () => api.get<Worker[]>('/api/workers'),
		enabled: api.isAuthenticated,
	});
}

/**
 * Create a new worker
 */
export function useCreateWorker() {
	const api = useApi();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: Partial<Worker>) =>
			api.post<Worker>('/api/workers', data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['workers'] });
		},
	});
}

// ==================== EXAMPLE USAGE IN COMPONENTS ====================

/*

// Example 1: Fetch and display machines
function MachinesList() {
  const { data: machines, isLoading, error } = useMachines();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {machines?.map(machine => (
        <div key={machine.id}>
          {machine.name} - {machine.status}
        </div>
      ))}
    </div>
  );
}

// Example 2: Create a new machine
function CreateMachineForm() {
  const createMachine = useCreateMachine();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await createMachine.mutateAsync({
        name: 'New Machine',
        type: 'offset_printer',
        status: 'idle',
      });
      alert('Machine created!');
    } catch (error) {
      alert('Error creating machine');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <button type="submit" disabled={createMachine.isPending}>
        {createMachine.isPending ? 'Creating...' : 'Create Machine'}
      </button>
    </form>
  );
}

// Example 3: Update machine status
function UpdateMachineStatus({ machineId }: { machineId: string }) {
  const updateMachine = useUpdateMachine();

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateMachine.mutateAsync({
        id: machineId,
        data: { status: newStatus },
      });
    } catch (error) {
      console.error('Failed to update machine status', error);
    }
  };

  return (
    <select onChange={(e) => handleStatusChange(e.target.value)}>
      <option value="idle">Idle</option>
      <option value="running">Running</option>
      <option value="maintenance">Maintenance</option>
      <option value="offline">Offline</option>
    </select>
  );
}

// Example 4: Using in Server Components (Next.js 13+)
// Server Components: call your API routes or use the server Supabase client.
// Example using the server Supabase client from `src/integrations/supabase/server`:

// import { supabaseAdmin } from '@/integrations/supabase/server';

// async function MachinesServerComponent() {
//   const { data: machines } = await supabaseAdmin.from('machines').select('*').order('name', { ascending: true });
//
//   return (
//     <div>
//       {machines?.map(machine => (
//         <div key={machine.id}>{machine.name}</div>
//       ))}
//     </div>
//   );
// }

*/
