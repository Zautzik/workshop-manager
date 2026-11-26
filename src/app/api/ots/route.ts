import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { amountCLP, units, wholeUnits } from '@/lib/limits';
import { PLAN_STEP_KEYS } from '@/lib/production-route';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { resolveSalesScope, scopeFilterId } from '@/lib/sales-scope';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';
import { ACTIVE_OT_STATUSES, OTStatusSchema } from '@/lib/ot-state-machine';
import { redactMoney } from '@/lib/money-fields';
import { fetchAll } from '@/lib/fetch-all';

// OTs are mutable and auth-gated — never cache at the HTTP layer.
export const dynamic = 'force-dynamic';

const DeadlineSchema = z.preprocess((value) => {
	if (value === null || value === undefined || value === '') {
		return null;
	}
	if (typeof value === 'string') {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) {
			return date.toISOString();
		}
	}
	return value;
}, z.union([z.string().datetime(), z.null()]));

const OTProductTypeSchema = z.enum([
	'etiqueta', 'caja_display', 'caja_plegadiza', 'volante', 'afiche',
	'brochure', 'carpeta', 'sobre', 'bolsa', 'otro',
]).nullable().optional();

const OTSubstrateTypeSchema = z.enum([
	'cauche', 'bond', 'couche', 'cartulina', 'kraft', 'adhesivo', 'vinilo', 'otro',
]).nullable().optional();

const OTColorModeSchema = z.enum([
	'cmyk', '1_color', '2_color', '3_color', 'cmyk_pantone', 'sin_impresion',
]).optional();

const OTPriorityLevelSchema = z.enum(['baja', 'normal', 'alta', 'urgente']).optional();

const OTOperationCategorySchema = z.enum(['materiales', 'impresion', 'terminaciones', 'tercerizado', 'otros']);

const OTOperationSchema = z.object({
	category: OTOperationCategorySchema,
	name: z.string().min(1).max(255),
	unit: z.string().max(50).default('unit'),
	quantity: units(),
	unit_cost: z.coerce.number().min(0),
	sort_order: z.coerce.number().int().min(0).default(0),
	// true si la línea la escribió o corrigió una persona a mano en el
	// asistente — decide si un cambio de especificación posterior puede
	// refrescarla sola (reconcileOperations, ot-calculations.ts).
	is_manual: z.boolean().default(false),
});

const CreateOTSchema = z.object({
	// La imagen ES el trabajo: una OT sin arte es cómo se imprimen 150.000
	// etiquetas de memoria. El que crea debe declarar una de dos cosas:
	// que va a subir arte de inmediato (art_files >= 1, el wizard sube justo
	// después de crear) o que la OT nace explícitamente sin arte (sin_arte),
	// bandera que queda visible hasta que alguien lo adjunte. Se rechaza lo
	// silenciosamente incorrecto; se permite lo explícitamente incompleto.
	art_files: z.coerce.number().int().min(0).optional(),
	sin_arte: z.boolean().optional(),
	ot_number: z.string().min(1).max(100),
	client_name: z.string().min(1).max(255),
	description: z.string().max(2000).optional().nullable(),
	quantity: wholeUnits(),
	// No default here: `d.priority ?? priorityMap[priority_level]` below must see
	// undefined when the caller only sends priority_level, or the mapping never
	// fires and every "urgente" OT lands at priority 1 (2026-07 audit).
	priority: z.coerce.number().int().min(1).max(10).optional(),
	deadline: DeadlineSchema.optional(),
	status: OTStatusSchema.optional(),
	// New professional fields
	product_name: z.string().max(500).optional().nullable(),
	product_type: OTProductTypeSchema,
	priority_level: OTPriorityLevelSchema,
	client_id: z.string().uuid().optional().nullable(),
	template_id: z.string().uuid().optional().nullable(),
	width_cm: z.coerce.number().min(0).optional().nullable(),
	height_cm: z.coerce.number().min(0).optional().nullable(),
	substrate_type: OTSubstrateTypeSchema,
	grammage_gsm: z.coerce.number().int().min(0).optional().nullable(),
	substrate_brand: z.string().max(255).optional().nullable(),
	substrate_supplier: z.string().max(255).optional().nullable(),
	// Clase de cobertura del arte: multiplica el consumo de tinta en el motor.
	ink_coverage: z.enum(['light', 'medium', 'heavy']).optional().nullable(),
	color_front: OTColorModeSchema,
	color_back: OTColorModeSchema,
	pantone_colors: z.array(z.string()).optional().nullable(),
	// Finishes
	finish_troquelado: z.boolean().optional(),
	finish_plegado: z.boolean().optional(),
	finish_pegado: z.boolean().optional(),
	finish_laminado: z.boolean().optional(),
	finish_barniz: z.boolean().optional(),
	finish_relieve: z.boolean().optional(),
	finish_perforado: z.boolean().optional(),
	finish_hot_stamping: z.boolean().optional(),
	finish_uv_localizado: z.boolean().optional(),
	finish_numeracion: z.boolean().optional(),
	// Calculations
	calc_sheets: z.coerce.number().int().min(0).optional().nullable(),
	calc_substrate_kg: z.coerce.number().min(0).optional().nullable(),
	calc_ink_kg: z.coerce.number().min(0).optional().nullable(),
	calc_plates: z.coerce.number().int().min(0).optional().nullable(),
	calc_print_hours: z.coerce.number().min(0).optional().nullable(),
	calc_finish_hours: z.coerce.number().min(0).optional().nullable(),
	// Pricing
	subtotal: amountCLP().optional(),
	margin_pct: z.coerce.number().min(0).max(100).optional(),
	margin_amount: amountCLP().optional(),
	increment_pct: z.coerce.number().min(0).max(100).optional(),
	increment_amount: amountCLP().optional(),
	commission_pct: z.coerce.number().min(0).max(100).optional(),
	commission_amount: amountCLP().optional(),
	total_price: amountCLP().optional(),
	unit_price: amountCLP().optional(),
	// Machine chosen in the wizard's Máquina step. This field was silently
	// dropped for months (not in the schema → Zod stripped it), which is why
	// every OT showed machine: null (2026-07 audit).
	assigned_machine_id: z.string().uuid().optional().nullable(),
	// Las etapas por las que pasa la OT, declaradas al crearla (2026-11-11). El
	// papel sale de bodega al entrar a la primera; no toda OT pasa por todas.
	route_steps: z.array(z.enum(PLAN_STEP_KEYS)).min(1, 'Elegí por qué etapas pasa la OT').max(PLAN_STEP_KEYS.length),
	// Operations (child rows)
	operations: z.array(OTOperationSchema).optional(),
	notes: z.string().max(5000).optional().nullable(),
	// Full production bundle (montaje, finishing, machine, tapas, pliegos, admin)
	// persisted as JSONB — replaces the prior per-browser localStorage stash.
	production_detail: z.any().optional().nullable(),
});

// ── Pagination ──────────────────────────────────────────────────────────────
// A plain list pages (max 200 per page). Three shapes are NOT paged, because a
// cut-off list is wrong in silence (audit C2, 2026-11-25: with 250 OTs, the
// 50 oldest were invisible to every screen that read "the first 200"):
//   active=true  → every OT in flight. Bounded by what the plant can hold.
//   board=true   → every OT in flight + the ones completed in the last 30 days
//                  (the Tablero's "Completadas" column).
//   q=texto      → search across ALL OTs (number, client, product), newest
//                  first, at most `limit` rows — for pickers like Expediente.
const BOARD_COMPLETED_DAYS = 30;
const PageSchema = z.object({
	page:   z.coerce.number().int().min(1).default(1),
	limit:  z.coerce.number().int().min(1).max(200).default(50),
	active: z.string().optional(), // 'true' → every in-flight OT, unpaged
	board:  z.string().optional(), // 'true' → in flight + completed in the last 30 days, unpaged
	q:      z.string().trim().max(100).optional(),
	// Un solo estado exacto, filtrado en el servidor — el comentario de
	// arriba ya lo pedía y nadie lo había construido. Sin esto,
	// CalibracionMotor.tsx pedía las primeras 200 OTs por prioridad y
	// filtraba 'completed' en el navegador: con ~260 OTs sembradas, un
	// trabajo terminado y de baja prioridad podía quedar siempre fuera de
	// esa ventana, y el selector de calibración se veía casi vacío
	// justo cuando más trabajo completado había (auditoría 2026-08).
	status: OTStatusSchema.optional(),
});

// Active statuses come from the state machine (single source) — see
// ACTIVE_OT_STATUSES in ot-state-machine.ts.

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { searchParams } = new URL(req.url);
	const pagination = PageSchema.safeParse(Object.fromEntries(searchParams));
	if (!pagination.success) {
		return NextResponse.json(
			{ error: 'Parámetros de paginación inválidos', details: pagination.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}
	const { page, limit, active, board, q, status } = pagination.data;
	const offset = (page - 1) * limit;

	// Row-scoping: a vendedor sees only their own OTs (salesman_id = me);
	// ops/management roles see the whole plant.
	const scope = await resolveSalesScope(auth);

	const SELECT = '*, machine:machines!assigned_machine_id(id,name,brand,model,type,status,location,colors,nominal_speed_sheets_hr,power_kw)';
	const base = () => {
		let qb = supabaseAdmin.from('ots').select(SELECT, { count: 'exact' });
		if (!scope.all) qb = qb.eq('salesman_id', scopeFilterId(scope));
		return qb;
	};

	// Unpaged shapes: the whole set, in pages of 1000 under the hood.
	if (active === 'true' || board === 'true') {
		try {
			const inFlight = await fetchAll<any>((a, b) =>
				base().in('status', [...ACTIVE_OT_STATUSES]).order('priority', { ascending: false }).order('created_at', { ascending: false }).range(a, b) as any,
			);
			let rows = inFlight.rows;
			if (board === 'true') {
				const since = new Date(Date.now() - BOARD_COMPLETED_DAYS * 86_400_000).toISOString();
				const done = await fetchAll<any>((a, b) =>
					base().eq('status', 'completed').gte('completed_at', since).order('completed_at', { ascending: false }).range(a, b) as any,
				);
				rows = [...rows, ...done.rows];
			}
			return NextResponse.json({ data: redactMoney(rows, auth.role), total: rows.length, page: 1, limit: rows.length, totalPages: 1 });
		} catch (error) {
			console.error('Error fetching OTs:', error);
			return NextResponse.json({ error: 'No se pudieron cargar las OTs' }, { status: 500 });
		}
	}

	try {
		let query = base();
		if (q) {
			// Search: newest first, over every OT. Characters that PostgREST's
			// or() grammar reserves are dropped so a client name cannot break it.
			const term = q.replace(/[,()*%\\]/g, ' ').trim();
			if (term) query = query.or(`ot_number.ilike.%${term}%,client_name.ilike.%${term}%,product_name.ilike.%${term}%`);
			query = query.order('created_at', { ascending: false });
		} else {
			query = query.order('priority', { ascending: false }).order('created_at', { ascending: false });
		}

		if (status) {
			query = query.eq('status', status);
		}

		const { data, error, count } = await query.range(offset, offset + limit - 1);

		if (error) {
			console.error('Error fetching OTs:', error);
			return NextResponse.json({ error: 'No se pudieron cargar las OTs' }, { status: 500 });
		}

		const total = count ?? 0;
		return NextResponse.json({
			data: redactMoney(data ?? [], auth.role),
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		});
	} catch (error) {
		console.error('Error fetching OTs:', error);
		return NextResponse.json({ error: 'No se pudieron cargar las OTs' }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	const rl = enforceRouteRateLimit({
		req,
		key: `ots:${buildRateLimitActor(req, auth.id)}:create`,
		limit: 30,
		windowMs: 60_000,
		message: 'Demasiadas OTs creadas seguidas. Espera un momento y reintenta.',
	});
	if (rl) return rl;

	try {
		const body = await req.json();
		const parsed = CreateOTSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const d = parsed.data;

		if (!(Number(d.art_files ?? 0) >= 1) && d.sin_arte !== true) {
			return NextResponse.json(
				{
					error:
						'Una OT necesita su arte adjunto, o la declaración explícita de que aún no existe (sin_arte). Sin imagen, prensa imprime de memoria.',
					code: 'OT_SIN_ARTE',
				},
				{ status: 400 }
			);
		}

		const operations = d.operations || [];

		// Map priority_level to legacy priority integer for backwards compat
		const priorityMap: Record<string, number> = { baja: 2, normal: 5, alta: 8, urgente: 10 };

		const { data: ot, error: otError } = await supabaseAdmin
			.from('ots')
			.insert([
				{
					ot_number: d.ot_number,
					client_name: d.client_name,
					client_id: d.client_id || null,
					description: d.description || null,
					quantity: d.quantity,
					priority: d.priority ?? priorityMap[d.priority_level || 'normal'] ?? 5,
					deadline: d.deadline || null,
					status: d.status || 'pre_press',
					// New fields
					product_name: d.product_name || null,
					product_type: d.product_type || null,
					priority_level: d.priority_level || 'normal',
					sin_arte: d.sin_arte === true,
					ink_coverage: d.ink_coverage ?? null,
					template_id: d.template_id || null,
					width_cm: d.width_cm || null,
					height_cm: d.height_cm || null,
					substrate_type: d.substrate_type || null,
					grammage_gsm: d.grammage_gsm || null,
					substrate_brand: d.substrate_brand || null,
					substrate_supplier: d.substrate_supplier || null,
					color_front: d.color_front || 'cmyk',
					color_back: d.color_back || 'sin_impresion',
					pantone_colors: d.pantone_colors || null,
					finish_troquelado: d.finish_troquelado ?? false,
					finish_plegado: d.finish_plegado ?? false,
					finish_pegado: d.finish_pegado ?? false,
					finish_laminado: d.finish_laminado ?? false,
					finish_barniz: d.finish_barniz ?? false,
					finish_relieve: d.finish_relieve ?? false,
					finish_perforado: d.finish_perforado ?? false,
					finish_hot_stamping: d.finish_hot_stamping ?? false,
					finish_uv_localizado: d.finish_uv_localizado ?? false,
					finish_numeracion: d.finish_numeracion ?? false,
					calc_sheets: d.calc_sheets || null,
					calc_substrate_kg: d.calc_substrate_kg || null,
					calc_ink_kg: d.calc_ink_kg || null,
					calc_plates: d.calc_plates || null,
					calc_print_hours: d.calc_print_hours || null,
					calc_finish_hours: d.calc_finish_hours || null,
					subtotal: d.subtotal || 0,
					margin_pct: d.margin_pct ?? 10,
					margin_amount: d.margin_amount || 0,
					increment_pct: d.increment_pct ?? 10,
					increment_amount: d.increment_amount || 0,
					commission_pct: d.commission_pct ?? 1,
					commission_amount: d.commission_amount || 0,
					total_price: d.total_price || 0,
					unit_price: d.unit_price || 0,
					assigned_machine_id: d.assigned_machine_id || null,
					// En orden de flujo y sin repetidos, venga como venga.
					route_steps: PLAN_STEP_KEYS.filter((k) => d.route_steps.includes(k)),
					notes: d.notes || null,
					production_detail: d.production_detail ?? null,
				},
			])
			.select('*')
			.single();

		if (otError) {
			// Unique violation on ot_number → tell the user, don't 500 opaquely.
			if (otError.code === '23505') {
				return NextResponse.json(
					{ error: `El número de OT "${d.ot_number}" ya existe. Usa otro número.`, code: 'OT_NUMBER_TAKEN' },
					{ status: 409 }
				);
			}
			console.error('Error creating OT:', otError);
			return NextResponse.json({ error: 'No se pudo crear la OT' }, { status: 500 });
		}

		// Insert operations if any
		if (operations.length > 0 && ot) {
			const opsPayload = operations.map((op, idx) => ({
				ot_id: ot.id,
				category: op.category,
				name: op.name,
				unit: op.unit,
				is_manual: op.is_manual ?? false,
				quantity: op.quantity,
				unit_cost: op.unit_cost,
				sort_order: op.sort_order ?? idx,
			}));

			const { error: opsError } = await supabaseAdmin
				.from('ot_operations')
				.insert(opsPayload as any);

			if (opsError) {
				console.error('Error creating OT operations:', opsError);
				// OT was created, operations failed - log but don't fail entirely
			}
		}

		return NextResponse.json(ot, { status: 201 });
	} catch (error) {
		console.error('Error creating OT:', error);
		return NextResponse.json({ error: 'No se pudo crear la OT' }, { status: 500 });
	}
}
