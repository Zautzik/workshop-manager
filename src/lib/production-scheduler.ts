/**
 * El programa de producción: cada etapa pendiente de cada OT activa, puesta en
 * una máquina y en un horario, respetando tres reglas:
 *
 * 1. Una etapa no empieza antes de que termine la anterior de la misma OT.
 * 2. Una máquina hace una cosa a la vez.
 * 3. Sólo se trabaja dentro del turno de la máquina (`plant-calendar.ts`).
 *
 * Es una función pura —entra el estado, sale el programa— a propósito: corre
 * igual en el servidor y en el navegador, y es eso lo que permite preguntar
 * "¿qué pasa si la offset se atrasa 4 horas?" sin guardar nada: se vuelve a
 * correr con el atraso inyectado y se compara (`compareSchedules`).
 *
 * Lo que una persona fijó a mano (arrastrando un bloque, o en la Hoja de
 * Producción) es un `pin` y no se mueve; el resto se acomoda alrededor.
 *
 * ── Orden ───────────────────────────────────────────────────────────────────
 *
 * Primero lo que está físicamente en una máquina ahora (la etapa en curso de
 * cada OT), después el resto por prioridad y plazo. Sin la primera pasada, una
 * OT urgente que todavía no llega a la offset le quitaría el lugar a la que ya
 * está corriendo en ella — un programa que el taller desobedecería en el acto.
 */

import {
	addWorkingHours,
	calendarForMachineType,
	CALENDARS,
	deadlineToMs,
	MS,
	nextWorkingInstant,
	workingHoursBetween,
	type PlantCalendar,
} from '@/lib/plant-calendar';
import { resolveAjuste, type AjusteSource, type AjusteStat } from '@/lib/ajuste';
import { CALIBRATION, pressPasses } from '@/lib/ot-calculations';
import {
	blockedReason,
	PLAN_STEP_BY_KEY,
	PLAN_STEPS,
	type EstimateSource,
	type PlanStepKey,
	type RemainingStep,
	type RouteOT,
	type SetupColors,
} from '@/lib/production-route';

export interface SchedMachine {
	id: string;
	name: string;
	type: string;
	/**
	 * Cuántos trabajos a la vez. Sólo cuenta para el taller manual, donde es la
	 * cantidad de puestos (`machines.max_workers`); en una prensa `max_workers`
	 * es la dotación de UNA corrida, no corridas en paralelo.
	 */
	max_workers?: number | null;
	/** Cuerpos de la prensa: cuántos colores entran en una pasada. */
	colors?: number | null;
	/** Minutos de ajuste por pasada que fijó el supervisor (null = no fijado). */
	ajuste_minutes?: number | null;
	/** Mediana de lo que declararon los operarios (`ajuste.ts`). */
	ajuste_measured?: AjusteStat | null;
	/**
	 * Cuándo trabaja ESTA máquina (patrón + dotación de Planta, ver
	 * `machine-calendar.ts`). Sin él, el supuesto por tipo.
	 */
	calendar?: PlantCalendar;
	/**
	 * El calendario de cada puesto (1, 2, …) en una máquina de varios puestos:
	 * un puesto sólo trabaja si ese turno tiene gente para él. Sin esto, todos
	 * los puestos usan `calendar` — y un solo operario el sábado abría los ocho.
	 */
	stationCalendar?: (station: number) => PlantCalendar;
}

export interface Setup {
	hours: number;
	passes: number;
	perPassMinutes: number;
	source: AjusteSource;
}

const NO_SETUP: Setup = { hours: 0, passes: 0, perPassMinutes: 0, source: 'presupuesto' };

/**
 * El ajuste que le cuesta un trabajo a una prensa: una vez por pasada, y las
 * pasadas dependen de cuántos cuerpos tiene ESA prensa. Los minutos por pasada
 * salen de `resolveAjuste` (trabajo > prensa > medido > presupuesto).
 */
export function setupFor(
	lane: Pick<Lane, 'type' | 'bodies' | 'ajusteManual' | 'ajusteMeasured'>,
	colors: SetupColors | undefined,
	otOverride?: number | null,
): Setup {
	if (!colors || lane.type !== 'offset_printer') return NO_SETUP;
	const passes = pressPasses(colors.front, colors.back, lane.bodies ?? CALIBRATION.DEFAULT_PRESS_BODIES);
	if (passes === 0) return NO_SETUP;
	const { minutes, source } = resolveAjuste({
		otOverride,
		machineManual: lane.ajusteManual,
		measured: lane.ajusteMeasured,
	});
	return { hours: Math.round(((passes * minutes) / 60) * 100) / 100, passes, perPassMinutes: minutes, source };
}

/** Tipos donde `max_workers` son puestos que trabajan en paralelo. */
const PARALLEL_TYPES = new Set(['manual_workshop']);

export interface Lane {
	id: string;
	/** La máquina real detrás del carril (null en carriles virtuales). */
	machineId: string | null;
	name: string;
	type: string;
	/** Puesto dentro de la máquina (1 si tiene uno solo). */
	station: number;
	calendar: PlantCalendar;
	/** Carril sin máquina real detrás: no hay ninguna de ese tipo en la flota. */
	virtual: boolean;
	/** Capacidad ilimitada (tercerizado): no compite por tiempo. */
	unlimited: boolean;
	/** Sólo prensas: cuerpos, ajuste fijado a mano y ajuste medido. */
	bodies: number | null;
	ajusteManual: number | null;
	ajusteMeasured: AjusteStat | null;
}

export interface Pin {
	slotId: string;
	otId: string;
	step: PlanStepKey;
	machineId: string;
	start: number;
	end: number;
}

export interface SchedOT extends RouteOT {
	ot_number: string;
	client_name?: string | null;
	product_name?: string | null;
	deadline?: string | null;
	priority_level?: string | null;
	created_at?: string | null;
	/** Corrección del ajuste por pasada para este trabajo (min). */
	ajuste_minutes?: number | null;
	steps: RemainingStep[];
}

export interface Block {
	/** `${otId}:${step}` — estable entre corridas, sirve de clave de atraso. */
	id: string;
	otId: string;
	step: PlanStepKey;
	laneId: string;
	start: number;
	end: number;
	hours: number;
	estimatedHours: number;
	quoteHours: number;
	source: EstimateSource;
	/** Parte de `hours` que es ajuste de prensa, al principio del bloque. */
	setupHours: number;
	setup: Setup;
	setupColors?: SetupColors;
	setupDone?: boolean;
	inProgress: boolean;
	pinned: boolean;
	slotId?: string;
	/** Horas de atraso inyectadas en una simulación. */
	delayHours: number;
	conflict?: string;
	/** Aviso que no es un conflicto (p. ej. un horario fijado que ya pasó). */
	note?: string;
}

export interface OTProjection {
	otId: string;
	end: number | null;
	deadline: number | null;
	/** Horas de reloj entre el plazo y el fin proyectado (positivo = atrasada). */
	lateHours: number | null;
	blocked: string | null;
}

export interface Schedule {
	lanes: Lane[];
	blocks: Block[];
	projections: Map<string, OTProjection>;
}

export interface ScheduleInput {
	now: number;
	ots: SchedOT[];
	machines: SchedMachine[];
	pins: Pin[];
	/** Horas extra por bloque (`Block.id`), para simular atrasos. */
	delays?: Record<string, number>;
}

const PRIORITY_RANK: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baja: 3 };

const VIRTUAL_NAMES: Record<string, string> = {
	manual_workshop: 'Taller',
	delivery: 'Despacho',
	folder: 'Plegado',
	laminator: 'Laminado',
	die_cutter: 'Troquelado',
	guillotine: 'Guillotina',
	offset_printer: 'Offset',
	digital_printer: 'Digital',
};

const EXTERNAL_LANE = 'externo';

/**
 * Los carriles en orden de flujo: el de la primera etapa que los usa va arriba.
 * Una máquina que ninguna etapa del plan usa (alzadora, corchetera) no aparece:
 * no tendría nada que mostrar.
 */
export function buildLanes(machines: SchedMachine[], ots: SchedOT[]): Lane[] {
	const flowIndex = (type: string) => {
		const i = PLAN_STEPS.findIndex((s) => s.machineTypes.includes(type));
		return i === -1 ? Number.MAX_SAFE_INTEGER : i;
	};
	const usedTypes = new Set(PLAN_STEPS.flatMap((s) => s.machineTypes));
	const lanes: Lane[] = machines
		.filter((m) => usedTypes.has(m.type))
		.flatMap((m) => {
			const stations = PARALLEL_TYPES.has(m.type) ? Math.max(1, Math.floor(m.max_workers ?? 1)) : 1;
			return Array.from({ length: stations }, (_, i) => ({
				// El primer puesto conserva el id de la máquina: los bloques fijados
				// (que guardan `machine_id`) caen ahí si está libre.
				id: i === 0 ? m.id : `${m.id}~${i + 1}`,
				machineId: m.id,
				name: stations > 1 ? `${m.name} #${i + 1}` : m.name,
				type: m.type,
				station: i + 1,
				calendar: (stations > 1 ? m.stationCalendar?.(i + 1) : undefined) ?? m.calendar ?? calendarForMachineType(m.type),
				virtual: false,
				unlimited: false,
				bodies: m.colors && m.colors > 0 ? m.colors : null,
				ajusteManual: m.ajuste_minutes != null && m.ajuste_minutes >= 0 ? m.ajuste_minutes : null,
				ajusteMeasured: m.ajuste_measured ?? null,
			}));
		});

	const present = new Set(lanes.map((l) => l.type));
	const needed = new Set(ots.flatMap((o) => o.steps.map((s) => PLAN_STEP_BY_KEY[s.key].machineTypes[0]).filter(Boolean)));
	for (const type of needed) {
		if (present.has(type)) continue;
		lanes.push({
			id: `virtual:${type}`,
			machineId: null,
			name: `${VIRTUAL_NAMES[type] ?? type} (sin máquina)`,
			type,
			calendar: calendarForMachineType(type),
			station: 1,
			virtual: true,
			unlimited: false,
			bodies: null,
			ajusteManual: null,
			ajusteMeasured: null,
		});
	}
	if (ots.some((o) => o.steps.some((s) => s.key === 'tercerizado'))) {
		lanes.push({
			id: EXTERNAL_LANE,
			machineId: null,
			name: 'Tercerizado',
			type: 'externo',
			calendar: CALENDARS.taller,
			station: 1,
			virtual: true,
			unlimited: true,
			bodies: null,
			ajusteManual: null,
			ajusteMeasured: null,
		});
	}

	return lanes.sort(
		(a, b) => flowIndex(a.type) - flowIndex(b.type) || a.name.localeCompare(b.name, 'es', { numeric: true }),
	);
}

/** Carriles que pueden recibir una etapa — lo que permite soltar un bloque arrastrado. */
export function lanesForStep(lanes: Lane[], step: PlanStepKey): Lane[] {
	const types = PLAN_STEP_BY_KEY[step].machineTypes;
	if (types.length === 0) return lanes.filter((l) => l.id === EXTERNAL_LANE);
	return lanes.filter((l) => types.includes(l.type));
}

function compareOTs(a: SchedOT, b: SchedOT): number {
	const pa = PRIORITY_RANK[a.priority_level ?? 'normal'] ?? 2;
	const pb = PRIORITY_RANK[b.priority_level ?? 'normal'] ?? 2;
	if (pa !== pb) return pa - pb;
	const da = deadlineToMs(a.deadline) ?? Number.MAX_SAFE_INTEGER;
	const db = deadlineToMs(b.deadline) ?? Number.MAX_SAFE_INTEGER;
	if (da !== db) return da - db;
	return a.ot_number.localeCompare(b.ot_number, 'es', { numeric: true });
}

type Busy = Array<[number, number]>;

/** «4,5 h» — igual que `formatHours` (production-plan importa de acá: no se cruza). */
const formatH = (h: number) => `${h.toLocaleString('es-CL', { maximumFractionDigits: 1 })} h`;

function reserve(busy: Busy, start: number, end: number) {
	busy.push([start, end]);
	busy.sort((x, y) => x[0] - y[0]);
}

/** El primer hueco del carril donde caben `hours` horas hábiles desde `earliest`. */
function findSlot(lane: Lane, busy: Busy, earliest: number, hours: number): [number, number] {
	let start = nextWorkingInstant(lane.calendar, earliest);
	for (let guard = 0; guard < 2000; guard++) {
		const end = addWorkingHours(lane.calendar, start, hours);
		if (lane.unlimited) return [start, end];
		const clash = busy.find(([s, e]) => s < end && e > start);
		if (!clash) return [start, end];
		start = nextWorkingInstant(lane.calendar, clash[1]);
	}
	return [start, addWorkingHours(lane.calendar, start, hours)];
}

export function buildSchedule(input: ScheduleInput): Schedule {
	const { now, machines, pins } = input;
	const delays = input.delays ?? {};
	const ots = [...input.ots].sort(compareOTs);
	const lanes = buildLanes(machines, ots);
	const laneById = new Map(lanes.map((l) => [l.id, l]));
	const busy = new Map<string, Busy>(lanes.map((l) => [l.id, []]));

	// Un bloque fijado ocupa el primer puesto de su máquina que esté libre en ese
	// horario. Uno que ya terminó y cuya etapa sigue abierta es un plan vencido
	// (típico: una fila de la Hoja de Producción de hace semanas): no ocupa nada
	// y la etapa se reprograma sola, conservando el `slotId` para que el próximo
	// arrastre corrija esa fila en vez de crear otra.
	const pinByBlock = new Map<string, { pin: Pin; laneId: string; overlaps: boolean }>();
	const stalePinByBlock = new Map<string, Pin>();
	for (const pin of [...pins].sort((a, b) => a.start - b.start)) {
		const key = `${pin.otId}:${pin.step}`;
		const stations = lanes.filter((l) => l.machineId === pin.machineId);
		if (stations.length === 0) continue;
		if (pin.end <= now) {
			stalePinByBlock.set(key, pin);
			continue;
		}
		// Sin puesto libre, dos bloques fijados se pisan en la misma máquina: se
		// dibuja igual (es lo que alguien decidió) pero marcado como conflicto.
		const free = stations.find((l) => !busy.get(l.id)!.some(([s, e]) => s < pin.end && e > pin.start));
		const lane = free ?? stations[0];
		pinByBlock.set(key, { pin, laneId: lane.id, overlaps: !free });
		reserve(busy.get(lane.id)!, pin.start, pin.end);
	}

	const blocks: Block[] = [];
	const lastEnd = new Map<string, number>();

	const place = (ot: SchedOT, step: RemainingStep, prevKey: PlanStepKey | null) => {
		const id = `${ot.id}:${step.key}`;
		const delay = Math.max(0, delays[id] ?? 0);
		const earliest = Math.max(now, lastEnd.get(ot.id) ?? now);
		// El ajuste depende de la prensa: se calcula por carril candidato.
		const setupOn = (lane: Lane) => (step.setupDone ? NO_SETUP : setupFor(lane, step.setupColors, ot.ajuste_minutes));
		const base = {
			id,
			otId: ot.id,
			step: step.key,
			estimatedHours: step.estimatedHours,
			quoteHours: step.quoteHours,
			source: step.source,
			setupColors: step.setupColors,
			setupDone: step.setupDone,
			inProgress: step.inProgress,
			delayHours: delay,
		};

		const pinned = pinByBlock.get(id);
		if (pinned) {
			const { pin } = pinned;
			const lane = laneById.get(pinned.laneId)!;
			const setup = setupOn(lane);
			const workHours = step.hours + setup.hours + delay;
			// Lo fijado es CUÁNDO EMPIEZA y en qué máquina, no cuánto dura el trabajo.
			// Una ventana más corta que el trabajo hacía que 15 h de troquel
			// "terminaran" en 4 y toda la cadena siguiente arrancara antes de tiempo:
			// el bloque se alarga hasta donde de verdad termina, y lo dice. Un atraso
			// simulado alarga la ventana fijada desde donde está.
			const windowEnd = delay > 0 ? addWorkingHours(lane.calendar, pin.end, delay) : pin.end;
			const workEnd = addWorkingHours(lane.calendar, pin.start, workHours);
			const end = Math.max(windowEnd, workEnd);
			const conflicts: string[] = [];
			if (pinned.overlaps) conflicts.push('Se pisa con otro bloque fijado en la misma máquina');
			const prevEnd = lastEnd.get(ot.id);
			if (prevEnd != null && pin.start < prevEnd - 60_000 && prevKey) {
				conflicts.push(`Empieza antes de que termine ${PLAN_STEP_BY_KEY[prevKey].label.toLowerCase()}`);
			}
			let note: string | undefined;
			if (workEnd > windowEnd + 60_000) {
				const windowHours = workingHoursBetween(lane.calendar, pin.start, windowEnd);
				note = `El horario fijado da ${formatH(windowHours)} de turno para ${formatH(workHours)} de trabajo: el bloque se alarga hasta donde termina`;
				if (busy.get(lane.id)!.some(([s, e]) => s < end && e > windowEnd)) {
					conflicts.push('Al alargarse, se pisa con otro bloque fijado');
				}
				reserve(busy.get(lane.id)!, windowEnd, end);
			}
			const conflict = conflicts.length > 0 ? conflicts.join(' · ') : undefined;
			blocks.push({
				...base,
				hours: workHours,
				setupHours: setup.hours,
				setup,
				laneId: lane.id,
				start: pin.start,
				end,
				pinned: true,
				slotId: pin.slotId,
				conflict,
				note,
			});
			lastEnd.set(ot.id, Math.max(end, now));
			return;
		}

		const candidates = lanesForStep(lanes, step.key);
		if (candidates.length === 0) return;
		// La impresión respeta la máquina ya asignada a la OT: es la misma que leen
		// el Kanban, Órdenes en Proceso y el costeo (`ots.assigned_machine_id`).
		const assigned =
			(step.key === 'offset' || step.key === 'digital') && ot.assigned_machine_id
				? candidates.find((l) => l.id === ot.assigned_machine_id)
				: undefined;
		const options = assigned ? [assigned] : candidates;

		// Gana la prensa donde el trabajo TERMINA antes, ajuste incluido: una
		// prensa de 2 cuerpos libre ahora puede perder contra una de 4 que se
		// desocupa en una hora, porque le cuesta un ajuste más.
		let best: { lane: Lane; slot: [number, number]; setup: Setup } | null = null;
		for (const lane of options) {
			const setup = setupOn(lane);
			const slot = findSlot(lane, busy.get(lane.id)!, earliest, step.hours + setup.hours + delay);
			if (!best || slot[1] < best.slot[1]) best = { lane, slot, setup };
		}
		const { lane, slot, setup } = best!;
		if (!lane.unlimited) reserve(busy.get(lane.id)!, slot[0], slot[1]);
		const stale = stalePinByBlock.get(id);
		blocks.push({
			...base,
			hours: step.hours + setup.hours + delay,
			setupHours: setup.hours,
			setup,
			laneId: lane.id,
			start: slot[0],
			end: slot[1],
			pinned: false,
			slotId: stale?.slotId,
			note: stale ? 'Tenía un horario fijado que ya pasó sin cerrarse la etapa; se reprogramó sola' : undefined,
		});
		lastEnd.set(ot.id, slot[1]);
	};

	// Pasada 1: lo que está en una máquina ahora mismo.
	const done = new Set<string>();
	for (const ot of ots) {
		ot.steps.forEach((step, i) => {
			if (!step.inProgress) return;
			place(ot, step, i > 0 ? ot.steps[i - 1].key : null);
			done.add(`${ot.id}:${step.key}`);
		});
	}
	// Pasada 2: el resto, OT por OT, en orden de prioridad y plazo.
	for (const ot of ots) {
		ot.steps.forEach((step, i) => {
			if (done.has(`${ot.id}:${step.key}`)) return;
			place(ot, step, i > 0 ? ot.steps[i - 1].key : null);
		});
	}

	const projections = new Map<string, OTProjection>();
	for (const ot of ots) {
		const own = blocks.filter((b) => b.otId === ot.id);
		const end = own.length ? Math.max(...own.map((b) => b.end)) : null;
		const deadline = deadlineToMs(ot.deadline);
		projections.set(ot.id, {
			otId: ot.id,
			end,
			deadline,
			lateHours: end != null && deadline != null ? (end - deadline) / MS.HOUR : null,
			blocked: blockedReason(ot),
		});
	}

	return { lanes, blocks, projections };
}

export interface Impact {
	otId: string;
	/** Horas de reloj que se corre la entrega proyectada. */
	shiftHours: number;
	becomesLate: boolean;
}

/**
 * Qué OTs cambian de fecha entre dos programas — la respuesta a "si esto se
 * atrasa, ¿a quién arrastra?". Ordenadas por cuánto se corren.
 */
export function compareSchedules(base: Schedule, alt: Schedule): Impact[] {
	const out: Impact[] = [];
	for (const [otId, b] of base.projections) {
		const a = alt.projections.get(otId);
		if (!a || b.end == null || a.end == null) continue;
		const shiftHours = (a.end - b.end) / MS.HOUR;
		// Menos de 3 minutos es ruido de redondeo del calendario, no un efecto.
		if (Math.abs(shiftHours) < 0.05) continue;
		out.push({
			otId,
			shiftHours: Math.round(shiftHours * 10) / 10,
			becomesLate: (b.lateHours ?? -1) <= 0 && (a.lateHours ?? -1) > 0,
		});
	}
	return out.sort((x, y) => y.shiftHours - x.shiftHours);
}
