/**
 * Bodega manda una foto y queda lista para descontar.
 *
 * Sin una tecla hasta acá: se le saca una foto a la etiqueta del pallet, se
 * manda por WhatsApp, y del otro lado se identifica el lote y se resuelve
 * para qué OT y cuánto — de lo más explícito a lo más inferido, ver
 * `resolveWarehousePhoto`.
 *
 * ── Por qué esto no descuenta nada ──────────────────────────────────────────
 *
 * Lo único que garantiza el HMAC del webhook es que Meta reenvió el mensaje,
 * no quién sacó la foto. Aplicar el consumo acá —como se hacía antes— dejaba
 * que cualquiera con el número de WhatsApp del taller y una foto de una
 * etiqueta impresa moviera inventario real sin que ningún humano lo viera.
 * El flujo de texto de este mismo webhook nunca tuvo ese problema porque
 * siempre encoló `pending`; esta foto es la misma bodega y tiene que valer
 * la misma regla.
 *
 * Esto sólo escribe la captura, pendiente. Quien aprueba en
 * `PATCH /api/captures/[id]` —autenticado, con rol— es quien de verdad llama
 * a `consumir_lote`, que es donde viven las verificaciones que hacen que esto
 * sea trazabilidad y no un registro: lote retenido, saldo real, papel
 * comprometido con otra orden, certificado vencido (auditoría 2026-08).
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

	const { data: lotes, error: lotesErr } = await supabaseAdmin
		.from('inventory_lots')
		.select('id, lot_number')
		.eq('item_id', wh.itemId)
		.gt('quantity_available', 0)
		.limit(3);

	// Un error de lectura no es "no hay partidas con saldo" — lo primero es
	// "no pude revisar" y lo segundo, en la respuesta, suena a que el material
	// no existe cuando en realidad no se llegó a mirar (auditoría 2026-08).
	if (lotesErr) {
		return { problem: 'No pude revisar el stock ahora. Probá de nuevo o avisá a bodega.' };
	}
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
	const { data: lote, error: loteErr } = await supabaseAdmin
		.from('inventory_lots')
		.select('id, lot_number, quantity_available, blocked_reason')
		.eq('id', resuelto.lotId)
		.maybeSingle();

	if (loteErr) {
		return responder(200, 'No pude revisar ese lote ahora. Probá de nuevo o avisá a bodega.', {
			scanned_value: leido.value,
		});
	}
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

	// ── La captura se escribe SIEMPRE, y siempre pendiente ───────────────────
	//
	// Antes esto llamaba a `consumir_lote` de una y marcaba la captura
	// `auto_approved`/`applied: true` apenas la foto resolvía sin ambigüedad.
	// Estaba mal: lo único que garantiza el HMAC del webhook es que Meta
	// reenvió el mensaje, no quién sacó la foto — cualquiera con el número de
	// WhatsApp del taller y una foto de una etiqueta impresa podía descontar
	// stock real sin que nadie humano lo viera. El flujo de texto de este
	// mismo webhook nunca aplicó nada solo, siempre encoló `pending`; esta
	// foto es la misma bodega y tiene que valer la misma regla.
	//
	// Ahora la foto sólo LEE y RESUELVE. Quien aprueba en `/api/captures/[id]`
	// —un admin/manager/supervisor autenticado, no un número de teléfono— es
	// quien de verdad dispara `consumir_lote`, con su propio user id como
	// `p_by`. Ver ese archivo para la otra mitad de este cambio (auditoría
	// 2026-08).
	const pregunta = replyForResolution(resolucion, lote.lot_number);
	await supabaseAdmin.from('capture_events' as never).insert({
		domain: 'warehouse' as const,
		event_type: 'use',
		channel: 'qr' as const,
		operator_phone: input.from,
		operator_name: input.profile_name ?? null,
		lot_id: lote.id,
		ot_id: resolucion.otId,
		ot_number: resolucion.otNumber,
		quantity: resolucion.quantity,
		scanned_value: leido.value,
		message_timestamp: input.timestamp ?? new Date().toISOString(),
		raw_message: null,
		status: 'pending',
		review_comments: resolucion.question ?? 'Foto de bodega — confirmar y aplicar.',
		parsed_data: { resolution: resolucion } as unknown as Json,
	} as never);

	return responder(200, pregunta, {
		lot_number: lote.lot_number,
		ot_number: resolucion.otNumber,
		quantity: resolucion.quantity,
		source: resolucion.source,
		candidates: resolucion.candidates,
		needs_answer: !resolucion.otId || resolucion.quantity == null,
		applied: false,
	});
}
