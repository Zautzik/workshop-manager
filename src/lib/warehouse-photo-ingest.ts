/**
 * Bodega manda una foto y el papel queda descontado.
 *
 * El recorrido entero, sin una tecla: se le saca una foto a la etiqueta del
 * pallet, se manda por WhatsApp, y del otro lado el lote sale de inventario
 * contra la OT que lo estaba esperando — con el certificado y la retención
 * verificados igual que si alguien lo hubiera escaneado en la pantalla.
 *
 * ── Por qué pasa por `consumir_lote` y no escribe la transacción ────────────
 *
 * Porque `consumir_lote` es donde viven las verificaciones que hacen que esto
 * sea trazabilidad y no un registro: lote retenido, saldo real, papel
 * comprometido con otra orden, certificado vencido. El router de capturas
 * insertaba movimientos de inventario por su cuenta y se saltaba las cuatro —
 * una foto que entrara por ahí sería más rápida y valdría menos que nada.
 *
 * La foto no relaja ninguna regla. Sólo reemplaza el teclado.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import { decodeLotQR } from '@/lib/traceability';
import { decodeWarehouseQR } from '@/lib/warehouse-qr';
import { decodeQRFromImage } from '@/lib/qr-from-photo';
import { fetchInboundMedia, type MediaEntrante } from '@/lib/whatsapp-media';
import {
	replyForResolution,
	resolveWarehousePhoto,
	type OTEsperando,
	type Requisito,
	type Reserva,
} from '@/lib/warehouse-photo';
import { checkRateLimit, retryAfterSeconds } from '@/lib/rate-limiter';
import logger from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';

export interface FotoEntrante extends MediaEntrante {
	from: string;
	profile_name?: string | null;
	timestamp?: string | null;
}

export interface ResultadoFoto {
	status: number;
	payload: Record<string, unknown>;
	headers?: Record<string, string>;
}

/** Respuesta corta: la lee alguien de pie, con una mano ocupada. */
const responder = (
	status: number,
	message: string,
	extra: Record<string, unknown> = {},
): ResultadoFoto => ({ status, payload: { status: status === 200 ? 'ok' : 'error', message, ...extra } });

/**
 * De lo que dice el código al lote físico.
 *
 * Conviven dos formatos de etiqueta y los dos son legítimos: `WH:LOT:<uuid>` es
 * la del pallet, que es la que importa acá; `WH:<ACCIÓN>:<item>` es la del
 * estante, que nombra un MATERIAL y no una partida. La segunda sólo sirve si el
 * material tiene un único lote con saldo — si tiene tres, elegir uno sería
 * inventar la trazabilidad en vez de registrarla.
 */
async function lotFromCode(code: string): Promise<
	{ lotId: string; otNumberFromLabel: string | null } | { problem: string }
> {
	const lote = decodeLotQR(code);
	if (lote.ok && lote.lotId) {
		return { lotId: lote.lotId, otNumberFromLabel: null };
	}

	const wh = decodeWarehouseQR(code);
	if (!wh.isWarehouseQR || !wh.itemId) {
		return { problem: lote.problem ?? 'Ese código no es una etiqueta del taller.' };
	}

	// `extra` puede ser un lote concreto o un número de OT, según cómo se imprimió.
	const extraEsLote = !!wh.extra && /^[0-9a-f-]{36}$/i.test(wh.extra);
	if (extraEsLote) {
		return { lotId: wh.extra!, otNumberFromLabel: null };
	}

	const { data: lotes } = await supabaseAdmin
		.from('inventory_lots')
		.select('id, lot_number')
		.eq('item_id', wh.itemId)
		.gt('quantity_available', 0)
		.limit(3);

	if (!lotes || lotes.length === 0) {
		return { problem: 'Ese material no tiene ninguna partida con saldo en bodega.' };
	}
	if (lotes.length > 1) {
		return {
			problem:
				'Esa etiqueta es del material, no del pallet, y hay varias partidas con saldo. ' +
				'Sacale la foto a la etiqueta del pallet.',
		};
	}
	return { lotId: lotes[0].id, otNumberFromLabel: wh.extra ?? null };
}

/**
 * Procesar una foto de bodega, de punta a punta.
 *
 * Nunca lanza y nunca devuelve un 5xx por un problema del contenido: del otro
 * lado hay un webhook de Meta, y un error de servidor le hace reintentar el
 * sobre entero — reprocesando fotos que ya salieron bien.
 */
export async function processWarehousePhoto(input: FotoEntrante): Promise<ResultadoFoto> {
	const rl = checkRateLimit(`whatsapp-warehouse-photo:${input.from}`, 20, 60_000);
	if (!rl.ok) {
		return {
			status: 429,
			payload: { error: 'Rate limit exceeded' },
			headers: { 'Retry-After': String(retryAfterSeconds(rl)) },
		};
	}

	const media = await fetchInboundMedia(input);
	if (!media.ok || !media.bytes) {
		return responder(200, media.problem ?? 'No se pudo leer la foto.');
	}

	const leido = decodeQRFromImage(media.bytes, media.mime);
	if (!leido.ok || !leido.value) {
		return responder(200, leido.problem ?? 'No se ve el código en la foto.');
	}

	const resuelto = await lotFromCode(leido.value);
	if ('problem' in resuelto) {
		return responder(200, resuelto.problem, { scanned_value: leido.value });
	}

	// ── El lote, y todo lo que ya se sabe sobre para quién es ────────────────
	const { data: lote } = await supabaseAdmin
		.from('inventory_lots')
		.select('id, lot_number, quantity_available, blocked_reason')
		.eq('id', resuelto.lotId)
		.maybeSingle();

	if (!lote) {
		return responder(200, 'Ese lote no existe en el sistema. Avisá a bodega.', {
			scanned_value: leido.value,
		});
	}
	if (lote.blocked_reason) {
		return responder(200, `El lote ${lote.lot_number} está retenido: ${lote.blocked_reason}.`);
	}

	const [reservasQ, requisitosQ, esperandoQ] = await Promise.all([
		supabaseAdmin
			.from('inventory_reservations')
			.select('ot_id, quantity, ots(ot_number)')
			.eq('lot_id', lote.id)
			.eq('status', 'activa')
			.gt('expires_at', new Date().toISOString()),
		supabaseAdmin
			.from('ot_requirements')
			.select('ot_id, quantity, status, ots(ot_number)')
			.eq('lot_id', lote.id),
		supabaseAdmin
			.from('ots')
			.select('id, ot_number, calc_sheets')
			.eq('status', 'in_storage')
			.order('priority', { ascending: false })
			.limit(30),
	]);

	const numero = (row: { ots?: { ot_number?: string | null } | null }) =>
		row.ots?.ot_number ?? null;

	const resolucion = resolveWarehousePhoto({
		lotId: lote.id,
		lotNumber: lote.lot_number,
		available: Number(lote.quantity_available ?? 0) || null,
		otNumberFromLabel: resuelto.otNumberFromLabel,
		reservas: ((reservasQ.data ?? []) as unknown as Array<Reserva & { ots?: { ot_number?: string } }>)
			.map((r) => ({ ot_id: r.ot_id, ot_number: numero(r), quantity: Number(r.quantity) || null })),
		requisitos: ((requisitosQ.data ?? []) as unknown as Array<Requisito & { ots?: { ot_number?: string } }>)
			.map((r) => ({
				ot_id: r.ot_id, ot_number: numero(r),
				quantity: Number(r.quantity) || null, status: r.status,
			})),
		esperando: ((esperandoQ.data ?? []) as OTEsperando[]),
	});

	// La captura se escribe SIEMPRE, se haya podido descontar o no. Una foto que
	// llegó y no se pudo aplicar es justamente la que alguien tiene que mirar; si
	// sólo se registraran las exitosas, el problema quedaría en el teléfono del
	// que la mandó.
	const capturaBase = {
		domain: 'warehouse' as const,
		event_type: 'use',
		channel: 'qr' as const,
		operator_phone: input.from,
		operator_name: input.profile_name ?? null,
		lot_id: lote.id,
		scanned_value: leido.value,
		message_timestamp: input.timestamp ?? new Date().toISOString(),
		raw_message: null,
	};

	if (!resolucion.otId || resolucion.quantity == null) {
		const pregunta = replyForResolution(resolucion, lote.lot_number);
		await supabaseAdmin.from('capture_events' as never).insert({
			...capturaBase,
			ot_id: resolucion.otId,
			quantity: resolucion.quantity,
			status: 'pending',
			review_comments: resolucion.question ?? 'Falta la cantidad a descontar.',
			parsed_data: { resolution: resolucion } as unknown as Json,
		} as never);
		return responder(200, pregunta, {
			lot_number: lote.lot_number,
			candidates: resolucion.candidates,
			needs_answer: true,
		});
	}

	// ── Descontar, por el único camino que verifica ──────────────────────────
	const { error } = await supabaseAdmin.rpc('consumir_lote' as never, {
		p_lot_id: lote.id,
		p_ot_id: resolucion.otId,
		p_quantity: resolucion.quantity,
		p_by: null,
		p_stage: 'foto_bodega',
		p_override_reason: null,
	} as never);

	if (error) {
		// El mensaje de `consumir_lote` ya está escrito para una persona —
		// «el certificado del lote X venció el 12-03-2026»— así que se reenvía tal
		// cual en vez de traducirlo a un error genérico.
		logger.warn({ err: error, lot: lote.lot_number }, 'Foto de bodega rechazada por consumir_lote');
		await supabaseAdmin.from('capture_events' as never).insert({
			...capturaBase,
			ot_id: resolucion.otId,
			quantity: resolucion.quantity,
			status: 'rejected',
			review_comments: error.message,
			parsed_data: { resolution: resolucion } as unknown as Json,
		} as never);
		return responder(200, error.message, { lot_number: lote.lot_number, applied: false });
	}

	await supabaseAdmin.from('capture_events' as never).insert({
		...capturaBase,
		ot_id: resolucion.otId,
		ot_number: resolucion.otNumber,
		quantity: resolucion.quantity,
		status: 'auto_approved',
		applied: true,
		applied_ref_type: 'inventory_tx',
		parsed_data: { resolution: resolucion } as unknown as Json,
	} as never);

	return responder(200, replyForResolution(resolucion, lote.lot_number), {
		lot_number: lote.lot_number,
		ot_number: resolucion.otNumber,
		quantity: resolucion.quantity,
		source: resolucion.source,
		applied: true,
	});
}
