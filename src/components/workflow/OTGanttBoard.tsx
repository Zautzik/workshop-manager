'use client';

/**
 * Cronograma — el programa de producción.
 *
 * Eje X: tiempo, en hora de la planta. Eje Y: las máquinas y procesos, en orden
 * de flujo. Cada OT vive repartida en ellos: 4 h en la offset, 1 h en la
 * guillotina, el desglose, el embalaje, el despacho — cada bloque donde y
 * cuando el planificador (`buildSchedule`) calcula que va a ocurrir.
 *
 * Antes esta pestaña era una barra por OT de "creada" a "plazo", que no decía
 * en qué máquina estaba nada ni qué pasaba si algo se atrasaba, y amontonaba
 * las OT vencidas en el día de hoy. Ver la cabecera de
 * src/lib/production-scheduler.ts para las reglas del programa.
 *
 * Lo que se hace acá:
 * - Clic en un bloque: se destaca la cadena completa de esa OT y abajo se ve de
 *   dónde salió cada estimación.
 * - "+ atraso" en una etapa: simula sin guardar, y dice a qué otras OT arrastra.
 * - Arrastrar un bloque (admin/supervisor): lo fija en esa máquina y hora en
 *   `ot_machine_schedule`. Si es la impresión y cambia de prensa, la OT cambia
 *   de máquina en toda la app (`syncAssignedMachine`). El resto del programa se
 *   reacomoda solo.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Pin as PinIcon, RotateCcw, Unlock, X } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/hooks/use-workflow-queries';
import { useRouter } from 'next/navigation';
import { AJUSTE_SOURCE_LABEL, plantDate, type OperatorAjuste } from '@/lib/ajuste';
import { shiftCovering, shiftLabel, shiftWindow, type ShiftInstance } from '@/lib/machine-calendar';
import {
	addWorkingHours,
	axisFromSegments,
	fullDaySegments,
	mergeIntervals,
	plantParts,
	type Interval,
	MS,
	nextWorkingInstant,
	workingHoursBetween,
	workingIntervals,
	type PlantCalendar,
	type TimeAxis,
} from '@/lib/plant-calendar';
import {
	buildPlanInput,
	formatHours,
	formatPlantDateTime,
	formatPlantDay,
	formatPlantRange,
	formatPlantTime,
	formatSpan,
	type PlanPayload,
} from '@/lib/production-plan';
import { PLAN_STEP_BY_KEY } from '@/lib/production-route';
import { buildSchedule, compareSchedules, lanesForStep, setupFor, type Block, type Lane } from '@/lib/production-scheduler';
import type { Estimate } from '@/lib/stage-history';
import { otStatusBadgeClass, otStatusLabel } from '@/lib/status-labels';
import { cn } from '@/lib/utils';

/** Días HÁBILES: el eje no tiene fines de semana (15 h de planta por día). */
/** Días de calendario: el eje muestra noches y fines de semana (ver `fullDaySegments`). */
const ZOOMS = [
	{ key: '3d', label: '3 días', days: 3, pxPerHour: 32, tickH: 2 },
	{ key: '1s', label: 'Semana', days: 7, pxPerHour: 14, tickH: 6 },
	{ key: '2s', label: '2 semanas', days: 14, pxPerHour: 7, tickH: 12 },
] as const;
type ZoomKey = (typeof ZOOMS)[number]['key'];

const LANE_H = 40;
const HEADER_H = 40;
const LABEL_W = 184;
const SNAP_H = 0.25;

/** Tonos fijos por OT: el mismo trabajo tiene el mismo color en todas las máquinas. */
const OT_PALETTE = [
	'#2563eb', '#0891b2', '#7c3aed', '#c026d3', '#db2777', '#ea580c',
	'#ca8a04', '#16a34a', '#0d9488', '#4f46e5', '#9333ea', '#65a30d',
];
function otColor(otId: string): string {
	let h = 0;
	for (let i = 0; i < otId.length; i++) h = (h * 31 + otId.charCodeAt(i)) >>> 0;
	return OT_PALETTE[h % OT_PALETTE.length];
}

const shortOt = (n: string) => n.replace(/^OT-?/i, '');

function usePlanificacion() {
	return useQuery<PlanPayload>({
		queryKey: ['planificacion'],
		queryFn: async () => {
			const res = await fetch('/api/planificacion');
			if (!res.ok) throw new Error(`No se pudo cargar el programa (${res.status})`);
			return res.json();
		},
		staleTime: 60_000,
		// Sin reintentos largos: con la red caída, tres reintentos de 10 s
		// mostraban "nada programado" durante medio minuto en vez del error.
		retry: 1,
	});
}

function useNow(stepMs = 60_000) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), stepMs);
		return () => clearInterval(t);
	}, [stepMs]);
	return now;
}

interface DragState {
	block: Block;
	originX: number;
	originY: number;
	laneIndex: number;
	dx: number;
	dy: number;
}

export function OTGanttBoard() {
	const { role } = useAuth();
	const canEdit = role === 'admin' || role === 'supervisor';
	const queryClient = useQueryClient();
	const { data, isLoading, isError, error, refetch } = usePlanificacion();
	const now = useNow();

	const router = useRouter();
	const [zoomKey, setZoomKey] = useState<ZoomKey>('1s');
	const [onlyProductive, setOnlyProductive] = useState(false);
	const zoom = ZOOMS.find((z) => z.key === zoomKey)!;
	const [selected, setSelected] = useState<string | null>(null);
	const [delays, setDelays] = useState<Record<string, number>>({});
	const [drag, setDrag] = useState<DragState | null>(null);
	const [saving, setSaving] = useState(false);

	// Se recalcula con `now` redondeado al cuarto de hora: el programa no tiene
	// por qué moverse cada minuto, y así no se rearma mientras se arrastra.
	const planNow = Math.floor(now / (15 * 60_000)) * 15 * 60_000;
	const plan = useMemo(() => (data ? buildPlanInput(data) : null), [data]);
	const base = useMemo(
		() => (plan ? buildSchedule({ now: planNow, ots: plan.ots, machines: plan.machines, pins: plan.pins }) : null),
		[plan, planNow],
	);
	const simulating = Object.values(delays).some((h) => h > 0);
	const simulated = useMemo(
		() =>
			plan && simulating
				? buildSchedule({ now: planNow, ots: plan.ots, machines: plan.machines, pins: plan.pins, delays })
				: null,
		[plan, planNow, delays, simulating],
	);
	const view = simulated ?? base;
	// Los puestos extra del taller (`id~n`) sólo se dibujan si tienen trabajo:
	// diez filas vacías de "puesto" taparían el resto del programa.
	const shownLanes = useMemo(
		() => (view ? view.lanes.filter((l) => !l.id.includes('~') || view.blocks.some((b) => b.laneId === l.id)) : []),
		[view],
	);
	const impacts = useMemo(() => (base && simulated ? compareSchedules(base, simulated) : []), [base, simulated]);
	const otById = useMemo(() => new Map((plan?.ots ?? []).map((o) => [o.id, o])), [plan]);
	const operatorsByMachine = useMemo(
		() => new Map((data?.machines ?? []).map((m) => [m.id, m.ajuste_by_operator ?? []])),
		[data],
	);

	// Sólo horas de planta (07–22, lunes a viernes): noches y fines de semana no
	// ocupan espacio (ver `buildTimeAxis`).
	// Por defecto, días completos de 24 h: una noche sin turno se VE vacía, y se
	// puede abrir un turno ahí. "Sólo horas productivas" pega los tramos en que
	// alguna máquina trabaja, para leer más trabajo en menos ancho.
	const axis = useMemo(() => {
		const full = fullDaySegments(planNow, zoom.days);
		if (!onlyProductive || !view) return axisFromSegments(full, zoom.pxPerHour, planNow);
		const [from, to] = [full[0][0], full[full.length - 1][1]];
		const productive: Interval[] = [];
		for (const lane of view.lanes) {
			if (lane.unlimited) continue;
			for (const [s, e] of workingIntervals(lane.calendar, from)) {
				if (s >= to) break;
				productive.push([s, Math.min(e, to)]);
			}
		}
		const merged = mergeIntervals(productive);
		return axisFromSegments(merged.length > 0 ? merged : full, zoom.pxPerHour, planNow);
	}, [planNow, zoom.days, zoom.pxPerHour, onlyProductive, view]);
	const { start: rangeStart, end: rangeEnd, width: totalW, xOf } = axis;

	// Clic en un tramo sin turno: proponer abrirlo en Planta, que es donde se
	// asigna gente — y asignar gente al turno es lo que lo abre (`machine-calendar`).
	const offerShift = useCallback(
		(lane: Lane, ms: number) => {
			const defs = plan?.shifts?.definitions ?? [];
			const p = plantParts(ms);
			const minute = p.hour * 60 + p.minute;
			const usable = lane.type === 'manual_workshop' ? defs : defs.filter((d) => d.code !== 'taller');
			const def = shiftCovering(usable, minute);
			if (!def || !lane.machineId) return;
			// La Noche de las 03:00 es la que empezó AYER a las 22:00.
			const w = shiftWindow(def);
			const day = w.end > 1440 && minute < w.start ? ms - MS.DAY : ms;
			const dateKey = plantDate(new Date(day).toISOString());
			const url = `/operaciones/planta?date=${dateKey}&shift=${def.code}&machine=${lane.machineId}`;
			toast(`${lane.name} no tiene turno ${formatPlantDay(day)} · ${shiftLabel(def)}`, {
				description: 'Se abre asignando operarios a ese turno en Planta.',
				action: { label: 'Abrir en Planta', onClick: () => router.push(url) },
			});
		},
		[plan, router],
	);

	/* ── Arrastre ──────────────────────────────────────────────────────────── */

	const dropTarget = useMemo(() => {
		if (!drag || !view) return null;
		const lanes = shownLanes;
		const allowed = lanesForStep(lanes, drag.block.step).filter((l) => !l.virtual);
		const wanted = lanes[Math.max(0, Math.min(lanes.length - 1, drag.laneIndex + Math.round(drag.dy / LANE_H)))];
		const lane = allowed.find((l) => l.id === wanted.id) ?? lanes[drag.laneIndex];
		// El desplazamiento se traduce por el eje (que salta noches), no como
		// píxeles × horas: arrastrar al día siguiente es pasar de las 22 a las 07.
		const snap = SNAP_H * MS.HOUR;
		const wantedStart = Math.round(axis.msAt(axis.xOf(drag.block.start) + drag.dx) / snap) * snap;
		// Al cambiar de prensa cambia el ajuste: se descuenta el de la prensa de
		// origen y se suma el de la de destino.
		const setupHere = drag.block.setupDone
			? 0
			: setupFor(lane, drag.block.setupColors, otById.get(drag.block.otId)?.ajuste_minutes).hours;
		const durationH = drag.block.pinned
			? workingHoursBetween(laneOf(lanes, drag.block.laneId).calendar, drag.block.start, drag.block.end)
			: drag.block.hours - drag.block.delayHours - drag.block.setupHours + setupHere;
		const start = nextWorkingInstant(lane.calendar, Math.max(wantedStart, planNow));
		const end = addWorkingHours(lane.calendar, start, Math.max(durationH, SNAP_H));
		return { lane, start, end, valid: !lane.virtual && allowed.some((l) => l.id === lane.id) };
	}, [drag, view, shownLanes, axis, planNow, otById]);

	const commitDrop = useCallback(async () => {
		const d = drag;
		const target = dropTarget;
		setDrag(null);
		if (!d || !target) return;
		const moved = Math.abs(d.dx) > 4 || Math.abs(d.dy) > LANE_H / 2;
		if (!moved) {
			setSelected((cur) => (cur === d.block.otId ? null : d.block.otId));
			return;
		}
		if (!target.valid || !target.lane.machineId) {
			toast.error('Esa etapa no se puede hacer en esa máquina');
			return;
		}
		const body = {
			machine_id: target.lane.machineId,
			scheduled_start: new Date(target.start).toISOString(),
			scheduled_end: new Date(target.end).toISOString(),
			plan_step: d.block.step,
		};
		setSaving(true);
		const res = d.block.slotId
			? await fetch(`/api/ot-schedule/${d.block.slotId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				})
			: await fetch('/api/ot-schedule', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ ...body, ot_id: d.block.otId, estimated_hours: d.block.estimatedHours }),
				});
		setSaving(false);
		if (!res.ok) {
			toast.error('No se pudo fijar el bloque', { description: `El servidor respondió ${res.status}.` });
			return;
		}
		const ot = otById.get(d.block.otId);
		toast.success(
			`${shortOt(ot?.ot_number ?? '')} · ${PLAN_STEP_BY_KEY[d.block.step].label} fijada en ${target.lane.name}, ${formatPlantDateTime(target.start)}`,
		);
		queryClient.invalidateQueries({ queryKey: ['planificacion'] });
		queryClient.invalidateQueries({ queryKey: ['schedule'] });
		if (d.block.step === 'offset' || d.block.step === 'digital') queryClient.invalidateQueries({ queryKey: queryKeys.ots });
	}, [drag, dropTarget, otById, queryClient]);

	useEffect(() => {
		if (!drag) return;
		const move = (e: PointerEvent) =>
			setDrag((cur) => (cur ? { ...cur, dx: e.clientX - cur.originX, dy: e.clientY - cur.originY } : cur));
		const up = () => void commitDrop();
		const esc = (e: KeyboardEvent) => e.key === 'Escape' && setDrag(null);
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		window.addEventListener('keydown', esc);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('keydown', esc);
		};
	}, [drag, commitDrop]);

	// Corregir el ajuste de UN trabajo. Vive en la OT (`ots.ajuste_minutes`), así
	// que lo ve cualquier pantalla que la lea, y manda sobre lo de la prensa.
	const saveAjuste = async (otId: string, minutes: number | null) => {
		const res = await fetch(`/api/ots/${otId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ajuste_minutes: minutes }),
		});
		if (!res.ok) {
			toast.error('No se pudo guardar el ajuste', { description: `El servidor respondió ${res.status}.` });
			return;
		}
		toast.success(minutes == null ? 'Ajuste vuelve al de la prensa' : `Ajuste de este trabajo: ${minutes} min por pasada`);
		queryClient.invalidateQueries({ queryKey: ['planificacion'] });
		queryClient.invalidateQueries({ queryKey: queryKeys.ots });
	};

	const release = async (block: Block) => {
		if (!block.slotId) return;
		const res = await fetch(`/api/ot-schedule/${block.slotId}`, { method: 'DELETE' });
		if (!res.ok) {
			toast.error('No se pudo liberar el bloque');
			return;
		}
		toast.success(`${PLAN_STEP_BY_KEY[block.step].label} vuelve a programarse sola`);
		queryClient.invalidateQueries({ queryKey: ['planificacion'] });
		queryClient.invalidateQueries({ queryKey: ['schedule'] });
	};

	/* ── Estados vacíos ────────────────────────────────────────────────────── */

	if (isLoading) return <Skeleton className="h-[480px] w-full" />;
	if (isError || !view || !plan) {
		return (
			<div className="flex items-center justify-between gap-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
				<span className="flex items-center gap-2">
					<AlertTriangle className="h-4 w-4" />
					{(error as Error)?.message ?? 'No se pudo cargar el programa'} — esto no significa que no haya OTs.
				</span>
				<Button size="sm" variant="outline" onClick={() => refetch()}>
					Reintentar
				</Button>
			</div>
		);
	}

	const projections = [...view.projections.values()];
	const late = projections.filter((p) => (p.lateHours ?? 0) > 0);
	const alreadyOverdue = projections.filter((p) => p.deadline != null && p.deadline < planNow);
	const blocked = projections.filter((p) => p.blocked);
	const pinnedCount = view.blocks.filter((b) => b.pinned).length;
	const conflicts = view.blocks.filter((b) => b.conflict);

	const laneIndex = new Map(shownLanes.map((l, i) => [l.id, i]));
	const selectedBlocks = selected ? view.blocks.filter((b) => b.otId === selected).sort((a, b) => a.start - b.start) : [];

	return (
		<div className="space-y-3">
			{/* Resumen + controles */}
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
				<span className="text-muted-foreground">
					<b className="text-foreground">{plan.ots.length}</b> OTs en programa
				</span>
				<Chip tone={late.length ? 'red' : 'green'}>
					{late.length ? `${late.length} terminan después del plazo` : 'Todas dentro de plazo'}
				</Chip>
				{alreadyOverdue.length > 0 && <Chip tone="amber">{alreadyOverdue.length} con plazo ya vencido</Chip>}
				{blocked.length > 0 && <Chip tone="slate">{blocked.length} esperando VB, pre-prensa o papel</Chip>}
				{pinnedCount > 0 && <Chip tone="blue">{pinnedCount} bloques fijados</Chip>}
				{conflicts.length > 0 && <Chip tone="red">{conflicts.length} bloques en conflicto</Chip>}
				{data?.truncated && <Chip tone="amber">Datos incompletos: se alcanzó el tope de filas</Chip>}
				<div className="ml-auto flex items-center gap-1">
					<label className="mr-2 flex cursor-pointer items-center gap-1.5 text-muted-foreground">
						<input
							type="checkbox"
							className="h-3 w-3"
							checked={onlyProductive}
							onChange={(e) => setOnlyProductive(e.target.checked)}
						/>
						Sólo horas productivas
					</label>
					{ZOOMS.map((z) => (
						<Button
							key={z.key}
							size="sm"
							variant={z.key === zoomKey ? 'default' : 'ghost'}
							className="h-7 px-2 text-xs"
							onClick={() => setZoomKey(z.key)}
						>
							{z.label}
						</Button>
					))}
				</div>
			</div>

			{simulating && (
				<div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
					<div className="flex items-start justify-between gap-3">
						<div className="space-y-1">
							<p className="font-medium text-amber-800 dark:text-amber-300">
								Simulación — no se guarda.{' '}
								{Object.entries(delays)
									.filter(([, h]) => h > 0)
									.map(([id, h]) => {
										const [otId, step] = id.split(':');
										return `+${formatHours(h)} en ${PLAN_STEP_BY_KEY[step as Block['step']].label} de ${shortOt(otById.get(otId)?.ot_number ?? '')}`;
									})
									.join(' · ')}
							</p>
							{impacts.length === 0 ? (
								<p className="text-muted-foreground">No mueve la entrega de ninguna OT.</p>
							) : (
								<p className="text-foreground">
									Mueve {impacts.length} entrega{impacts.length === 1 ? '' : 's'}:{' '}
									{impacts.map((i, k) => (
										<span key={i.otId}>
											{k > 0 && ', '}
											<button className="font-mono underline-offset-2 hover:underline" onClick={() => setSelected(i.otId)}>
												{shortOt(otById.get(i.otId)?.ot_number ?? '')}
											</button>{' '}
											<span className={i.becomesLate ? 'font-semibold text-red-600 dark:text-red-400' : ''}>
												{i.shiftHours > 0 ? '+' : '−'}
												{formatSpan(i.shiftHours)}
												{i.becomesLate ? ' (queda atrasada)' : ''}
											</span>
										</span>
									))}
								</p>
							)}
						</div>
						<Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => setDelays({})}>
							<RotateCcw className="mr-1 h-3 w-3" /> Quitar simulación
						</Button>
					</div>
				</div>
			)}

			{/* Gantt */}
			<div className="relative overflow-x-auto rounded-md border border-border bg-card">
				<div className="relative" style={{ width: LABEL_W + totalW, height: HEADER_H + shownLanes.length * LANE_H }}>
					<TimeHeader axis={axis} tickH={zoom.tickH} />
					{shownLanes.map((lane, i) => (
						<LaneRow
							key={lane.id}
							lane={lane}
							top={HEADER_H + i * LANE_H}
							totalW={totalW}
							now={now}
							rangeStart={rangeStart}
							rangeEnd={rangeEnd}
							xOf={xOf}
							msAt={axis.msAt}
							blocks={view.blocks.filter((b) => b.laneId === lane.id)}
							highlight={dropTarget?.lane.id === lane.id ? (dropTarget.valid ? 'ok' : 'bad') : null}
							instances={plan.shifts && lane.machineId ? plan.shifts.instances(lane.machineId, rangeStart, rangeEnd) : null}
							onClosedClick={canEdit ? offerShift : undefined}
						/>
					))}

					{/* Ahora */}
					<div
						className="pointer-events-none absolute z-20 w-px bg-red-500"
						style={{ left: LABEL_W + xOf(now), top: HEADER_H - 6, bottom: 0 }}
					/>

					{/* Cadena de la OT elegida */}
					{selectedBlocks.length > 1 && (
						<svg className="pointer-events-none absolute z-10" style={{ left: LABEL_W, top: 0 }} width={totalW} height={HEADER_H + shownLanes.length * LANE_H}>
							{selectedBlocks.slice(1).map((b, i) => {
								const prev = selectedBlocks[i];
								const x1 = xOf(prev.end);
								const y1 = HEADER_H + (laneIndex.get(prev.laneId) ?? 0) * LANE_H + LANE_H / 2;
								const x2 = xOf(b.start);
								const y2 = HEADER_H + (laneIndex.get(b.laneId) ?? 0) * LANE_H + LANE_H / 2;
								const mid = Math.max(x1, x2) === x1 ? x1 + 6 : (x1 + x2) / 2;
								return (
									<path
										key={b.id}
										d={`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`}
										fill="none"
										stroke={otColor(b.otId)}
										strokeWidth={1.5}
										strokeDasharray="3 2"
									/>
								);
							})}
						</svg>
					)}

					{/* Bloques */}
					{view.blocks.map((b) => {
						const idx = laneIndex.get(b.laneId);
						if (idx == null || b.end < rangeStart || b.start > rangeEnd) return null;
						const ot = otById.get(b.otId);
						const proj = view.projections.get(b.otId);
						const isDragging = drag?.block.id === b.id;
						const left = Math.max(xOf(b.start), 0);
						const width = Math.max(xOf(b.end) - left, 4);
						const lane = shownLanes[idx];
						const color = otColor(b.otId);
						// Sólo lo que cae dentro de un turno es trabajo. Una OT que se imprime
						// en la Tarde y sigue en la Mañana siguiente NO corrió de noche: ese
						// tramo se dibuja transparente, y no suma a las horas del bloque.
						const worked = lane.unlimited ? [[b.start, b.end] as Interval] : workSegments(lane.calendar, b.start, b.end);
						return (
							<div
								key={b.id}
								role="button"
								tabIndex={0}
								title={blockTitle(b, ot, lane)}
								onPointerDown={(e) => {
									if (e.button !== 0) return;
									e.preventDefault();
									if (!canEdit || lane.unlimited || saving) {
										setSelected((cur) => (cur === b.otId ? null : b.otId));
										return;
									}
									setDrag({ block: b, originX: e.clientX, originY: e.clientY, laneIndex: idx, dx: 0, dy: 0 });
								}}
								onKeyDown={(e) => e.key === 'Enter' && setSelected((cur) => (cur === b.otId ? null : b.otId))}
								className={cn(
									'absolute z-10 flex select-none items-center gap-1 overflow-hidden rounded-sm px-1 text-[10px] font-medium text-white shadow-sm',
									canEdit && !lane.unlimited ? 'cursor-grab' : 'cursor-pointer',
									b.source === 'supuesto' && 'border border-dashed border-white/70',
									b.pinned && 'border-2 border-solid border-white',
									b.conflict && 'outline outline-2 outline-red-500',
									(proj?.lateHours ?? 0) > 0 && 'ring-1 ring-red-500 ring-offset-1 ring-offset-card',
									selected && selected !== b.otId && 'opacity-25',
									isDragging && 'opacity-40',
								)}
								style={{
									left: LABEL_W + left,
									width,
									top: HEADER_H + idx * LANE_H + 6,
									height: LANE_H - 12,
									// El contorno de la OT abarca de principio a fin (la cadena se lee
									// igual); el relleno lo ponen los tramos trabajados de abajo.
									backgroundColor: `${color}1f`,
									boxShadow: `inset 0 0 0 1px ${color}99`,
									textShadow: '0 0 2px rgba(0,0,0,0.7)',
								}}
							>
								{worked.map(([s, e]) => (
									<span
										key={s}
										className="pointer-events-none absolute inset-y-0 rounded-sm"
										style={{
											left: Math.max(xOf(s), 0) - left,
											width: Math.max(xOf(e) - Math.max(xOf(s), 0), 1),
											background: color,
										}}
									/>
								))}
								{/* El ajuste, al principio del bloque y con rayas: es máquina
								    parada, no tiraje. */}
								{b.setupHours > 0 && (
									<span
										className="pointer-events-none absolute inset-y-0 left-0 border-r border-white/60"
										style={{
											width: Math.max(xOf(addWorkingHours(lane.calendar, b.start, b.setupHours)) - xOf(b.start), 2),
											backgroundImage: 'repeating-linear-gradient(135deg, rgba(0,0,0,0.35) 0 3px, transparent 3px 6px)',
										}}
									/>
								)}
								{b.inProgress && <span className="relative h-full w-1 shrink-0 rounded-sm bg-white/80" />}
								{b.pinned && <PinIcon className="relative h-2.5 w-2.5 shrink-0" />}
								<span className="relative truncate font-mono">{shortOt(ot?.ot_number ?? '')}</span>
								{width > 70 && <span className="relative truncate opacity-80">{formatHours(b.hours)}</span>}
								{b.delayHours > 0 && <span className="relative shrink-0 rounded bg-black/30 px-0.5">+{formatHours(b.delayHours)}</span>}
							</div>
						);
					})}

					{/* Fantasma del arrastre */}
					{drag && dropTarget && (
						<div
							className={cn(
								'pointer-events-none absolute z-30 flex items-center rounded-sm border-2 border-dashed px-1 text-[10px] font-medium',
								dropTarget.valid ? 'border-foreground/70 bg-foreground/10 text-foreground' : 'border-red-500 bg-red-500/10 text-red-600',
							)}
							style={{
								left: LABEL_W + Math.max(xOf(dropTarget.start), 0),
								width: Math.max(xOf(dropTarget.end) - Math.max(xOf(dropTarget.start), 0), 4),
								top: HEADER_H + (laneIndex.get(dropTarget.lane.id) ?? 0) * LANE_H + 4,
								height: LANE_H - 8,
							}}
						>
							<span className="truncate">{formatPlantDateTime(dropTarget.start)}</span>
						</div>
					)}
				</div>
			</div>

			<Legend canEdit={canEdit} />

			{/* Entregas + detalle */}
			<div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
				<DeliveryList
					ots={plan.ots}
					projections={view.projections}
					selected={selected}
					onSelect={setSelected}
					baseProjections={simulated ? base!.projections : null}
				/>
				{selected && otById.get(selected) ? (
					<OTDetail
						ot={otById.get(selected)!}
						blocks={selectedBlocks}
						lanes={view.lanes}
						projection={view.projections.get(selected)!}
						estimates={plan.estimates}
						delays={delays}
						canEdit={canEdit}
						onDelay={(id, h) => setDelays((cur) => ({ ...cur, [id]: Math.max(0, (cur[id] ?? 0) + h) }))}
						onRelease={release}
						onSetAjuste={saveAjuste}
						operatorsByMachine={operatorsByMachine}
						upcomingOperators={data?.upcomingOperators ?? []}
						onClose={() => setSelected(null)}
					/>
				) : (
					<div className="flex items-center justify-center rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
						Elige una OT —en el gráfico o en la lista— para ver su cadena, de dónde sale cada estimación, y simular un atraso.
					</div>
				)}
			</div>
		</div>
	);
}

/* ─── Piezas ──────────────────────────────────────────────────────────────── */

/** Los tramos de [start, end] en que la máquina está en turno — lo único que es trabajo. */
function workSegments(cal: PlantCalendar, start: number, end: number): Interval[] {
	const out: Interval[] = [];
	for (const [s, e] of workingIntervals(cal, start)) {
		if (s >= end) break;
		out.push([Math.max(s, start), Math.min(e, end)]);
	}
	return out;
}

/** Horas de reloj de un bloque que caen fuera de turno (la OT queda en espera). */
function pauseHours(cal: PlantCalendar, start: number, end: number): number {
	return Math.max(0, (end - start) / MS.HOUR - workingHoursBetween(cal, start, end));
}

function laneOf(lanes: Lane[], id: string): Lane {
	return lanes.find((l) => l.id === id) ?? lanes[0];
}

function blockTitle(b: Block, ot: { ot_number: string; client_name?: string | null } | undefined, lane: Lane): string {
	const lines = [
		`${ot?.ot_number ?? ''} — ${ot?.client_name ?? ''}`,
		`${PLAN_STEP_BY_KEY[b.step].label} en ${lane.name}`,
		`${formatPlantRange(b.start, b.end)} (${formatHours(b.hours)} de trabajo)`,
	];
	const pause = lane.unlimited ? 0 : pauseHours(lane.calendar, b.start, b.end);
	if (pause >= 0.05) {
		lines.push(`En espera ${formatSpan(pause)} fuera de turno (tramo transparente): no cuenta como trabajo`);
	}
	if (b.setupHours > 0) {
		lines.push(
			`Ajuste: ${b.setup.passes} × ${b.setup.perPassMinutes} min = ${formatHours(b.setupHours)} (${AJUSTE_SOURCE_LABEL[b.setup.source]})`,
		);
	}
	if (b.inProgress) lines.push('En curso');
	if (b.pinned) lines.push('Fijada a mano');
	if (b.source === 'supuesto') lines.push('Estimación supuesta: el presupuesto no calcula esta etapa');
	if (b.conflict) lines.push(`⚠ ${b.conflict}`);
	if (b.note) lines.push(b.note);
	return lines.join('\n');
}

function Chip({ tone, children }: { tone: 'red' | 'amber' | 'green' | 'blue' | 'slate'; children: ReactNode }) {
	const tones = {
		red: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
		amber: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
		green: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
		blue: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
		slate: 'border-border bg-muted text-muted-foreground',
	};
	return <span className={cn('rounded-full border px-2 py-0.5 font-medium', tones[tone])}>{children}</span>;
}

function TimeHeader({ axis, tickH }: { axis: TimeAxis; tickH: number }) {
	// Marcas en horas de reloj múltiplo de `tickH` (00, 06, 12, 18…), y una
	// etiqueta de día en cada medianoche y al principio de cada tramo — en la
	// vista "sólo productivas" un tramo puede empezar a las 07:00.
	const ticks: number[] = [];
	const dayMarks: number[] = [];
	for (const d of axis.days) {
		dayMarks.push(d.start);
		for (let t = Math.ceil(d.start / MS.HOUR) * MS.HOUR; t < d.end - MS.HOUR / 2; t += MS.HOUR) {
			const h = plantParts(t).hour;
			if (h === 0 && t !== d.start) dayMarks.push(t);
			if (h % tickH === 0) ticks.push(t);
		}
	}
	return (
		<div className="sticky top-0 z-30 flex border-b border-border bg-card" style={{ height: HEADER_H }}>
			<div className="sticky left-0 z-40 shrink-0 border-r border-border bg-card px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground" style={{ width: LABEL_W }}>
				Máquina / proceso
			</div>
			<div className="relative flex-1">
				{dayMarks.map((d) => (
					<div key={`d${d}`} className="absolute top-0 h-full border-l-2 border-border pl-1 text-[11px] font-semibold text-foreground" style={{ left: axis.xOf(d) }}>
						{formatPlantDay(d)}
					</div>
				))}
				{ticks.map((t) => (
					<div key={`t${t}`} className="absolute bottom-0 border-l border-border/60 pl-0.5 text-[9px] text-muted-foreground" style={{ left: axis.xOf(t), height: 14 }}>
						{formatPlantTime(t)}
					</div>
				))}
			</div>
		</div>
	);
}

/** Tramos hábiles del calendario dentro de la ventana, en píxeles. */
function useWorkingBands(cal: PlantCalendar, rangeStart: number, rangeEnd: number, xOf: (ms: number) => number) {
	return useMemo(() => {
		const out: Array<[number, number]> = [];
		for (const [s, e] of workingIntervals(cal, rangeStart)) {
			if (s >= rangeEnd) break;
			out.push([xOf(s), xOf(Math.min(e, rangeEnd))]);
		}
		return out;
	}, [cal, rangeStart, rangeEnd, xOf]);
}

function LaneRow({
	lane,
	top,
	totalW,
	now,
	rangeStart,
	rangeEnd,
	xOf,
	msAt,
	blocks,
	highlight,
	instances,
	onClosedClick,
}: {
	lane: Lane;
	top: number;
	totalW: number;
	now: number;
	rangeStart: number;
	rangeEnd: number;
	xOf: (ms: number) => number;
	msAt: (x: number) => number;
	blocks: Block[];
	highlight: 'ok' | 'bad' | null;
	/** Los turnos concretos de la máquina (Planta); null = sólo el calendario por tipo. */
	instances: ShiftInstance[] | null;
	onClosedClick?: (lane: Lane, ms: number) => void;
}) {
	const calendarBands = useWorkingBands(lane.calendar, rangeStart, rangeEnd, xOf);
	// Carga: horas programadas sobre horas hábiles dentro de la ventana visible.
	const available = workingHoursBetween(lane.calendar, Math.max(rangeStart, now), rangeEnd);
	const used = blocks.reduce(
		(sum, b) => sum + workingHoursBetween(lane.calendar, Math.max(b.start, rangeStart, now), Math.min(b.end, rangeEnd)),
		0,
	);
	const load = lane.unlimited || available <= 0 ? null : Math.round((used / available) * 100);

	return (
		<div
			className={cn(
				'absolute left-0 flex border-b border-border/60',
				highlight === 'ok' && 'bg-emerald-500/10',
				highlight === 'bad' && 'bg-red-500/10',
			)}
			style={{ top, height: LANE_H, width: LABEL_W + totalW }}
		>
			<div className="sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r border-border bg-card px-2" style={{ width: LABEL_W }}>
				<div className="flex items-center justify-between gap-1">
					<span className={cn('truncate text-xs font-medium', lane.virtual && 'italic text-muted-foreground')}>{lane.name}</span>
					{load != null && (
						<span
							className={cn(
								'shrink-0 font-mono text-[10px]',
								load >= 90 ? 'text-red-600 dark:text-red-400' : load >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
							)}
							title="Horas programadas sobre horas hábiles en la ventana visible"
						>
							{load}%
						</span>
					)}
				</div>
				<span className="truncate text-[10px] text-muted-foreground" title={lane.calendar.label}>
					{lane.unlimited ? 'Externo' : lane.calendar.label}
				</span>
			</div>
			{/* Fuera de turno con rayas, no con un gris que en modo oscuro desaparece.
			    Un clic ahí ofrece abrir un turno en Planta: es donde se asigna gente,
			    y asignar gente es lo que abre el turno. */}
			<div
				className={cn('relative flex-1', onClosedClick && lane.machineId && 'cursor-cell')}
				style={{
					backgroundImage:
						'repeating-linear-gradient(135deg, hsl(var(--muted-foreground) / 0.14) 0 1px, transparent 1px 7px)',
				}}
				onClick={(e) => {
					if (!onClosedClick || !lane.machineId || e.target !== e.currentTarget) return;
					onClosedClick(lane, msAt(e.clientX - e.currentTarget.getBoundingClientRect().left));
				}}
			>
				{instances
					? instances.map((inst) => {
							const x1 = xOf(Math.max(inst.start, rangeStart));
							const x2 = xOf(Math.min(inst.end, rangeEnd));
							if (x2 - x1 < 1) return null;
							const who = inst.operators.length > 0 ? inst.operators.join(', ') : 'habitual';
							return (
								<div
									key={`${inst.shift.id}${inst.start}`}
									className={cn(
										'absolute inset-y-0 border-l bg-card',
										inst.shift.is_night_shift ? 'border-indigo-400/60' : 'border-border/50',
									)}
									style={{ left: x1, width: x2 - x1 }}
									title={`${shiftLabel(inst.shift)} · ${inst.source === 'dotacion' ? `dotación: ${who}` : 'patrón habitual de la máquina'}`}
								>
									{x2 - x1 > 60 && (
										<span
											className={cn(
												'pointer-events-none absolute left-1 top-0 max-w-full truncate text-[8px] leading-tight',
												inst.source === 'dotacion' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/70',
											)}
										>
											{inst.shift.name}
											{inst.source === 'dotacion' ? ` · ${who}` : ''}
										</span>
									)}
								</div>
							);
						})
					: calendarBands.map(([x1, x2]) => (
							<div key={x1} className="absolute inset-y-0 bg-card" style={{ left: x1, width: x2 - x1 }} />
						))}
			</div>
		</div>
	);
}

function Legend({ canEdit }: { canEdit: boolean }) {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
			<span className="flex items-center gap-1">
				<span className="inline-block h-3 w-1 rounded-sm bg-foreground/60" /> en curso
			</span>
			<span className="flex items-center gap-1">
				<PinIcon className="h-3 w-3" /> fijada a mano
			</span>
			<span className="flex items-center gap-1">
				<span className="inline-block h-3 w-4 rounded-sm border border-dashed border-foreground/60" /> estimación supuesta
			</span>
			<span className="flex items-center gap-1">
				<span className="inline-block h-3 w-4 rounded-sm ring-1 ring-red-500" /> OT que termina después del plazo
			</span>
			<span className="flex items-center gap-1">
				<span
					className="inline-block h-3 w-4 rounded-sm border border-border"
					style={{ backgroundImage: 'repeating-linear-gradient(135deg, hsl(var(--muted-foreground) / 0.35) 0 1px, transparent 1px 4px)' }}
				/>{' '}
				fuera de turno
			</span>
			<span className="flex items-center gap-1">
				<span className="inline-flex h-3 w-6 overflow-hidden rounded-sm" style={{ boxShadow: 'inset 0 0 0 1px #2563eb99' }}>
					<span className="h-full w-2 bg-blue-600" />
					<span className="h-full w-2 bg-blue-600/10" />
					<span className="h-full w-2 bg-blue-600" />
				</span>
				OT en espera entre turnos (no suma horas)
			</span>
			<span className="flex items-center gap-1">
				<span className="inline-block h-3 w-px bg-red-500" /> ahora
			</span>
			{canEdit && <span>Arrastra un bloque para fijarlo en otra hora o máquina · Esc cancela</span>}
		</div>
	);
}

function DeliveryList({
	ots,
	projections,
	baseProjections,
	selected,
	onSelect,
}: {
	ots: Array<{ id: string; ot_number: string; client_name?: string | null; status: string }>;
	projections: Map<string, { end: number | null; deadline: number | null; lateHours: number | null; blocked: string | null }>;
	baseProjections: Map<string, { end: number | null }> | null;
	selected: string | null;
	onSelect: (id: string) => void;
}) {
	const rows = ots
		.map((o) => ({ ot: o, p: projections.get(o.id)! }))
		.filter((r) => r.p)
		.sort((a, b) => (a.p.end ?? Infinity) - (b.p.end ?? Infinity));

	return (
		<div className="rounded-md border border-border bg-card">
			<div className="border-b border-border px-3 py-2 text-xs font-semibold">Entregas proyectadas</div>
			<div className="max-h-80 divide-y divide-border/60 overflow-y-auto">
				{rows.map(({ ot, p }) => {
					const lateH = p.lateHours ?? null;
					const shift = baseProjections && p.end != null ? (p.end - (baseProjections.get(ot.id)?.end ?? p.end)) / MS.HOUR : 0;
					return (
						<button
							key={ot.id}
							onClick={() => onSelect(ot.id)}
							className={cn(
								'grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/60',
								selected === ot.id && 'bg-muted',
							)}
						>
							<span className="flex items-center gap-1.5 font-mono font-semibold">
								<span className="h-2 w-2 shrink-0 rounded-full" style={{ background: otColor(ot.id) }} />
								{shortOt(ot.ot_number)}
							</span>
							<span className="min-w-0">
								<span className="block truncate">{ot.client_name ?? '—'}</span>
								<span className="block truncate text-[10px] text-muted-foreground">
									{p.blocked ?? otStatusLabel(ot.status)}
									{p.deadline != null && ` · plazo ${formatPlantDay(p.deadline)}`}
								</span>
							</span>
							<span className="text-right">
								<span className="block font-mono">{p.end != null ? formatPlantDay(p.end) : '—'}</span>
								{lateH != null && (
									<span
										className={cn(
											'block text-[10px]',
											lateH > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
										)}
									>
										{lateH > 0 ? `${formatSpan(lateH)} tarde` : `${formatSpan(-lateH)} de holgura`}
									</span>
								)}
								{Math.abs(shift) >= 0.05 && <span className="block text-[10px] text-amber-600 dark:text-amber-400">sim. +{formatSpan(shift)}</span>}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

/**
 * El ajuste de la impresión de una OT: cuánto se supone, de dónde sale, qué
 * dice lo medido en esa prensa y por cada operario, y quién está asignado ese
 * día. Lo editable es la corrección de ESTE trabajo; la de la prensa se fija en
 * Mantención → máquina → Productividad.
 */
function AjustePanel({
	block,
	lane,
	otOverride,
	operators,
	scheduledOperators,
	canEdit,
	onSave,
}: {
	block: Block;
	lane: Lane;
	otOverride: number | null;
	operators: OperatorAjuste[];
	scheduledOperators: string[];
	canEdit: boolean;
	onSave: (minutes: number | null) => void;
}) {
	const [draft, setDraft] = useState(otOverride != null ? String(otOverride) : '');
	const measured = lane.ajusteMeasured;
	const scheduledSkill = operators.filter((o) => scheduledOperators.includes(o.name));

	if (block.setupDone) {
		return <p className="col-span-3 text-[10px] text-muted-foreground">Ajuste ya hecho: la prensa está corriendo este trabajo.</p>;
	}
	if (lane.type !== 'offset_printer') return null;

	return (
		<div className="col-span-3 rounded border border-border/70 bg-muted/30 px-2 py-1.5 text-[10px] leading-relaxed">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<span className="font-medium text-foreground">
					Ajuste {block.setup.passes} × {block.setup.perPassMinutes} min = {formatHours(block.setupHours)}
				</span>
				<span className="text-muted-foreground">{AJUSTE_SOURCE_LABEL[block.setup.source]}</span>
				<span className="text-muted-foreground">
					{lane.bodies ?? 4} cuerpos · prensa:{' '}
					{lane.ajusteManual != null ? `${lane.ajusteManual} min fijados` : 'sin fijar'}
					{measured ? ` · medido ${measured.medianMinutes} min (n=${measured.samples})` : ' · sin mediciones aún'}
				</span>
			</div>
			{(scheduledOperators.length > 0 || operators.length > 0) && (
				<div className="text-muted-foreground">
					{scheduledOperators.length > 0 && (
						<>
							Asignado ese día: <b className="text-foreground">{scheduledOperators.join(', ')}</b>
							{scheduledSkill.length > 0 &&
								` (su ajuste: ${scheduledSkill.map((o) => `${o.medianMinutes} min, n=${o.samples}`).join('; ')})`}
							{operators.length > 0 && ' · '}
						</>
					)}
					{operators.length > 0 &&
						`Por operario en esta prensa: ${operators.map((o) => `${o.name} ${o.medianMinutes} min (n=${o.samples})`).join(' · ')}`}
				</div>
			)}
			{canEdit && (
				<div className="mt-1 flex items-center gap-1.5">
					<span className="text-muted-foreground">Para este trabajo:</span>
					<input
						type="number"
						min={0}
						max={600}
						step={5}
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						placeholder={String(block.setup.source === 'trabajo' ? '' : block.setup.perPassMinutes)}
						className="h-6 w-16 rounded border border-border bg-background px-1 text-[11px]"
						aria-label="Minutos de ajuste por pasada para este trabajo"
					/>
					<span className="text-muted-foreground">min/pasada</span>
					<Button
						size="sm"
						variant="outline"
						className="h-6 px-2 text-[10px]"
						disabled={draft === '' || Number(draft) === otOverride}
						onClick={() => onSave(Math.max(0, Math.min(600, Math.round(Number(draft)))))}
					>
						Guardar
					</Button>
					{otOverride != null && (
						<Button
							size="sm"
							variant="ghost"
							className="h-6 px-2 text-[10px]"
							onClick={() => {
								setDraft('');
								onSave(null);
							}}
						>
							Quitar corrección
						</Button>
					)}
				</div>
			)}
		</div>
	);
}

function OTDetail({
	ot,
	blocks,
	lanes,
	projection,
	estimates,
	delays,
	canEdit,
	onDelay,
	onRelease,
	onSetAjuste,
	operatorsByMachine,
	upcomingOperators,
	onClose,
}: {
	ot: {
		id: string;
		ot_number: string;
		client_name?: string | null;
		product_name?: string | null;
		status: string;
		ajuste_minutes?: number | null;
	};
	blocks: Block[];
	lanes: Lane[];
	projection: { end: number | null; deadline: number | null; lateHours: number | null; blocked: string | null };
	estimates: Map<string, Estimate>;
	delays: Record<string, number>;
	canEdit: boolean;
	onDelay: (blockId: string, hours: number) => void;
	onRelease: (b: Block) => void;
	onSetAjuste: (otId: string, minutes: number | null) => void;
	operatorsByMachine: Map<string, OperatorAjuste[]>;
	upcomingOperators: Array<{ machine_id: string; date: string; name: string }>;
	onClose: () => void;
}) {
	const late = (projection.lateHours ?? 0) > 0;
	return (
		<div className="rounded-md border border-border bg-card">
			<div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<span className="h-2.5 w-2.5 rounded-full" style={{ background: otColor(ot.id) }} />
						<span className="font-mono text-sm font-semibold">{ot.ot_number}</span>
						<Badge variant="outline" className={cn('text-[10px]', otStatusBadgeClass(ot.status))}>
							{otStatusLabel(ot.status)}
						</Badge>
					</div>
					<p className="truncate text-xs text-muted-foreground">
						{ot.client_name} · {ot.product_name ?? '—'}
					</p>
				</div>
				<div className="text-right text-xs">
					<div>
						Entrega proyectada{' '}
						<b className={late ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
							{projection.end != null ? formatPlantDateTime(projection.end) : '—'}
						</b>
					</div>
					<div className="text-muted-foreground">
						Plazo {projection.deadline != null ? formatPlantDay(projection.deadline) : 'sin fecha'}
						{projection.lateHours != null && (late ? ` · ${formatSpan(projection.lateHours)} tarde` : ` · ${formatSpan(-projection.lateHours)} de holgura`)}
					</div>
				</div>
				<button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar detalle">
					<X className="h-4 w-4" />
				</button>
			</div>
			{projection.blocked && (
				<p className="border-b border-border bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground">
					{projection.blocked}: el programa supone que puede entrar a producción ahora. Si no, todo lo de abajo se corre.
				</p>
			)}
			<div className="divide-y divide-border/60">
				{blocks.map((b) => {
					const est = estimates.get(b.id);
					const lane = laneOf(lanes, b.laneId);
					return (
						<div key={b.id} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 text-xs">
							<div className="min-w-0">
								<div className="flex items-center gap-1 font-medium">
									{PLAN_STEP_BY_KEY[b.step].label}
									{b.inProgress && <span className="rounded bg-blue-500/15 px-1 text-[10px] text-blue-700 dark:text-blue-300">en curso</span>}
									{b.pinned && <PinIcon className="h-3 w-3 text-muted-foreground" />}
								</div>
								<div className="truncate text-[10px] text-muted-foreground">
									{lane.name} · {formatPlantRange(b.start, b.end)}
									{!lane.unlimited && pauseHours(lane.calendar, b.start, b.end) >= 0.05 && (
										<> · en espera {formatSpan(pauseHours(lane.calendar, b.start, b.end))} fuera de turno</>
									)}
								</div>
								{b.conflict && <div className="text-[10px] text-red-600 dark:text-red-400">⚠ {b.conflict}</div>}
								{b.note && <div className="text-[10px] text-amber-600 dark:text-amber-400">{b.note}</div>}
							</div>
							<div className="text-[10px] leading-tight">
								<div className="font-mono text-xs text-foreground">
									{formatHours(b.hours)}
									{b.inProgress && b.estimatedHours !== b.hours && <span className="text-muted-foreground"> de {formatHours(b.estimatedHours)}</span>}
								</div>
								<div className="text-muted-foreground">
									{b.source === 'presupuesto' ? 'Presupuesto' : 'Supuesto'} {formatHours(b.quoteHours)}
									{est?.factor != null && est.historyWeight > 0 && ` · historial ×${est.factor.toLocaleString('es-CL')} (n=${est.samples})`}
									{est && est.samples > 0 && est.historyWeight === 0 && ` · historial: ${est.samples} muestra${est.samples === 1 ? '' : 's'}, aún no pesa`}
								</div>
							</div>
							<div className="flex items-center gap-1">
								{[1, 4, 8].map((h) => (
									<Button key={h} size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => onDelay(b.id, h)} title={`Simular ${h} h de atraso`}>
										+{h}h
									</Button>
								))}
								{(delays[b.id] ?? 0) > 0 && (
									<Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => onDelay(b.id, -(delays[b.id] ?? 0))} title="Quitar el atraso simulado">
										<RotateCcw className="h-3 w-3" />
									</Button>
								)}
								{canEdit && b.pinned && (
									<Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => onRelease(b)} title="Liberar: vuelve a programarse sola">
										<Unlock className="h-3 w-3" />
									</Button>
								)}
							</div>
							{b.setupColors && (
								<AjustePanel
									block={b}
									lane={lane}
									otOverride={ot.ajuste_minutes ?? null}
									operators={lane.machineId ? operatorsByMachine.get(lane.machineId) ?? [] : []}
									scheduledOperators={upcomingOperators
										.filter((o) => o.machine_id === lane.machineId && o.date === plantDate(new Date(b.start).toISOString()))
										.map((o) => o.name)}
									canEdit={canEdit}
									onSave={(m) => onSetAjuste(ot.id, m)}
								/>
							)}
						</div>
					);
				})}
				{blocks.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No le quedan etapas por programar.</p>}
			</div>
		</div>
	);
}
