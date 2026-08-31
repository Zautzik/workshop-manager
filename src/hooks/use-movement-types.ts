'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MovementTypeCode } from '@/types/movement-type-code';

export interface MovementType {
	code: MovementTypeCode;
	label: string;
	direction: 'in' | 'out';
	requires_ot: boolean;
	active: boolean;
	sort_order: number;
}

const Q = ['movement-types'] as const;

/** Todos los tipos de movimiento — para la pestaña de administración y para
 *  el selector de movimientos manuales de Inventario. */
export function useMovementTypes() {
	return useQuery<MovementType[]>({
		queryKey: Q,
		queryFn: async () => {
			const res = await fetch('/api/admin/movement-types', { credentials: 'include' });
			if (!res.ok) throw new Error('No se pudieron cargar los tipos de movimiento');
			return res.json();
		},
		staleTime: 60_000,
	});
}

export function useUpdateMovementType() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({ code, ...patch }: Partial<Pick<MovementType, 'label' | 'active' | 'requires_ot' | 'sort_order'>> & { code: string }) => {
			const res = await fetch(`/api/admin/movement-types/${code}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(patch),
			});
			const data = await res.json().catch(() => null);
			if (!res.ok) throw new Error(data?.error ?? 'No se pudo guardar');
			return data as MovementType;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: Q });
		},
	});
}
