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
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import { resolveCostOverrides, stageMachineRate, type CostSpec } from '@/lib/costing-resolver';
import { DEFAULT_COSTS } from '@/lib/ot-calculations';
import type { CostCenterItem } from '@/types/work-category';

export const STAGE_PASS_REF = 'stage_pass';

export interface ValuationResult {
	/** Pasadas valorizadas: con horas, o digitales cerradas (clics). */
	valued: number;
	/** Total de tiempo de máquina en el libro para la OT, CLP. */
	total: number;
	/** Alguna tarifa salió del defecto del motor y no del catálogo. */
	assumed: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

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
			.select('id, workflow_step, to_status, hours, units_moved, merma_sheets, recorded_by, created_at')
			.eq('ot_id', otId),
		supabaseAdmin.from('cost_catalog').select('id, catalog_key, name, category, unit, unit_cost, is_active'),
		supabaseAdmin.from('ot_cost_lines').select('id').eq('ot_id', otId).eq('ref_type', STAGE_PASS_REF),
	]);
	// Valorizar con datos a medias reemplazaría líneas buenas por menos líneas:
	// cualquier lectura fallida corta antes de tocar el libro.
	const failed = otRes.error ?? passesRes.error ?? catalogRes.error ?? oldRes.error;
	if (failed) throw new Error(`No se pudo valorizar el tiempo de máquina: ${failed.message}`);
	if (!otRes.data) return { valued: 0, total: 0, assumed: false };

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

	// Insertar primero, borrar después: entre las dos llamadas el libro puede
	// tener las dos versiones un instante, nunca ninguna.
	if (rows.length > 0) {
		const { error } = await supabaseAdmin.from('ot_cost_lines').insert(rows);
		if (error) throw new Error(`No se pudo escribir el tiempo de máquina: ${error.message}`);
	}
	const oldIds = (oldRes.data ?? []).map((r) => r.id);
	if (oldIds.length > 0) {
		const { error } = await supabaseAdmin.from('ot_cost_lines').delete().in('id', oldIds);
		if (error) throw new Error(`Se escribió el tiempo de máquina nuevo pero no se borró el anterior: ${error.message}`);
	}

	return { valued: rows.length, total: Math.round(rows.reduce((s, r) => s + r.quantity * r.unit_cost, 0)), assumed };
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
