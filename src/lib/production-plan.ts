/**
 * De la respuesta de /api/planificacion a la entrada del planificador.
 *
 * Junta las cuatro fuentes de una etapa —la ruta de la OT, la estimación
 * (presupuesto + historial), lo que el taller ya declaró y lo que alguien fijó
 * a mano— en el formato que consume `buildSchedule`. Separado del componente
 * para poder probarlo sin React.
 */

import type { OperatorAjuste } from '@/lib/ajuste';
import { createShiftResolver, type ShiftModel, type ShiftResolver } from '@/lib/machine-calendar';
import { calendarForMachineType, plantParts, plantWallClockToMs } from '@/lib/plant-calendar';
import {
	deriveRoute,
	inferPlanStep,
	isPlanStepKey,
	remainingRoute,
	type PlanStepKey,
	type RouteOT,
} from '@/lib/production-route';
import type { MaintenanceJob, MaintenanceKind, Pin, SchedMachine, SchedOT } from '@/lib/production-scheduler';
import { estimateStep, reportedHoursByStatus, type Estimate, type StageHistory, type StageReportRow } from '@/lib/stage-history';

export interface PlanPayload {
	generatedAt: string;
	ots: Array<RouteOT & Omit<SchedOT, 'steps'>>;
	machines: Array<SchedMachine & { status?: string | null; ajuste_by_operator?: OperatorAjuste[] }>;
	pins: Array<{ slotId: string; otId: string; machineId: string; planStep: string | null; start: string; end: string }>;
	history: StageHistory;
	/** Quién está asignado a cada prensa en los próximos días (`worker_assignments`). */
	upcomingOperators?: Array<{ machine_id: string; date: string; name: string }>;
	/** Definiciones, patrones y dotación de Planta. `null` antes de la migración de turnos. */
	shiftModel?: ShiftModel | null;
	/** Órdenes de mantención abiertas y pautas por vencer (`loadMaintenance` en la ruta). */
	maintenance?: MaintenancePayload[];
	reports: StageReportRow[];
	truncated: boolean;
}

/** Una mantención tal como la manda la API, con fechas YYYY-MM-DD. */
export interface MaintenancePayload {
	id: string;
	machine_id: string;
	kind: MaintenanceKind;
	/** Día de la orden o de la pauta; null en las que están en curso. */
	date: string | null;
	hours: number;
	hours_source: MaintenanceJob['hoursSource'];
	title: string;
	work_order_id: string | null;
}

export interface PlanInput {
	ots: SchedOT[];
	pins: Pin[];
	machines: SchedMachine[];
	/** Cómo se llegó a las horas de cada bloque (`${otId}:${step}`). */
	estimates: Map<string, Estimate>;
	/** Turnos de Planta resueltos por máquina; `null` si todavía no hay modelo de turnos. */
	shifts: ShiftResolver | null;
	maintenance: MaintenanceJob[];
}

export function buildPlanInput(payload: PlanPayload): PlanInput {
	// Turnos de Planta: cada máquina con su patrón y su dotación. Sin el modelo
	// (antes de la migración de turnos) cada una sigue el supuesto por tipo.
	const shifts = payload.shiftModel ? createShiftResolver(payload.shiftModel) : null;
	const machines = payload.machines.map(({ id, name, type, max_workers, colors, ajuste_minutes, ajuste_measured }) => ({
		id,
		name,
		type,
		max_workers,
		colors,
		ajuste_minutes,
		ajuste_measured,
		calendar: shifts ? shifts.calendarFor(id, calendarForMachineType(type)) : undefined,
		stationCalendar: shifts ? (station: number) => shifts.calendarFor(id, calendarForMachineType(type), station) : undefined,
	}));
	const machineTypeById = new Map(machines.map((m) => [m.id, m.type]));
	const estimates = new Map<string, Estimate>();
	const routes = new Map<string, ReturnType<typeof deriveRoute>>();

	const ots: SchedOT[] = payload.ots.map((ot) => {
		const route = deriveRoute(ot, machineTypeById);
		routes.set(ot.id, route);
		const reported = reportedHoursByStatus(payload.reports, ot.id);
		const steps = remainingRoute(
			ot,
			route,
			(step) => {
				// La impresión se calibra contra la prensa asignada si la hay; el
				// resto, contra la columna (la máquina todavía no está decidida).
				const machineId = step.key === 'offset' || step.key === 'digital' ? ot.assigned_machine_id : null;
				const est = estimateStep(step, payload.history, machineId);
				estimates.set(`${ot.id}:${step.key}`, est);
				return est.hours;
			},
			reported,
		);
		return { ...ot, steps };
	});

	const pending = new Map(ots.map((o) => [o.id, new Set<PlanStepKey>(o.steps.map((s) => s.key))]));
	const seen = new Set<string>();
	const pins: Pin[] = [];
	for (const p of payload.pins) {
		const route = routes.get(p.otId);
		if (!route) continue;
		const step = isPlanStepKey(p.planStep) ? p.planStep : inferPlanStep(machineTypeById.get(p.machineId), route);
		// Un bloque de una etapa que ya pasó en el Kanban no ocupa la máquina.
		if (!step || !pending.get(p.otId)?.has(step)) continue;
		const key = `${p.otId}:${step}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const start = Date.parse(p.start);
		const end = Date.parse(p.end);
		if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
		pins.push({ slotId: p.slotId, otId: p.otId, step, machineId: p.machineId, start, end });
	}

	const maintenance: MaintenanceJob[] = (payload.maintenance ?? []).map((m) => {
		const [y, mo, d] = (m.date ?? '').split('-').map(Number);
		return {
			id: m.id,
			machineId: m.machine_id,
			kind: m.kind,
			dayStart: m.date ? plantWallClockToMs(y, mo, d, 0) : null,
			hours: m.hours,
			hoursSource: m.hours_source,
			title: m.title,
			workOrderId: m.work_order_id,
		};
	});

	return { ots, pins, machines, estimates, shifts, maintenance };
}

/* ─── Formato ─────────────────────────────────────────────────────────────── */

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const pad = (n: number) => String(n).padStart(2, '0');

/** «mié 28 oct · 14:30», en hora de la planta. */
export function formatPlantDateTime(ms: number): string {
	const p = plantParts(ms);
	return `${DIAS[p.weekday]} ${p.day} ${MESES[p.month - 1]} · ${pad(p.hour)}:${pad(p.minute)}`;
}

/** «mié 28 oct». */
export function formatPlantDay(ms: number): string {
	const p = plantParts(ms);
	return `${DIAS[p.weekday]} ${p.day} ${MESES[p.month - 1]}`;
}

export function formatPlantTime(ms: number): string {
	const p = plantParts(ms);
	return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** «mié 28 oct · 14:30 → 18:00», o con la fecha del fin si cae otro día. */
export function formatPlantRange(start: number, end: number): string {
	const a = plantParts(start);
	const b = plantParts(end);
	const sameDay = a.year === b.year && a.month === b.month && a.day === b.day;
	return `${formatPlantDateTime(start)} → ${sameDay ? formatPlantTime(end) : formatPlantDateTime(end)}`;
}

export function formatHours(h: number): string {
	return `${h.toLocaleString('es-CL', { maximumFractionDigits: 1 })} h`;
}

/** «2 d 5 h» para lapsos largos; horas a secas si es menos de un día. */
export function formatSpan(hours: number): string {
	const abs = Math.abs(hours);
	if (abs < 24) return formatHours(Math.round(abs * 10) / 10);
	const d = Math.floor(abs / 24);
	const h = Math.round(abs - d * 24);
	return h ? `${d} d ${h} h` : `${d} d`;
}
