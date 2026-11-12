/**
 * El tiempo de máquina se vuelve costo — una sola implementación.
 *
 * Cada pasada cerrada (`ot_stage_reports.hours`) dice cuántas horas estuvo la
 * OT en una máquina. La migración 20260827120000 lo escribió como intención
 * —«multiplicadas por la tarifa de la máquina son el costo de tiempo que
 * faltaba»— y nadie hizo la multiplicación: el costo real de una OT no tenía
 * tiempo de prensa, y el margen de Rentabilidad salía inflado en justo la
 * partida más cara de una imprenta (auditoría 2026-11-05, C-2).
 *
 * Esto la hace. Por OT, de forma idempotente: recalcula las líneas de todas sus
 * pasadas a la tarifa de hoy y reemplaza las que había. Así da igual QUIÉN
 * cerró la pasada —el tablero, el avance parcial, el parte de WhatsApp, la
 * pantalla de pasadas abiertas— o si alguien corrigió las horas después:
 * quien escribe horas llama a esto y el libro queda igual que las pasadas.
 *
 * ── Dónde va ───────────────────────────────────────────────────────────────
 *
 * Directo a `ot_cost_lines` (`kind='actual'`, `category='machine'`,
 * `ref_type='stage_pass'`, `ref_id` = la pasada). No a `ot_real_costs`: esa
 * tabla se espeja al libro con un disparador (C-4), y sumar un escritor más al
 * espejo es agrandar justo lo que hay que achicar.
 *
 * ── A qué tarifa ───────────────────────────────────────────────────────────
 *
 * `stageMachineRate` (costing-resolver.ts): la misma con la que se cotiza.
 *
 * ── El único escritor de máquina real (2026-11-10) ────────────────────────
 *
 * Regla del dueño: el tiempo de máquina se registra cuando se CONSUME, y eso
 * es una pasada cerrada. La base rechaza cualquier otra línea de máquina real
 * (trg_actual_cost_only_when_consumed). Por eso la digital también se
 * valoriza acá: su consumo son clics —los pliegos de las unidades que movió la
 * pasada, más su merma— a la tarifa de clic con que se cotiza. Antes los
 * escribía el parte de WhatsApp, aparte de la pasada.
 *
 * ── Y también la mano de obra (2026-11-11) ────────────────────────────────
 *
 * Regla del dueño: la mano de obra real es la gente que Planta asignó a la
 * máquina, por las horas que la OT estuvo en su turno (labor-from-shifts.ts).
 * Sale de la misma pasada cerrada, así que el Tablero y «Aprobar e Integrar»
 * la cargan igual, y por el mismo único escritor. La base rechaza cualquier
 * otra línea de mano de obra real.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import { resolveCostOverrides, stageMachineRate, type CostSpec } from '@/lib/costing-resolver';
import { DEFAULT_COSTS } from '@/lib/ot-calculations';
import type { CostCenterItem } from '@/types/work-category';
import { passMachineCandidates, type MachineRow, type ScheduleRow } from '@/lib/stage-machine';
import {
	LABOR_LOOKBACK_DAYS,
	laborForPass,
	plantDate,
	type CrewAssignment,
	type RateRow,
	type ShiftDef,
} from '@/lib/labor-from-shifts';

export const STAGE_PASS_REF = 'stage_pass';

export interface ValuationResult {
	/** Pasadas valorizadas: con horas, o digitales cerradas (clics). */
	valued: number;
	/** Total de tiempo de máquina en el libro para la OT, CLP. */
	total: number;
	/** Alguna tarifa salió del defecto del motor y no del catálogo. */
	assumed: boolean;
	/** Total de mano de obra en el libro para la OT, CLP. */
	laborTotal: number;
	/** Horas de pasada que no cayeron en un turno con gente asignada en Planta. */
	laborUncoveredHours: number;
	/** Personas asignadas sin tarifa vigente: su línea queda en $0. */
	laborMissingRates: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 86_400_000;

interface PassForLabor {
	id: string;
	workflow_step: string;
	hours: number | null;
	machine_id: string | null;
	operator_employee_id?: string | null;
	created_at: string;
	recorded_by: string | null;
}

/**
 * Las líneas de mano de obra de las pasadas de una OT: quién tenía Planta en
 * la máquina, por las horas de la pasada que cayeron en su turno.
 */
async function laborRows(otId: string, passes: PassForLabor[]) {
	const timed = passes.filter((p) => Number(p.hours) > 0);
	if (timed.length === 0) return { rows: [], uncovered: 0, missingRates: 0 };

	// La máquina de cada pasada: la que guardó si es del tipo de la etapa; si no
	// (las viejas guardaban la prensa para todo), la agendada o las de ese tipo
	// (stage-machine.ts). Entre varias desempata la dotación, más abajo.
	const [machinesRes, scheduleRes] = await Promise.all([
		supabaseAdmin.from('machines').select('id, type, is_active'),
		supabaseAdmin.from('ot_machine_schedule').select('machine_id, plan_step, scheduled_start').eq('ot_id', otId),
	]);
	const failed0 = machinesRes.error ?? scheduleRes.error;
	if (failed0) throw new Error(`No se pudieron leer las máquinas de la OT: ${failed0.message}`);
	const candidatesByPass = new Map(
		timed.map((p) => [
			p.id,
			passMachineCandidates({
				workflowStep: p.workflow_step,
				assignedMachineId: p.machine_id,
				machines: (machinesRes.data ?? []) as MachineRow[],
				schedule: (scheduleRes.data ?? []) as ScheduleRow[],
			}),
		]),
	);

	const closes = timed.map((p) => Date.parse(p.created_at));
	const fromDate = plantDate(Math.min(...closes) - (LABOR_LOOKBACK_DAYS + 1) * DAY_MS);
	const toDate = plantDate(Math.max(...closes));
	const machineIds = [...new Set([...candidatesByPass.values()].flat())];
	if (machineIds.length === 0) {
		return { rows: [], uncovered: round2(timed.reduce((s, p) => s + Number(p.hours), 0)), missingRates: 0 };
	}

	const [assignRes, shiftsRes] = await Promise.all([
		supabaseAdmin
			.from('worker_assignments')
			.select('employee_id, machine_id, date, shift_id')
			.in('machine_id', machineIds)
			.gte('date', fromDate)
			.lte('date', toDate),
		supabaseAdmin.from('shifts').select('id, name, start_time, end_time, break_start, break_minutes'),
	]);
	const failed = assignRes.error ?? shiftsRes.error;
	if (failed) throw new Error(`No se pudo leer la dotación de Planta: ${failed.message}`);

	const assignments = (assignRes.data ?? []).filter((a) => a.employee_id && a.shift_id) as Array<
		CrewAssignment & { machine_id: string }
	>;
	const employeeIds = [...new Set(assignments.map((a) => a.employee_id))];
	const [ratesRes, peopleRes] = employeeIds.length
		? await Promise.all([
				supabaseAdmin
					.from('compensation_rates')
					.select('employee_id, hourly_rate, effective_from, effective_to')
					.in('employee_id', employeeIds),
				supabaseAdmin.from('employees').select('id, full_name').in('id', employeeIds),
			])
		: [{ data: [], error: null }, { data: [], error: null }];
	const failed2 = ratesRes.error ?? peopleRes.error;
	if (failed2) throw new Error(`No se pudieron leer las tarifas de Planta: ${failed2.message}`);

	const shifts = new Map((shiftsRes.data ?? []).map((s) => [s.id, s as ShiftDef]));
	const rates = (ratesRes.data ?? []) as RateRow[];
	const nameById = new Map((peopleRes.data ?? []).map((p) => [p.id, p.full_name as string]));

	const rows = [];
	let uncovered = 0;
	let missingRates = 0;
	for (const p of timed) {
		const forMachine = (machineId: string) =>
			laborForPass({
				closedAtMs: Date.parse(p.created_at),
				hours: Number(p.hours),
				assignments: assignments.filter((a) => a.machine_id === machineId),
				shifts,
				rates,
			});
		// Varias candidatas (tres guillotinas): vale la única que tenía gente en
		// esas horas. Si ninguna o más de una, no se adivina quién estaba.
		let staffed = (candidatesByPass.get(p.id) ?? []).map(forMachine).filter((x) => x.lines.length > 0);
		// Y si el operario de la pasada es conocido (el que mandó el parte), su
		// máquina es la que tenía asignado a él.
		if (staffed.length > 1 && p.operator_employee_id) {
			const mine = staffed.filter((x) => x.lines.some((l) => l.employee_id === p.operator_employee_id));
			if (mine.length === 1) staffed = mine;
		}
		// Y si una sola tuvo gente durante toda la pasada, es esa: la OT no pudo
		// estar en una guillotina vacía. Una pasada que cruza de Mañana (dos
		// guillotinas con gente) a Tarde (sólo la #1) estuvo en la #1. Empate
		// real = no se adivina.
		if (staffed.length > 1) {
			const best = Math.min(...staffed.map((x) => x.uncoveredHours));
			let top = staffed.filter((x) => x.uncoveredHours === best);
			// Cubrir no basta: en una máquina con menos turnos las horas se
			// deslizan hacia atrás a un turno anterior. Gana la que tuvo gente
			// pegada al cierre (la que menos tuvo que retroceder).
			if (top.length > 1) {
				const latest = Math.max(...top.map((x) => x.placedFromMs ?? -Infinity));
				top = top.filter((x) => (x.placedFromMs ?? -Infinity) === latest);
			}
			if (top.length === 1) staffed = top;
		}
		if (staffed.length !== 1) {
			uncovered += Number(p.hours);
			continue;
		}
		const r = staffed[0];
		uncovered += r.uncoveredHours;
		for (const l of r.lines) {
			if (l.rate == null) missingRates++;
			const who = nameById.get(l.employee_id) ?? 'Operario';
			const shiftLabel = /^turno\b/i.test(l.shift_name) ? l.shift_name : `turno ${l.shift_name}`;
			rows.push({
				ot_id: otId,
				kind: 'actual' as const,
				category: 'labor' as const,
				source: STAGE_PASS_REF,
				ref_type: STAGE_PASS_REF,
				ref_id: p.id,
				description: `Mano de obra — ${who} (${l.hours} h, ${shiftLabel} ${l.date}${l.rate == null ? ', sin tarifa en Planta' : ''})`,
				quantity: l.hours,
				unit: 'hrs',
				unit_cost: l.rate ?? 0,
				occurred_at: p.created_at,
				recorded_by: p.recorded_by,
			});
		}
	}
	return { rows, uncovered: round2(uncovered), missingRates };
}

/**
 * Las pasadas de un fragmento cuelgan del PADRE (moveOT las escribe contra la
 * OT que estuvo en la máquina), así que se valoriza la OT que se pasa, sin
 * buscar el grupo.
 */
export async function valueStagePasses(otId: string): Promise<ValuationResult> {
	const [otRes, passesRes, catalogRes, oldRes] = await Promise.all([
		supabaseAdmin
			.from('ots')
			.select('id, color_front, color_back, substrate_type, grammage_gsm, quantity, calc_sheets, split_group_id')
			.eq('id', otId)
			.maybeSingle(),
		supabaseAdmin
			.from('ot_stage_reports')
			.select('id, workflow_step, to_status, hours, units_moved, merma_sheets, machine_id, operator_employee_id, recorded_by, created_at')
			.eq('ot_id', otId),
		supabaseAdmin.from('cost_catalog').select('id, catalog_key, name, category, unit, unit_cost, is_active'),
		supabaseAdmin.from('ot_cost_lines').select('id').eq('ot_id', otId).eq('ref_type', STAGE_PASS_REF),
	]);
	// Valorizar con datos a medias reemplazaría líneas buenas por menos líneas:
	// cualquier lectura fallida corta antes de tocar el libro.
	const failed = otRes.error ?? passesRes.error ?? catalogRes.error ?? oldRes.error;
	if (failed) throw new Error(`No se pudo valorizar el tiempo de máquina: ${failed.message}`);
	if (!otRes.data) return { valued: 0, total: 0, assumed: false, laborTotal: 0, laborUncoveredHours: 0, laborMissingRates: 0 };

	const ot = otRes.data;
	const spec: CostSpec = {
		color_front: ot.color_front ?? 'sin_impresion',
		color_back: ot.color_back ?? 'sin_impresion',
		substrate_type: ot.substrate_type ?? '',
		grammage_gsm: Number(ot.grammage_gsm ?? 0),
	};
	const catalog = (catalogRes.data ?? []) as unknown as CostCenterItem[];

	// Unidades por pliego del trabajo entero: calc_sheets se copia a los
	// fragmentos, así que se divide por las unidades del grupo, no de esta OT.
	let groupUnits = Number(ot.quantity ?? 0);
	if (ot.split_group_id) {
		const { data: group, error } = await supabaseAdmin.from('ots').select('quantity').eq('split_group_id', ot.split_group_id);
		if (error) throw new Error(`No se pudo valorizar el tiempo de máquina: ${error.message}`);
		groupUnits = (group ?? []).reduce((s, g) => s + Number(g.quantity ?? 0), 0) || groupUnits;
	}
	const sheets = Number(ot.calc_sheets ?? 0);
	const unitsPerSheet = sheets > 0 && groupUnits > 0 ? groupUnits / sheets : null;
	const clickQuoted = resolveCostOverrides(catalog, spec).digital_click;
	const clickRate = clickQuoted ?? DEFAULT_COSTS.digital_click;

	let assumed = false;
	const rows = [];
	for (const p of passesRes.data ?? []) {
		if (p.workflow_step === 'digital_printing') {
			// Cerrada = ya dijo adónde fue la OT (o cuánto tardó).
			if (p.to_status == null && p.hours == null) continue;
			const printed = p.units_moved && unitsPerSheet ? Math.ceil(p.units_moved / unitsPerSheet) : sheets;
			const clicks = printed + Number(p.merma_sheets ?? 0);
			if (!(clicks > 0) || !(clickRate > 0)) continue;
			if (clickQuoted == null) assumed = true;
			rows.push({
				ot_id: otId,
				kind: 'actual' as const,
				category: 'machine' as const,
				source: STAGE_PASS_REF,
				ref_type: STAGE_PASS_REF,
				ref_id: p.id,
				description: `Impresión digital — ${clicks} clics${clickQuoted == null ? ', tarifa supuesta' : ''}`,
				quantity: clicks,
				unit: 'click',
				unit_cost: clickRate,
				occurred_at: p.created_at,
				recorded_by: p.recorded_by,
			});
			continue;
		}
		const hours = Number(p.hours);
		if (!(hours > 0)) continue;
		const r = stageMachineRate(p.workflow_step, spec, catalog, DEFAULT_COSTS);
		if (!r) continue;
		if (r.source === 'supuesto') assumed = true;
		rows.push({
			ot_id: otId,
			kind: 'actual' as const,
			category: 'machine' as const,
			source: STAGE_PASS_REF,
			ref_type: STAGE_PASS_REF,
			ref_id: p.id,
			description: `Tiempo de máquina — ${r.label} (${round2(hours)} h${r.source === 'supuesto' ? ', tarifa supuesta' : ''})`,
			quantity: round2(hours),
			unit: 'hrs',
			unit_cost: r.rate,
			occurred_at: p.created_at,
			recorded_by: p.recorded_by,
		});
	}

	const machineTotal = Math.round(rows.reduce((s, r) => s + r.quantity * r.unit_cost, 0));
	const valued = rows.length;
	const labor = await laborRows(otId, (passesRes.data ?? []) as PassForLabor[]);
	const allRows = [...rows, ...labor.rows];

	// Insertar primero, borrar después: entre las dos llamadas el libro puede
	// tener las dos versiones un instante, nunca ninguna. Las líneas viejas de
	// la pasada (máquina y mano de obra) se reemplazan juntas.
	if (allRows.length > 0) {
		const { error } = await supabaseAdmin.from('ot_cost_lines').insert(allRows);
		if (error) throw new Error(`No se pudo escribir el tiempo de máquina: ${error.message}`);
	}
	const oldIds = (oldRes.data ?? []).map((r) => r.id);
	if (oldIds.length > 0) {
		const { error } = await supabaseAdmin.from('ot_cost_lines').delete().in('id', oldIds);
		if (error) throw new Error(`Se escribió el tiempo de máquina nuevo pero no se borró el anterior: ${error.message}`);
	}

	return {
		valued,
		total: machineTotal,
		assumed,
		laborTotal: Math.round(labor.rows.reduce((s, r) => s + r.quantity * r.unit_cost, 0)),
		laborUncoveredHours: labor.uncovered,
		laborMissingRates: labor.missingRates,
	};
}

/**
 * Para quien acaba de escribir horas: valoriza y, si falla, lo devuelve como
 * aviso en vez de tumbar la operación que ya se hizo (la pasada quedó escrita;
 * volver a cerrar o corregir la recalcula).
 */
export async function valueStagePassesSafely(otId: string): Promise<string | null> {
	try {
		await valueStagePasses(otId);
		return null;
	} catch (err) {
		return err instanceof Error ? err.message : 'No se pudo valorizar el tiempo de máquina.';
	}
}
