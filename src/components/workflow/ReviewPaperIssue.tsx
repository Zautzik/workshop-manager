'use client';

/**
 * El papel en la revisión de un parte.
 *
 * Si aprobar este parte hace entrar la OT a la primera etapa de su ruta, el
 * papel sale de bodega en ese momento —igual que en el Tablero, por el mismo
 * moveOT—, y quien revisa confirma de qué lote y cuántos pliegos. Pregunta
 * adónde iría la OT con las correcciones en curso (`/api/captures/preview-move`)
 * y, si es esa entrada, muestra la salida de papel.
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { SalidaDePapel, type SalidaDePapelState } from './SalidaDePapel';
import type { Corrections } from '@/lib/golden-thread';

interface Props {
	source: 'whatsapp' | 'capture';
	id: string;
	/** Las correcciones en curso: cambian los pliegos, y con ellos si el avance es parcial. */
	data?: Corrections['data'];
	onChange: (s: SalidaDePapelState) => void;
}

const IDLE: SalidaDePapelState = { loading: false, required: false, lines: null, problem: null };

export function ReviewPaperIssue({ source, id, data, onChange }: Props) {
	const { data: move, isLoading } = useQuery({
		queryKey: ['review-preview-move', source, id, JSON.stringify(data ?? null)],
		queryFn: async (): Promise<{ ot_id: string | null; to_status: string | null; moved_units: number | null }> => {
			const res = await fetch('/api/captures/preview-move', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ source, id, ...(data ? { data } : {}) }),
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) throw new Error(body?.error ?? 'No se pudo calcular el movimiento');
			return body;
		},
	});

	const moves = Boolean(move?.ot_id && move.to_status && move.moved_units);
	useEffect(() => {
		if (isLoading) onChange({ ...IDLE, loading: true });
		else if (!moves) onChange(IDLE);
	}, [isLoading, moves, onChange]);

	if (!moves || !move) return null;
	return (
		<SalidaDePapel
			otId={move.ot_id as string}
			toStatus={move.to_status as string}
			movedUnits={move.moved_units as number}
			onChange={onChange}
		/>
	);
}
