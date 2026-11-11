/**
 * La salida de papel, contra la base: qué se debe sacar y sacarlo.
 *
 * `planPaperIssue` responde a «esta OT entra a X con N unidades: ¿sale papel,
 * cuánto, y de qué lotes?». Lo usan el Tablero y la revisión del parte de
 * WhatsApp para pre-llenar, y moveOT para exigirlo. Una sola respuesta para
 * las tres, así que el formulario y la compuerta no discrepan.
 *
 * `issuePaper` lo saca: todos los lotes o ninguno (`emitir_papel`, migración
 * 20261111130000), cada uno por consumir_lote —saldo, reservas, certificado
 * FSSC— y al costo de su lote. Contra la OT DUEÑA del papel: en un grupo de
 * fragmentos, el padre.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import { deriveRoute, type RouteOT } from '@/lib/production-route';
import { colorCount, makeReadySheets, pressPasses } from '@/lib/ot-calculations';
import { otStatusLabel } from '@/lib/status-labels';
import type { OTColorMode } from '@/types/ot';
import {
	paperEntryStatus,
	pendingSheets,
	perSheet,
	quantityToSheets,
	sheetsToQuantity,
	type PaperItem,
} from '@/lib/paper-issue';

const OT_FIELDS =
	'id, ot_number, status, quantity, split_group_id, calc_sheets, calc_substrate_kg, calc_print_hours, calc_finish_hours, ' +
	'substrate_type, grammage_gsm, product_type, color_front, color_back, assigned_machine_id, die_id, die_code, ' +
	'finish_troquelado, finish_plegado, finish_pegado, finish_laminado, finish_barniz, finish_relieve, finish_perforado, ' +
	'finish_hot_stamping, finish_uv_localizado, finish_numeracion, route_steps';

const ITEM_FIELDS = 'id, name, unit, sheet_width_cm, sheet_height_cm, grammage_gsm, sheets_per_package, material_kind, is_certification_required';

type Row = Record<string, any>;

export interface PaperLot {
	id: string;
	lot_number: string;
	item_name: string;
	unit: string;
	/** En la unidad del ítem (kg, resmas, pliegos). */
	available: number;
	/** Lo mismo, en pliegos de este papel. `null` si el ítem no se puede convertir. */
	availableSheets: number | null;
	/** Unidad del ítem por pliego. */
	perSheet: number | null;
	/** Lo reservado de este lote para esta OT (en la unidad del ítem). */
	reservedForOT: number;
	/** Mismo gramaje y sustrato que la OT. */
	matchesSpec: boolean;
	certification_expires_on: string | null;
	/** El ítem exige certificado (FSSC): sin uno vigente, hace falta autorización escrita. */
	certRequired: boolean;
	blocked_reason: string | null;
}

export interface PaperPlan {
	/** Entrar a `toStatus` saca papel de bodega Y queda algo por sacar. */
	required: boolean;
	/** Dónde sale el papel en la ruta de esta OT; `null` si su ruta no usa papel. */
	entryStatus: string | null;
	entryLabel: string | null;
	/** La OT contra la que se carga: la misma, o el padre si es un fragmento. */
	ownerOtId: string;
	ownerOtNumber: string;
	calcSheets: number;
	issuedSheets: number;
	/** Pliegos sugeridos para esta entrada. */
	sheets: number;
	note: string;
	lots: PaperLot[];
}

export interface PaperIssueLine {
	lotId: string;
	sheets: number;
	overrideReason?: string | null;
}

const isPaper = (item: Row | null | undefined) =>
	item?.material_kind === 'papel' || (!item?.material_kind && !/^tinta/i.test(String(item?.name ?? '')));

async function loadOwner(ot: Row): Promise<{ owner: Row; groupUnits: number }> {
	if (!ot.split_group_id) return { owner: ot, groupUnits: Number(ot.quantity ?? 0) };
	const { data, error } = await supabaseAdmin.from('ots').select(OT_FIELDS).eq('split_group_id', ot.split_group_id);
	if (error) throw new Error(`No se pudo leer el grupo de la OT: ${error.message}`);
	const group = (data ?? []) as unknown as Row[];
	const base = String(ot.ot_number).split('-')[0];
	const owner = group.find((g) => g.ot_number === base) ?? ot;
	const groupUnits = group.reduce((s, g) => s + Number(g.quantity ?? 0), 0) || Number(ot.quantity ?? 0);
	return { owner, groupUnits };
}

/** Pliegos de papel que ya salieron para la OT dueña, netos de devoluciones. */
async function issuedSheetsFor(owner: Row): Promise<number> {
	const { data, error } = await supabaseAdmin
		.from('inventory_stock_transactions')
		.select(`tx_type, quantity, inventory_items(${ITEM_FIELDS})`)
		.eq('work_order_id', owner.id)
		.in('tx_type', ['consumption', 'return_to_stock']);
	if (error) throw new Error(`No se pudo leer el papel que ya salió: ${error.message}`);
	let sheets = 0;
	for (const tx of (data ?? []) as Row[]) {
		const item = tx.inventory_items as Row | null;
		if (!isPaper(item)) continue;
		const f = perSheet(item as PaperItem, { calcKg: owner.calc_substrate_kg, calcSheets: owner.calc_sheets });
		if (!f) continue;
		const s = quantityToSheets(Number(tx.quantity ?? 0), f);
		sheets += tx.tx_type === 'consumption' ? s : -s;
	}
	return Math.max(0, sheets);
}

async function paperLots(owner: Row): Promise<PaperLot[]> {
	const [lotsRes, resRes] = await Promise.all([
		supabaseAdmin
			.from('inventory_lots')
			.select(`id, lot_number, quantity_available, certification_expires_on, blocked_reason, received_date, created_at, inventory_items!inner(${ITEM_FIELDS})`)
			.gt('quantity_available', 0)
			.eq('inventory_items.material_kind', 'papel')
			.order('received_date', { ascending: true, nullsFirst: false })
			.limit(200),
		supabaseAdmin
			.from('inventory_reservations')
			.select('lot_id, quantity')
			.eq('ot_id', owner.id)
			.eq('status', 'activa')
			.gt('expires_at', new Date().toISOString()),
	]);
	const failed = lotsRes.error ?? resRes.error;
	if (failed) throw new Error(`No se pudieron leer los lotes de papel: ${failed.message}`);

	const reserved = new Map<string, number>();
	for (const r of resRes.data ?? []) reserved.set(r.lot_id, (reserved.get(r.lot_id) ?? 0) + Number(r.quantity ?? 0));

	const gsm = Number(owner.grammage_gsm ?? 0);
	const substrate = String(owner.substrate_type ?? '').slice(0, 5).toLowerCase();
	const lots = ((lotsRes.data ?? []) as Row[]).map((l): PaperLot => {
		const item = l.inventory_items as Row;
		const f = perSheet(item as PaperItem, { calcKg: owner.calc_substrate_kg, calcSheets: owner.calc_sheets });
		const available = Number(l.quantity_available ?? 0);
		return {
			id: l.id,
			lot_number: l.lot_number,
			item_name: item.name,
			unit: item.unit ?? 'unidades',
			available,
			// Hacia abajo: un pliego que no está entero en el lote no se puede sacar.
			availableSheets: f ? Math.floor(available / f + 1e-9) : null,
			perSheet: f,
			reservedForOT: reserved.get(l.id) ?? 0,
			matchesSpec:
				gsm > 0 && Number(item.grammage_gsm) === gsm && (!substrate || String(item.name).toLowerCase().includes(substrate)),
			certification_expires_on: l.certification_expires_on ?? null,
			certRequired: Boolean(item.is_certification_required),
			blocked_reason: l.blocked_reason ?? null,
		};
	});
	// Lo reservado para la OT primero (lo que Compras trajo para ella), después
	// el mismo papel de la ficha, después el resto; dentro de cada grupo, el más
	// viejo primero (ya vienen así).
	const rank = (l: PaperLot) => (l.reservedForOT > 0 ? 0 : l.matchesSpec ? 1 : 2);
	return lots.sort((a, b) => rank(a) - rank(b));
}

/**
 * ¿Entrar a `toStatus` con `movedUnits` saca papel? ¿Cuánto y de dónde?
 *
 * @param movedUnits las unidades que entran (un avance parcial mueve menos que la OT).
 */
export async function planPaperIssue(args: { otId: string; toStatus: string; movedUnits?: number | null }): Promise<PaperPlan> {
	const { data, error } = await supabaseAdmin.from('ots').select(OT_FIELDS).eq('id', args.otId).maybeSingle();
	if (error) throw new Error(`No se pudo leer la OT: ${error.message}`);
	if (!data) throw new Error('OT no encontrada');
	const ot = data as unknown as Row;

	const { data: machines, error: mErr } = await supabaseAdmin.from('machines').select('id, type');
	if (mErr) throw new Error(`No se pudieron leer las máquinas: ${mErr.message}`);
	const machineTypeById = new Map((machines ?? []).map((m) => [m.id, m.type as string]));

	const route = deriveRoute(ot as RouteOT, machineTypeById);
	const entryStatus = paperEntryStatus(route);
	const { owner, groupUnits } = await loadOwner(ot);

	const base: PaperPlan = {
		required: false,
		entryStatus,
		entryLabel: entryStatus ? otStatusLabel(entryStatus) : null,
		ownerOtId: owner.id,
		ownerOtNumber: owner.ot_number,
		calcSheets: Number(owner.calc_sheets ?? 0),
		issuedSheets: 0,
		sheets: 0,
		note: '',
		lots: [],
	};
	if (!entryStatus || args.toStatus !== entryStatus) return base;

	const calcSheets = Number(owner.calc_sheets ?? 0);
	const issuedSheets = await issuedSheetsFor(owner);
	const movedUnits = Number(args.movedUnits ?? ot.quantity ?? 0);
	const makeReady = makeReadySheets(
		pressPasses(colorCount((owner.color_front ?? 'sin_impresion') as OTColorMode) ?? 0, colorCount((owner.color_back ?? 'sin_impresion') as OTColorMode) ?? 0, 4),
		{ finish_troquelado: !!owner.finish_troquelado, finish_hot_stamping: !!owner.finish_hot_stamping },
	);
	const pending = calcSheets > 0
		? pendingSheets({ calcSheets, makeReadySheets: Math.min(makeReady, calcSheets), movedUnits, groupUnits, issuedSheets })
		: { sheets: 0, note: 'La OT no tiene pliegos calculados: indicá cuántos salen.' };

	return {
		...base,
		// Sin cálculo de pliegos igual se exige: el papel sale, y quien lo saca
		// dice cuánto. Con todo ya entregado, no.
		required: calcSheets > 0 ? pending.sheets > 0 : issuedSheets === 0,
		calcSheets,
		issuedSheets,
		sheets: pending.sheets,
		note: pending.note,
		lots: await paperLots(owner),
	};
}

export interface IssueResult {
	txIds: string[];
	summary: string;
}

/**
 * Saca el papel: todos los lotes o ninguno. Las cantidades llegan en pliegos
 * (lo que cuenta quien lo saca) y se convierten a la unidad de cada lote.
 */
export async function issuePaper(args: {
	ownerOtId: string;
	lines: PaperIssueLine[];
	actorId: string | null;
	stage: string;
}): Promise<IssueResult> {
	const lines = args.lines.filter((l) => l.sheets > 0);
	if (lines.length === 0) throw new Error('Falta el papel que sale: al menos un lote con pliegos.');

	const [{ data: owner, error: oErr }, { data: lots, error: lErr }] = await Promise.all([
		supabaseAdmin.from('ots').select('calc_substrate_kg, calc_sheets').eq('id', args.ownerOtId).maybeSingle(),
		supabaseAdmin.from('inventory_lots').select(`id, lot_number, quantity_available, inventory_items(${ITEM_FIELDS})`).in('id', lines.map((l) => l.lotId)),
	]);
	const failed = oErr ?? lErr;
	if (failed) throw new Error(`No se pudo preparar la salida de papel: ${failed.message}`);
	const lotById = new Map(((lots ?? []) as Row[]).map((l) => [l.id, l]));

	const payload = lines.map((l) => {
		const lot = lotById.get(l.lotId);
		if (!lot) throw new Error('Uno de los lotes elegidos no existe.');
		const item = lot.inventory_items as Row;
		if (!isPaper(item)) throw new Error(`El lote ${lot.lot_number} no es papel.`);
		const f = perSheet(item as PaperItem, { calcKg: owner?.calc_substrate_kg, calcSheets: owner?.calc_sheets });
		if (!f) {
			throw new Error(
				`El lote ${lot.lot_number} está en ${item.unit} y su ítem no tiene medidas de pliego ni gramaje: no se puede pasar de pliegos a ${item.unit}. Completá el ítem en Bodega.`,
			);
		}
		// Los últimos pliegos de un lote: el redondeo a kg puede pasarse por una
		// fracción de pliego del saldo. Menos de un pliego de diferencia es el lote
		// entero, no un faltante.
		const available = Number(lot.quantity_available ?? 0);
		let quantity = sheetsToQuantity(l.sheets, f);
		if (quantity > available && quantity - available < f) quantity = available;
		return { lot_id: l.lotId, quantity, override_reason: l.overrideReason ?? null };
	});

	const { data, error } = await supabaseAdmin.rpc('emitir_papel' as never, {
		p_ot_id: args.ownerOtId,
		p_lines: payload,
		p_by: args.actorId,
		p_stage: args.stage,
	} as never);
	if (error) throw new Error(error.message);

	const out = (data ?? []) as unknown as Row[];
	const summary = out
		.map((r) => `${Number(r.quantity).toLocaleString('es-CL')} ${r.unit} de ${r.material} (lote ${r.lot_number})`)
		.join(', ');
	return { txIds: out.map((r) => r.tx_id as string), summary };
}

/** El papel vuelve si la OT no pudo moverse después de sacarlo. */
export async function returnIssuedPaper(txIds: string[], actorId: string | null): Promise<string | null> {
	if (txIds.length === 0) return null;
	const { error } = await supabaseAdmin.rpc('devolver_salida_papel' as never, { p_tx_ids: txIds, p_by: actorId } as never);
	return error ? `El papel salió pero la OT no avanzó, y no se pudo devolver: ${error.message}. Devolvelo desde Bodega.` : null;
}
