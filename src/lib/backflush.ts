import { supabaseAdmin } from '@/integrations/supabase/server';
import { familia } from '@/lib/paper-substitution';

/**
 * Backflush: descontar el papel estándar de una OT sin que nadie escanee.
 *
 * `consumir_lote` (la misma función que usa /operaciones/escanear) exige un
 * lote puntual porque así es como se demuestra qué papel específico llevó el
 * trabajo -- la trazabilidad FSSC depende de eso. Backflush no inventa una
 * excepción a esa regla: elige el lote por el operario, con las mismas reglas
 * que un humano seguiría (mismo material, más viejo primero, certificado
 * vigente), y si no hay una elección INEQUÍVOCA, no adivina.
 *
 * A propósito, mucho más estricto que `groupedCandidates` (la sugerencia de
 * ventas): ahí ofrecer un gramaje ±25% es una mejora para el cliente que un
 * vendedor puede pitchear; acá sería consumir un papel distinto del que la OT
 * dice que lleva, sin que nadie lo haya decidido. Backflush exige gramaje
 * EXACTO y UN solo material candidato -- ambigüedad es motivo para no actuar,
 * no para elegir el primero.
 */

export interface BackflushResult {
	attempted: boolean;
	consumed: boolean;
	reason: string;
	quantity?: number;
	lotNumber?: string;
	itemName?: string;
}

const SKIP = (reason: string): BackflushResult => ({ attempted: false, consumed: false, reason });
const FAILED = (reason: string): BackflushResult => ({ attempted: true, consumed: false, reason });

/**
 * Intenta el backflush de una OT contra una máquina. Nunca lanza — un fallo
 * acá no debe deshacer ni bloquear el cierre de etapa que lo disparó, es
 * exactamente el mismo trato "mejor esfuerzo" que ya tiene ot_status_history.
 */
export async function tryBackflush(params: {
	otId: string;
	stage: string;
}): Promise<BackflushResult> {
	const { otId, stage } = params;

	const { data: ot, error: otErr } = await supabaseAdmin
		.from('ots')
		.select('id, ot_number, substrate_type, grammage_gsm, calc_sheets, assigned_machine_id')
		.eq('id', otId)
		.maybeSingle();
	if (otErr || !ot) return SKIP('OT no encontrada');
	if (!ot.assigned_machine_id) return SKIP('La OT no tiene máquina asignada');
	if (!ot.substrate_type || !ot.grammage_gsm) return SKIP('La ficha no dice sustrato o gramaje');
	if (!ot.calc_sheets || ot.calc_sheets <= 0) return SKIP('La OT no tiene pliegos calculados');

	const { data: machine, error: machineErr } = await supabaseAdmin
		.from('machines')
		.select('id, consumption_mode')
		.eq('id', ot.assigned_machine_id)
		.maybeSingle();
	if (machineErr) return FAILED('No se pudo consultar la máquina asignada');
	if (!machine || machine.consumption_mode !== 'backflush') return SKIP('La máquina no está en modo backflush');

	// Ya se consumió algo para esta OT (por esta misma función en una etapa
	// anterior, o a mano por /operaciones/escanear): no se descuenta dos veces
	// el mismo trabajo. La reconciliación de una diferencia real es un ajuste
	// manual, no un segundo backflush automático.
	const { count: yaConsumido } = await supabaseAdmin
		.from('inventory_stock_transactions')
		.select('id', { count: 'exact', head: true })
		.eq('work_order_id', otId)
		.eq('tx_type', 'consumption');
	if ((yaConsumido ?? 0) > 0) return SKIP('Esta OT ya tiene consumo registrado');

	// Candidatos: misma familia de papel, gramaje EXACTO (no la banda ±25/15%
	// que usa la sugerencia de ventas), con stock y sin retención.
	const { data: items, error: itemsErr } = await supabaseAdmin
		.from('inventory_items')
		.select('id, name')
		.eq('category', 'product_input')
		.eq('grammage_gsm', ot.grammage_gsm)
		.eq('is_active', true);
	if (itemsErr) return FAILED('No se pudo consultar el catálogo de insumos');

	const familiaBuscada = familia(ot.substrate_type);
	const candidatos = (items ?? []).filter((i) => familia(i.name) === familiaBuscada);

	if (candidatos.length === 0) return SKIP(`Sin un insumo exacto para ${ot.substrate_type} ${ot.grammage_gsm}g`);
	if (candidatos.length > 1) {
		return SKIP(
			`${candidatos.length} insumos distintos calzan con ${ot.substrate_type} ${ot.grammage_gsm}g — ambiguo, requiere elegir a mano`,
		);
	}
	const item = candidatos[0];

	const { data: lots, error: lotsErr } = await supabaseAdmin
		.from('inventory_lots')
		.select('id, lot_number, quantity_available, received_date, certification_expires_on')
		.eq('item_id', item.id)
		.gt('quantity_available', 0)
		.is('blocked_reason', null)
		.order('received_date', { ascending: true })
		.limit(1);
	if (lotsErr) return FAILED('No se pudo consultar los lotes disponibles');
	if (!lots || lots.length === 0) return SKIP(`Sin stock disponible de ${item.name}`);

	const lot = lots[0];
	const cantidad = Math.min(Number(ot.calc_sheets), Number(lot.quantity_available));

	// `p_by: null` y `p_override_reason: null` a propósito: nadie está ahí para
	// autorizar una excepción de certificado. Si el lote más viejo no tiene uno
	// vigente y el insumo lo exige, `consumir_lote` lo rechaza — correctamente:
	// backflush no tiene por qué poder saltarse una compuerta de calidad que un
	// humano tampoco puede saltarse sin motivo escrito.
	const { error: consumoErr } = await supabaseAdmin.rpc('consumir_lote' as never, {
		p_lot_id: lot.id,
		p_ot_id: otId,
		p_quantity: cantidad,
		p_by: null,
		p_stage: stage,
		p_override_reason: null,
	} as never);
	if (consumoErr) return FAILED(consumoErr.message);

	const shortfall = Number(ot.calc_sheets) - cantidad;
	return {
		attempted: true,
		consumed: true,
		reason:
			shortfall > 0
				? `Backflush parcial: el lote más viejo sólo tenía ${Math.round(cantidad)} de ${Math.round(Number(ot.calc_sheets))} pliegos. Completar a mano.`
				: 'Backflush completo',
		quantity: cantidad,
		lotNumber: lot.lot_number,
		itemName: item.name,
	};
}
