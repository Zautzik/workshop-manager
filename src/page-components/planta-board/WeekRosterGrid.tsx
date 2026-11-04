'use client';

/**
 * La semana de Planta de un vistazo: máquina × día, y en cada celda quién está
 * en cada turno.
 *
 * Es la vista por defecto porque es como piensa la planta: "esta semana la
 * cuadrilla A está de mañana". El tablero de arrastre por día queda para las
 * excepciones — un clic en la celda lo abre en ese día y turno.
 *
 * Lo que necesita atención salta solo: una persona con licencia aprobada que
 * sigue asignada (⚠), y los turnos cargados a mano (punto), que la rotación no
 * va a tocar al regenerar.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { dateToLocalIso } from '@/lib/week-dates';
import { definitionFor, type ShiftDef } from '@/lib/machine-calendar';

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Color por turno: el mismo en la grilla y en las rotaciones. */
export const SHIFT_TONE: Record<string, string> = {
	manana: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
	tarde: 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border-indigo-500/30',
	noche: 'bg-slate-500/20 text-slate-800 dark:text-slate-200 border-slate-500/40',
	taller: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
};

const shortName = (full?: string | null) => {
	const parts = String(full ?? '').trim().split(/\s+/);
	return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0] || '¿?';
};

interface WeekPayload {
	assignments: any[];
	leaves?: Array<{ employee_id: string; start_date: string; end_date: string; leave_type: string }>;
}

export function WeekRosterGrid({
	weekStart,
	machines,
	shiftDefinitions,
	rotationMachineIds,
	onOpenDay,
}: {
	weekStart: Date;
	machines: any[];
	shiftDefinitions: ShiftDef[];
	/** Máquinas que cubre alguna rotación: se muestran aunque la semana esté vacía. */
	rotationMachineIds: Set<string>;
	onOpenDay: (date: string, shiftId: string | null, machineId: string) => void;
}) {
	const [showAll, setShowAll] = useState(false);
	const days = useMemo(
		() => Array.from({ length: 7 }, (_, i) => dateToLocalIso(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i))),
		[weekStart],
	);
	const from = days[0];
	const to = days[6];

	const { data, isLoading, error } = useQuery<WeekPayload>({
		queryKey: ['assignments', 'week', from],
		queryFn: async () => {
			const res = await fetch(`/api/worker-assignments?from=${from}&to=${to}&withLeaves=1`, { credentials: 'include' });
			if (!res.ok) throw new Error(`No se pudo leer la semana (${res.status})`);
			return res.json();
		},
	});

	const defs = useMemo(() => [...shiftDefinitions].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [shiftDefinitions]);

	// machine → date → shiftId → personas
	const cells = useMemo(() => {
		const map = new Map<string, Map<string, Map<string, Array<{ name: string; manual: boolean; onLeave: boolean }>>>>();
		const leaves = data?.leaves ?? [];
		for (const a of data?.assignments ?? []) {
			const def = definitionFor(a.shift, defs, a.workstation?.type);
			const shiftId = def?.id ?? a.shift_id;
			const byDate = map.get(a.machine_id) ?? new Map();
			const byShift = byDate.get(a.date) ?? new Map();
			const list = byShift.get(shiftId) ?? [];
			list.push({
				name: shortName(a.employee?.full_name),
				// Sólo hay algo que distinguir cuando hay rotaciones: antes, todo es manual.
				manual: rotationMachineIds.size > 0 && a.source === 'manual',
				onLeave: leaves.some((l) => l.employee_id === a.employee_id && l.start_date <= a.date && a.date <= l.end_date),
			});
			byShift.set(shiftId, list);
			byDate.set(a.date, byShift);
			map.set(a.machine_id, byDate);
		}
		// Mismo orden todos los días: una cuadrilla se lee igual de lunes a viernes.
		for (const byDate of map.values()) for (const byShift of byDate.values()) for (const list of byShift.values()) list.sort((x, y) => x.name.localeCompare(y.name));
		return map;
	}, [data, defs, rotationMachineIds]);

	const showSunday = days[6] && [...cells.values()].some((byDate) => byDate.has(days[6]));
	const visibleDays = showSunday ? days : days.slice(0, 6);
	const rows = machines.filter((m) => showAll || cells.has(m.id) || rotationMachineIds.has(m.id));
	const leaveCount = [...cells.values()].reduce(
		(n, byDate) => n + [...byDate.values()].reduce((k, byShift) => k + [...byShift.values()].flat().filter((p) => p.onLeave).length, 0),
		0,
	);

	return (
		<div className="rounded-md border border-border bg-card">
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
				<div className="flex items-center gap-3">
					{defs.map((d) => (
						<span key={d.id} className={cn('rounded border px-1.5 py-0.5', SHIFT_TONE[d.code ?? ''] ?? 'border-border')}>
							{d.name} {d.start_time.slice(0, 2)}–{d.end_time.slice(0, 2)}
						</span>
					))}
					{rotationMachineIds.size > 0 && (
						<span className="text-muted-foreground">
							<span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-500 align-middle" />
							cambio a mano (la rotación no lo toca)
						</span>
					)}
				</div>
				<div className="flex items-center gap-3">
					{leaveCount > 0 && (
						<span className="flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
							<AlertTriangle className="h-3.5 w-3.5" /> {leaveCount} con licencia y asignado{leaveCount > 1 ? 's' : ''}
						</span>
					)}
					<label className="flex cursor-pointer items-center gap-1 text-muted-foreground">
						<input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
						todas las máquinas
					</label>
				</div>
			</div>

			{error ? (
				<p className="p-4 text-sm text-red-600">{(error as Error).message}</p>
			) : isLoading ? (
				<p className="p-4 text-sm text-muted-foreground">Cargando la semana…</p>
			) : rows.length === 0 ? (
				<p className="p-4 text-sm text-muted-foreground">
					Esta semana no hay nadie asignado. Arma una rotación abajo y genera las semanas, o marca «todas las máquinas» para asignar a mano.
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full border-collapse text-xs">
						<thead>
							<tr className="text-left text-muted-foreground">
								<th className="sticky left-0 z-10 w-36 bg-card px-2 py-1.5 font-medium">Máquina</th>
								{visibleDays.map((d) => {
									const dow = new Date(`${d}T12:00:00`).getDay();
									return (
										<th key={d} className={cn('min-w-[7.5rem] px-1.5 py-1.5 font-medium', dow === 6 && 'bg-muted/40')}>
											{DAY_LABELS[dow]} {Number(d.slice(8))}
										</th>
									);
								})}
							</tr>
						</thead>
						<tbody>
							{rows.map((m) => (
								<tr key={m.id} className="border-t border-border/60 align-top">
									<td className="sticky left-0 z-10 bg-card px-2 py-1.5 font-medium">{m.name}</td>
									{visibleDays.map((d) => {
										const byShift = cells.get(m.id)?.get(d);
										const entries = defs.filter((def) => byShift?.has(def.id)).map((def) => [def, byShift!.get(def.id)!] as const);
										const dow = new Date(`${d}T12:00:00`).getDay();
										return (
											<td key={d} className={cn('p-1', dow === 6 && 'bg-muted/40')}>
												<button
													type="button"
													onClick={() => onOpenDay(d, entries[0]?.[0].id ?? null, m.id)}
													className="flex min-h-[2rem] w-full flex-col gap-0.5 rounded px-1 py-0.5 text-left hover:bg-muted"
													title="Abrir este día para cambiar a alguien"
												>
													{entries.length === 0 && <span className="text-muted-foreground/50">—</span>}
													{entries.map(([def, people]) => (
														<span key={def.id} className={cn('rounded border px-1 py-0.5 leading-tight', SHIFT_TONE[def.code ?? ''] ?? 'border-border')}>
															<b className="mr-1">{def.name.slice(0, 3)}</b>
															{people.map((p, i) => (
																<span key={i} className={cn(p.onLeave && 'text-red-600 line-through dark:text-red-400')}>
																	{i > 0 && ', '}
																	{p.onLeave && <AlertTriangle className="mr-0.5 inline h-3 w-3 no-underline" />}
																	{p.name}
																	{p.manual && <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-sky-500 align-middle" />}
																</span>
															))}
														</span>
													))}
												</button>
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
