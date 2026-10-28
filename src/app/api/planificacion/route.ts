import { NextResponse } from 'next/server';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll } from '@/lib/fetch-all';
import { measureAjuste, plantDate, type AjusteAssignment, type AjusteReport } from '@/lib/ajuste';
import { definitionFor, type ShiftDef, type ShiftModel, type ShiftPattern } from '@/lib/machine-calendar';
import { buildStageHistory, type StageReportRow } from '@/lib/stage-history';
import type { RouteOT } from '@/lib/production-route';

export const dynamic = 'force-dynamic';

/**
 * GET /api/planificacion
 *
 * Todo lo que el Cronograma necesita para armar el programa de producción, en
 * una sola respuesta. El programa en sí NO se calcula acá: lo arma el navegador
 * con `buildSchedule` (src/lib/production-scheduler.ts), porque es ahí donde se
 * arrastra un bloque o se simula un atraso, y hacer un viaje al servidor por
 * cada "¿y si…?" haría inútil la simulación.
 *
 * Lo que sí se calcula acá es la calibración del historial, porque necesita
 * todas las declaraciones de horas del taller y las OT ya cerradas — datos que
 * el navegador no tiene por qué bajar.
 *
 * Las OT activas se traen todas (`fetchAll`), no las primeras 200 como
 * `useOTs`: un programa que deja OTs afuera en silencio dice que hay capacidad
 * donde no la hay.
 */

const ROUTE_FIELDS = [
	'id',
	'status',
	'quantity',
	'product_type',
	'color_front',
	'color_back',
	'calc_sheets',
	'calc_print_hours',
	'calc_finish_hours',
	'assigned_machine_id',
	'die_id',
	'die_code',
	'flag_paper_arrived',
	'finish_troquelado',
	'finish_plegado',
	'finish_pegado',
	'finish_laminado',
	'finish_barniz',
	'finish_relieve',
	'finish_perforado',
	'finish_hot_stamping',
	'finish_uv_localizado',
	'finish_numeracion',
].join(', ');

const OT_FIELDS = `${ROUTE_FIELDS}, ot_number, client_name, product_name, deadline, priority_level, created_at`;

const CHUNK = 150;

function chunks<T>(list: T[], size = CHUNK): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
	return out;
}

/** Días de dotación que se traen hacia adelante: lo que cubre la vista más larga. */
const ROSTER_DAYS_AHEAD = 21;

/**
 * Los turnos de Planta para el Cronograma: definiciones vigentes, patrón de
 * cada máquina y dotación de los próximos días (`machine-calendar.ts`).
 *
 * `null` si el modelo todavía no existe (antes de la migración 20261027140000:
 * sin `shifts.code` ni `machine_shift_patterns`). El Cronograma sigue andando
 * con el supuesto por tipo en vez de caerse.
 */
async function loadShiftModel(today: string, machineTypes: Map<string, string>): Promise<ShiftModel | null> {
	const { data: shiftRows, error: shiftErr } = await supabaseAdmin.from('shifts').select('*');
	if (shiftErr) throw new Error(shiftErr.message);
	const shifts = ((shiftRows ?? []) as any[]).filter((s) => s.code && !s.archived_at) as ShiftDef[];
	if (shifts.length === 0) return null;

	const { data: patternRows, error: patternErr } = await (supabaseAdmin as any)
		.from('machine_shift_patterns')
		.select('machine_id, shift_id, weekdays');
	if (patternErr) {
		console.warn('Sin patrones de turno (¿falta la migración?):', patternErr.message);
		return null;
	}

	const until = new Date(`${today}T12:00:00Z`);
	until.setUTCDate(until.getUTCDate() + ROSTER_DAYS_AHEAD);
	const yesterday = new Date(`${today}T12:00:00Z`);
	yesterday.setUTCDate(yesterday.getUTCDate() - 1);
	const rowById = new Map(((shiftRows ?? []) as any[] as ShiftDef[]).map((s) => [s.id, s]));
	const { rows: assignments } = await fetchAll<{ employee_id: string; machine_id: string; shift_id: string; date: string }>(
		(desde, hasta) =>
			supabaseAdmin
				.from('worker_assignments')
				.select('employee_id, machine_id, shift_id, date')
				.gte('date', yesterday.toISOString().slice(0, 10))
				.lte('date', until.toISOString().slice(0, 10))
				.range(desde, hasta) as any,
	);
	// Una dotación cargada antes de la migración apunta a una fila archivada:
	// se lee como la definición equivalente (`definitionFor`), no se descarta.
	const relevant = assignments.flatMap((a) => {
		if (!machineTypes.has(a.machine_id)) return [];
		const def = definitionFor(rowById.get(a.shift_id), shifts, machineTypes.get(a.machine_id));
		return def ? [{ ...a, shift_id: def.id }] : [];
	});
	const names = new Map<string, string>();
	for (const chunk of chunks([...new Set(relevant.map((a) => a.employee_id))])) {
		const { data, error } = await supabaseAdmin.from('employees').select('id, full_name').in('id', chunk);
		if (error) throw new Error(error.message);
		for (const e of data ?? []) names.set(e.id, e.full_name);
	}

	return {
		shifts,
		patterns: (patternRows ?? []) as ShiftPattern[],
		roster: relevant.map((a) => ({
			machine_id: a.machine_id,
			shift_id: a.shift_id,
			date: a.date,
			employee_name: names.get(a.employee_id) ?? 'Operario sin nombre',
		})),
	};
}

export async function GET() {
	const auth = await requireAuth(['supervisor', 'admin', 'manager']);
	if (isAuthError(auth)) return auth;

	try {
		// `*` y no una lista en las tres tablas que ganan `ajuste_minutes` con la
		// migración 20261027130000: nombrar una columna que todavía no existe
		// tumbaría el programa entero. Los precios y costos no salen de acá: se
		// eligen campos antes de responder.
		const [otsRes, machinesRes, reportsRes] = await Promise.all([
			fetchAll<any>((desde, hasta) =>
				supabaseAdmin.from('ots').select('*').neq('status', 'completed').order('id').range(desde, hasta) as any,
			),
			supabaseAdmin.from('machines').select('*').eq('is_active', true).order('name'),
			fetchAll<StageReportRow & { ajuste_minutes?: number | null; created_at: string }>((desde, hasta) =>
				supabaseAdmin.from('ot_stage_reports').select('*').order('id').range(desde, hasta) as any,
			),
		]);
		if (machinesRes.error) throw new Error(machinesRes.error.message);

		const ots = otsRes.rows.map((o: any) =>
			Object.fromEntries([...OT_FIELDS.split(', '), 'ajuste_minutes'].map((k) => [k, o[k] ?? null])),
		) as any[];
		const activeIds = ots.map((o) => o.id as string);

		// Bloques fijados: sólo los que tienen horario completo.
		const pins: any[] = [];
		for (const ids of chunks(activeIds)) {
			const { data, error } = await supabaseAdmin
				.from('ot_machine_schedule')
				.select('*')
				.in('ot_id', ids)
				.not('scheduled_start', 'is', null)
				.not('scheduled_end', 'is', null);
			if (error) throw new Error(error.message);
			pins.push(...(data ?? []));
		}

		// La calibración compara cada OT reportada contra su propio presupuesto,
		// así que necesita la especificación también de las OT ya cerradas.
		const reports = reportsRes.rows;
		const specById = new Map<string, RouteOT>(ots.map((o) => [o.id, o]));
		const missing = [...new Set(reports.map((r) => r.ot_id))].filter((id) => !specById.has(id));
		for (const ids of chunks(missing)) {
			const { data, error } = await supabaseAdmin.from('ots').select(ROUTE_FIELDS).in('id', ids);
			if (error) throw new Error(error.message);
			for (const o of (data ?? []) as unknown as RouteOT[]) specById.set(o.id, o);
		}

		// El ajuste medido: lo declarado al cerrar offset, atribuido al operario
		// con `worker_assignments`. Y quién está asignado a cada prensa en los
		// próximos días, para que el bloque diga quién va a ajustar.
		const presses = (machinesRes.data ?? []).filter((m: any) => m.type === 'offset_printer').map((m: any) => m.id as string);
		const ajusteReports = reports.filter((r) => r.ajuste_minutes && r.machine_id && presses.includes(r.machine_id));
		const today = plantDate(new Date().toISOString());
		const since = ajusteReports.reduce((min, r) => (plantDate(r.created_at) < min ? plantDate(r.created_at) : min), today);
		const assignments: AjusteAssignment[] =
			presses.length === 0
				? []
				: (
						await fetchAll<AjusteAssignment>((desde, hasta) =>
							supabaseAdmin
								.from('worker_assignments')
								.select('employee_id, machine_id, date, ot_id')
								.in('machine_id', presses)
								.gte('date', since)
								.order('date')
								.range(desde, hasta) as any,
						)
					).rows;
		const employeeIds = [
			...new Set([
				...assignments.map((a) => a.employee_id),
				...ajusteReports.map((r: any) => r.operator_employee_id as string | null).filter((x): x is string => !!x),
			]),
		];
		const names = new Map<string, string>();
		for (const ids of chunks(employeeIds)) {
			const { data, error } = await supabaseAdmin.from('employees').select('id, full_name').in('id', ids);
			if (error) throw new Error(error.message);
			for (const e of data ?? []) names.set(e.id, e.full_name);
		}
		const ajusteByMachine = measureAjuste(ajusteReports as AjusteReport[], assignments, names);
		const upcomingOperators = assignments
			.filter((a) => a.date >= today)
			.map((a) => ({ machine_id: a.machine_id, date: a.date, name: names.get(a.employee_id) ?? 'Operario sin nombre' }));

		const shiftModel = await loadShiftModel(
			today,
			new Map((machinesRes.data ?? []).map((m: any) => [m.id as string, m.type as string])),
		);

		const machines = (machinesRes.data ?? []).map((m: any) => ({
			id: m.id as string,
			name: m.name as string,
			type: m.type as string,
			status: m.status as string,
			max_workers: m.max_workers ?? null,
			colors: m.colors ?? null,
			ajuste_minutes: m.ajuste_minutes ?? null,
			ajuste_measured: ajusteByMachine[m.id]?.measured ?? null,
			ajuste_by_operator: ajusteByMachine[m.id]?.byOperator ?? [],
		}));
		const machineTypeById = new Map(machines.map((m) => [m.id, m.type as string]));
		const history = buildStageHistory(reports, specById, machineTypeById);

		const active = new Set(activeIds);
		return NextResponse.json({
			generatedAt: new Date().toISOString(),
			ots,
			machines,
			pins: pins.map((p) => ({
				slotId: p.id,
				otId: p.ot_id,
				machineId: p.machine_id,
				planStep: p.plan_step ?? null,
				start: p.scheduled_start,
				end: p.scheduled_end,
			})),
			history,
			upcomingOperators,
			shiftModel,
			reports: reports.filter((r) => active.has(r.ot_id)).map(({ ot_id, workflow_step, hours }) => ({ ot_id, workflow_step, hours })),
			truncated: otsRes.truncated || reportsRes.truncated,
		});
	} catch (error) {
		console.error('Error building planificación:', error);
		return NextResponse.json({ error: 'No se pudo armar el programa de producción' }, { status: 500 });
	}
}
