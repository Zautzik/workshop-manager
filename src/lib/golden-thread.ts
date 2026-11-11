/**
 * El hilo dorado del parte del taller — explícito, eslabón por eslabón.
 *
 * Un mensaje del operario recorre UN solo camino hasta el costo real y el
 * tablero, sin importar por qué canal entra ni por qué pantalla se aprueba.
 * Cada eslabón tiene una sola implementación; cambiarla la cambia para todos.
 *
 *   1. Entrada      processMessage            src/lib/whatsapp-ingest.ts
 *                   (webhook de Meta y simulador; foto de bodega en
 *                    warehouse-photo-ingest.ts) → log + capture_events (espejo)
 *   2. Revisión     reviewCapture             este archivo
 *                   ← POST /api/captures/review, la única puerta
 *                   ← useReviewCapture / useReviewCaptures (src/hooks/use-captures.ts)
 *   3. Aplicación   apply_capture_event       supabase/migrations/20261105120000
 *                   costos reales o inventario, con los dos guardias
 *   4. Recorrido    applyApprovedProductionReport   src/lib/apply-approved-report.ts
 *                   cierra la pasada con las horas y mueve la OT
 *   5. Refresco     invalidateAfterReview     src/hooks/review-cache.ts
 *                   todas las pantallas que el parte toca
 *
 * ── Dónde se escribe la decisión ────────────────────────────────────────────
 *
 * Un mensaje de WhatsApp vive en su log legado y el disparador
 * `mirror_legacy_capture` lo copia a capture_events (una sola vía). Por eso la
 * decisión y las correcciones van al log: escribirlas en la captura las perdería
 * en el próximo UPDATE del log. Una captura nativa (foto de bodega) vive en
 * capture_events. Eso es almacenamiento; la aplicación es siempre el eslabón 3.
 *
 * ── Correcciones ────────────────────────────────────────────────────────────
 *
 * H3′ (docs/capture-understanding-phase0.md): el JSON de costos llegaba del
 * cliente sin validar y aterrizaba en ot_real_costs. Ahora pasa por
 * `CorrectionsSchema` (campos, rangos y categorías conocidas), el total de cada
 * línea lo recalcula el servidor y, en la base, `ot_real_costs.total_cost` es
 * una columna generada. Los datos corregidos se fusionan con el parse original
 * en el servidor: el cliente manda sólo lo que cambió.
 */

import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { applyApprovedProductionReport, previewProductionMove, type ApprovedReportResult } from '@/lib/apply-approved-report';
import { PROCESOS_CONOCIDOS } from '@/lib/whatsapp-flow';
import { COST_CATEGORIES } from '@/lib/review-edits';
import type { ApplyActor } from '@/lib/whatsapp-apply';
import { PaperIssueLineSchema } from '@/lib/paper-issue-schema';

/* ─── Correcciones ───────────────────────────────────────────────────────── */

const count = z.number().int().min(0).max(10_000_000).nullable();

export const CorrectionsSchema = z.object({
	/** Producción: lo que el parser leyó (decide etapa, horas y destino de la OT). */
	data: z.object({
		pliegos_produced: count.optional(),
		merma: count.optional(),
		buenos: count.optional(),
		hours_reported: z.number().min(0).max(24).nullable().optional(),
		ajuste_minutes: z.number().min(0).max(600).nullable().optional(),
		processes_mentioned: z.array(z.string().refine((p) => PROCESOS_CONOCIDOS.includes(p), 'Proceso desconocido')).max(20).optional(),
		problems_reported: z.array(z.string().max(300)).max(20).optional(),
	}).strict().optional(),
	/** Producción: líneas de costo. */
	costLines: z.array(z.object({
		category: z.enum(COST_CATEGORIES),
		description: z.string().trim().min(1).max(200),
		quantity: z.number().min(0).max(10_000_000),
		unit: z.string().trim().min(1).max(20),
		unit_cost: z.number().min(0).max(1_000_000_000),
		source: z.enum(['parsed', 'inferred', 'default']).default('default'),
	}).strict()).max(30).optional(),
	/**
	 * Producción: el papel que sale si el parte hace entrar la OT a la primera
	 * etapa de su ruta (paper-issue.ts). Lo confirma quien revisa.
	 */
	paperIssue: z.array(PaperIssueLineSchema).min(1).max(10).optional(),
	/** Bodega. */
	quantity: z.number().positive().max(10_000_000).optional(),
	unitCost: z.number().min(0).max(1_000_000_000).optional(),
	lotId: z.string().uuid().optional(),
}).strict();

export type Corrections = z.infer<typeof CorrectionsSchema>;

/* ─── Revisión ───────────────────────────────────────────────────────────── */

/** Por dónde llega el id: la bandeja de Capturas, o el log de WhatsApp / bodega. */
export type CaptureSource = 'capture' | 'whatsapp' | 'warehouse';

export interface ReviewInput {
	decision: 'approve' | 'reject';
	comments?: string | null;
	corrections?: Corrections;
}

export type ReviewResult =
	| {
			ok: true;
			captureId: string;
			/** `now` = se aplicó en esta llamada; `before` = ya estaba; `no` = no se aplicó. */
			applied: 'now' | 'before' | 'no';
			flow: ApprovedReportResult['flow'];
			warnings: string[];
	  }
	| { ok: false; status: number; error: string };

/** Lo que la puerta devuelve por cada parte (también lo leen los hooks). */
export interface ReviewOutcome {
	id: string;
	ok: boolean;
	error?: string;
	/** HTTP del error, para que una revisión de a uno lo devuelva tal cual. */
	status?: number;
	warning?: string;
	applied?: 'now' | 'before' | 'no';
	moved?: { from: string; to: string } | null;
}

type Home = 'capture_events' | 'whatsapp_production_logs' | 'whatsapp_warehouse_logs';
type Row = Record<string, any>;

interface Resolved {
	home: Home;
	homeRow: Row;
	capture: Row;
}

const SOURCE_TABLE: Record<CaptureSource, Home> = {
	capture: 'capture_events',
	whatsapp: 'whatsapp_production_logs',
	warehouse: 'whatsapp_warehouse_logs',
};

async function resolve(source: CaptureSource, id: string): Promise<Resolved | { status: number; error: string }> {
	if (source === 'capture') {
		const { data: capture, error } = await supabaseAdmin.from('capture_events').select('*').eq('id', id).maybeSingle();
		if (error) return { status: 500, error: error.message };
		if (!capture) return { status: 404, error: 'Captura no encontrada' };
		const legacy = capture.legacy_table;
		if (legacy === 'whatsapp_production_logs' || legacy === 'whatsapp_warehouse_logs') {
			const { data: homeRow, error: e2 } = await supabaseAdmin.from(legacy).select('*').eq('id', capture.legacy_id!).maybeSingle();
			if (e2) return { status: 500, error: e2.message };
			if (!homeRow) return { status: 404, error: 'El mensaje de origen de esta captura ya no existe' };
			return { home: legacy, homeRow, capture };
		}
		return { home: 'capture_events', homeRow: capture, capture };
	}

	const table = SOURCE_TABLE[source];
	const { data: homeRow, error } = await supabaseAdmin.from(table).select('*').eq('id', id).maybeSingle();
	if (error) return { status: 500, error: error.message };
	if (!homeRow) return { status: 404, error: 'Parte no encontrado' };
	const { data: capture, error: e2 } = await supabaseAdmin
		.from('capture_events').select('*').eq('legacy_table', table).eq('legacy_id', id).maybeSingle();
	if (e2) return { status: 500, error: e2.message };
	if (!capture) return { status: 500, error: 'El parte no tiene captura en el espejo; no se puede aplicar.' };
	return { home: table, homeRow, capture };
}

/** Los dos guardias: el de la captura y el del log de origen. */
const isApplied = (r: Resolved): boolean =>
	!!r.capture.applied ||
	(r.home === 'whatsapp_production_logs' && !!r.homeRow.fed_to_system) ||
	(r.home === 'whatsapp_warehouse_logs' && !!r.homeRow.fed_to_inventory);

function decisionPatch(r: Resolved, input: ReviewInput, actor: ApplyActor): Row {
	const c = input.corrections ?? {};
	const status = input.decision === 'approve' ? 'approved' : 'rejected';
	const patch: Row = {
		[r.home === 'capture_events' ? 'status' : 'review_status']: status,
		reviewed_by: actor.id,
		reviewed_at: new Date().toISOString(),
		review_comments: input.comments ?? null,
	};

	if (c.data || c.paperIssue) {
		patch.corrected_data = {
			...(r.homeRow.corrected_data ?? r.homeRow.parsed_data ?? {}),
			...(c.data ?? {}),
			// Viaja con el parte: applyApprovedProductionReport lo lee de acá.
			...(c.paperIssue ? { paper_issue: c.paperIssue } : {}),
		};
	}
	if (c.costLines) {
		const cost_lines = c.costLines.map((l) => ({ ...l, total_cost: Math.round(l.quantity * l.unit_cost) }));
		patch.corrected_costs = {
			...(r.homeRow.corrected_costs ?? r.homeRow.inferred_costs ?? {}),
			// Un parte viejo trae papel y tinta inferidos; el material entra al
			// consumirse (material-policy.ts), así que el resumen no los arrastra.
			paper_cost: 0,
			ink_cost: 0,
			cost_lines,
			total_inferred_cost: cost_lines.reduce((s, l) => s + l.total_cost, 0),
		};
	}

	if (r.home === 'whatsapp_warehouse_logs') {
		if (c.quantity !== undefined) patch.corrected_quantity = c.quantity;
		if (c.unitCost !== undefined) patch.corrected_unit_cost = c.unitCost;
	} else if (r.home === 'capture_events') {
		if (c.quantity !== undefined) patch.quantity = c.quantity;
		if (c.unitCost !== undefined) patch.unit_cost = c.unitCost;
	}
	if (c.lotId !== undefined) patch.lot_id = c.lotId;
	return patch;
}

export async function reviewCapture(
	source: CaptureSource,
	id: string,
	input: ReviewInput,
	actor: ApplyActor,
): Promise<ReviewResult> {
	const r = await resolve(source, id);
	if ('error' in r) return { ok: false, status: r.status, error: r.error };

	const captureId = String(r.capture.id);
	const yaAplicado = isApplied(r);

	// Rechazar algo que ya cargó plata o movió inventario no lo deshace: dejarlo
	// pasar mostraría «rechazado» con los costos adentro.
	if (input.decision === 'reject' && yaAplicado) {
		return { ok: false, status: 409, error: 'El parte ya se integró al sistema; rechazarlo no revierte sus costos ni su inventario.' };
	}
	if (yaAplicado) {
		return { ok: true, captureId, applied: 'before', flow: null, warnings: ['Este parte ya estaba integrado: no se volvieron a cargar costos ni a mover la OT.'] };
	}

	const { data: row, error } = await supabaseAdmin
		.from(r.home)
		.update(decisionPatch(r, input, actor) as never)
		.eq('id', r.homeRow.id)
		.select('*')
		.single();
	if (error || !row) return { ok: false, status: 500, error: error?.message ?? 'No se pudo guardar la revisión' };

	if (input.decision === 'reject') return { ok: true, captureId, applied: 'no', flow: null, warnings: [] };

	// Eslabón 3 — el único escritor.
	const { error: applyErr } = await supabaseAdmin.rpc('apply_capture_event', { p_event_id: captureId, p_actor: actor.id ?? undefined });
	if (applyErr) {
		// Nada quedó marcado, así que volver a aprobar reintenta. Si la OT se
		// moviera igual, ese reintento cerraría la pasada otra vez y cargaría las
		// horas dos veces: se aplica todo junto o nada.
		return {
			ok: true, captureId, applied: 'no', flow: null,
			warnings: [`Aprobado, pero no se pudo aplicar: ${applyErr.message}`, 'No se tocó la OT; volvé a aprobar para reintentar todo junto.'],
		};
	}

	// Eslabón 4 — el parte no es sólo plata: cerrar la pasada y mover la OT.
	const warnings: string[] = [];
	let flow: ApprovedReportResult['flow'] = null;
	const p = row as Row;
	if (r.capture.domain === 'production' && p.ot_id) {
		const res = await applyApprovedProductionReport(
			{
				otId: p.ot_id,
				eventType: (p.message_type ?? p.event_type ?? null) as string | null,
				parsed: (p.corrected_data ?? p.parsed_data ?? {}) as Record<string, unknown>,
				operatorEmployeeId: p.operator_employee_id ?? null,
				messageTimestamp: p.message_timestamp ?? null,
			},
			actor,
		);
		flow = res.flow;
		if (res.warning) warnings.push(res.warning);
	}

	return { ok: true, captureId, applied: 'now', flow, warnings };
}

/**
 * Adónde movería la OT este parte si se aprobara con `data` (las correcciones
 * en curso de la revisión). No escribe nada. Para pedir el papel antes de
 * aprobar cuando el parte hace entrar la OT a la primera etapa de su ruta.
 */
export async function previewReviewMove(
	source: CaptureSource,
	id: string,
	data?: Corrections['data'],
): Promise<{ ok: true; otId: string | null; toStatus: string | null; movedUnits: number | null } | { ok: false; status: number; error: string }> {
	const r = await resolve(source, id);
	if ('error' in r) return { ok: false, status: r.status, error: r.error };
	const p = r.homeRow;
	if (r.capture.domain !== 'production' || !p.ot_id || isApplied(r)) {
		return { ok: true, otId: p.ot_id ?? null, toStatus: null, movedUnits: null };
	}
	const move = await previewProductionMove({
		otId: p.ot_id,
		eventType: (p.message_type ?? p.event_type ?? null) as string | null,
		parsed: { ...(p.corrected_data ?? p.parsed_data ?? {}), ...(data ?? {}) } as Record<string, unknown>,
		messageTimestamp: p.message_timestamp ?? null,
	});
	return { ok: true, otId: p.ot_id, ...move };
}
