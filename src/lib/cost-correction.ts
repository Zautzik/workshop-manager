/**
 * La corrección manual del costo real — la única puerta para escribir a mano
 * en el libro (`ot_cost_lines`, kind `actual`).
 *
 * Decisión del dueño (2026-11-27): la carga manual queda como CORRECCIÓN, no
 * como un segundo almacén. Hasta entonces el diálogo del Tablero escribía en
 * `ot_real_costs` y un disparador lo copiaba al libro: dos tablas para un dato,
 * y el análisis de costo de Rentabilidad leía sólo la vieja.
 *
 * Regla del dueño (2026-11-10): el costo se registra cuando se consume. Lo que
 * tiene dueño se corrige en su dueño:
 *   - papel / material → devolviendo o sacando del lote (al costo del lote);
 *   - máquina          → las horas de la pasada (stage-valuation la revaloriza);
 *   - mano de obra     → la pasada y el turno de Planta.
 * Lo que no tiene otro dueño —un tercerizado, una terminación externa, un
 * extra— entra acá: al libro, con motivo, marcado `source/ref_type =
 * 'correccion'` para que se distinga siempre de lo medido.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type LedgerCategory = 'material' | 'labor' | 'machine' | 'finishing' | 'outsourced' | 'overhead' | 'other';

/**
 * La categoría del diálogo (o de un parte) en el libro. La misma tabla que
 * `public.map_real_cost_category` en la base.
 */
export function ledgerCategory(category: string): LedgerCategory {
	switch (category) {
		case 'materiales':
		case 'papel':
		case 'tinta':
		case 'material':
			return 'material';
		case 'impresion':
		case 'guillotina':
		case 'machine':
			return 'machine';
		case 'mano_de_obra':
		case 'labor':
			return 'labor';
		case 'energia':
		case 'overhead':
			return 'overhead';
		case 'terminaciones':
		case 'finishing':
			return 'finishing';
		case 'tercerizado':
		case 'outsourced':
			return 'outsourced';
		default:
			return 'other';
	}
}

/** Lo que tiene dueño, y dónde se corrige. */
const CORRIGE_EN_SU_DUENO: Partial<Record<LedgerCategory, string>> = {
	material:
		'El papel y el material cuestan cuando salen del lote, a su costo. Para corregirlo, devolvé o sacá del lote en la salida de papel.',
	machine:
		'El tiempo de máquina sale de la pasada cerrada. Para corregirlo, corregí las horas de esa pasada: se revaloriza sola.',
	labor:
		'La mano de obra sale de la pasada y del turno de Planta. Para corregirla, corregí las horas de la pasada o la dotación del turno.',
};

export const CORRECTION_REF = 'correccion';

export interface CorrectionLine {
	category: string;
	description: string;
	quantity: number;
	unit: string;
	unitCost: number;
}

export type CorrectionResult = { ok: true; ids: string[] } | { ok: false; status: number; error: string };


/** La anulación de una corrección: un asiento espejo, nunca un DELETE. */
export const REVERSAL_SOURCE = 'anulacion';

type Fail = { ok: false; status: number; error: string };

/**
 * La OT tiene que existir y seguir abierta. Una OT `completed` ya cerró su
 * costo: corregirlo después movería un margen que alguien ya leyó.
 */
async function otAbierta(db: SupabaseClient, otId: string): Promise<Fail | null> {
	const { data, error } = await db.from('ots').select('id, status').eq('id', otId).maybeSingle();
	if (error) return { ok: false, status: 500, error: error.message };
	if (!data) return { ok: false, status: 404, error: 'No existe esa OT.' };
	if ((data as { status: string }).status === 'completed') {
		return { ok: false, status: 409, error: 'La OT está terminada: su costo ya cerró y no se corrige.' };
	}
	return null;
}

export async function recordCostCorrection(
	db: SupabaseClient,
	args: { otId: string; actorId: string | null; reason: string; lines: CorrectionLine[] },
): Promise<CorrectionResult> {
	const reason = args.reason.trim();
	if (reason.length < 3) return { ok: false, status: 400, error: 'Una corrección necesita su motivo: qué pasó y por qué se corrige.' };
	if (args.lines.length === 0) return { ok: false, status: 400, error: 'No hay líneas que corregir.' };

	const rows = [];
	for (const l of args.lines) {
		const category = ledgerCategory(l.category);
		const owner = CORRIGE_EN_SU_DUENO[category];
		if (owner) return { ok: false, status: 422, error: owner };
		if (!l.description.trim()) return { ok: false, status: 400, error: 'Cada línea necesita una descripción.' };
		if (!(l.quantity > 0)) return { ok: false, status: 400, error: `«${l.description.trim()}»: la cantidad tiene que ser mayor que cero.` };
		if (!(l.unitCost >= 0)) return { ok: false, status: 400, error: `«${l.description.trim()}»: el costo unitario no puede ser negativo.` };
		rows.push({
			ot_id: args.otId,
			kind: 'actual' as const,
			category,
			description: l.description.trim(),
			quantity: l.quantity,
			unit: l.unit || 'unit',
			unit_cost: l.unitCost,
			occurred_at: new Date().toISOString(),
			recorded_by: args.actorId,
			source: CORRECTION_REF,
			ref_type: CORRECTION_REF,
			notes: reason,
		});
	}

	const cerrada = await otAbierta(db, args.otId);
	if (cerrada) return cerrada;

	const { data, error } = await db.from('ot_cost_lines').insert(rows).select('id');
	if (error) return { ok: false, status: 500, error: error.message };
	return { ok: true, ids: ((data ?? []) as { id: string }[]).map((r) => r.id) };
}

/**
 * Anula una corrección con un asiento contrario (misma categoría, cantidad
 * negativa, mismo costo unitario): las dos líneas quedan, el neto es cero, y
 * el motivo de la anulación queda escrito. Sólo una corrección se anula —lo
 * medido se corrige en su dueño— y sólo una vez (índice único en la base, por
 * si dos personas lo intentan a la vez).
 */
export async function reverseCostCorrection(
	db: SupabaseClient,
	args: { otId: string; lineId: string; actorId: string | null; reason: string },
): Promise<{ ok: true; id: string } | Fail> {
	const reason = args.reason.trim();
	if (reason.length < 3) return { ok: false, status: 400, error: 'Anular una corrección también necesita su motivo.' };

	const cerrada = await otAbierta(db, args.otId);
	if (cerrada) return cerrada;

	const { data: orig, error: e1 } = await db
		.from('ot_cost_lines')
		.select('id, category, description, quantity, unit, unit_cost')
		.eq('id', args.lineId)
		.eq('ot_id', args.otId)
		.eq('kind', 'actual')
		.eq('source', CORRECTION_REF)
		.maybeSingle();
	if (e1) return { ok: false, status: 500, error: e1.message };
	if (!orig) return { ok: false, status: 404, error: 'No hay una corrección con ese id en esta OT.' };
	const o = orig as { id: string; category: LedgerCategory; description: string; quantity: number; unit: string; unit_cost: number };

	const { data, error } = await db
		.from('ot_cost_lines')
		.insert({
			ot_id: args.otId,
			kind: 'actual' as const,
			category: o.category,
			description: `Anula: ${o.description}`,
			quantity: -Number(o.quantity),
			unit: o.unit,
			unit_cost: Number(o.unit_cost),
			occurred_at: new Date().toISOString(),
			recorded_by: args.actorId,
			source: REVERSAL_SOURCE,
			ref_type: CORRECTION_REF,
			ref_id: o.id,
			notes: reason,
		})
		.select('id')
		.single();
	if (error) {
		if (error.code === '23505') return { ok: false, status: 409, error: 'Esa corrección ya está anulada.' };
		return { ok: false, status: 500, error: error.message };
	}
	return { ok: true, id: (data as { id: string }).id };
}
