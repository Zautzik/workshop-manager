/**
 * El viaje completo de la etiqueta QR: cerrar sin sesión, aprobar con sesión.
 *
 * ── Por qué esta prueba existe y por qué toca una base de verdad ───────────
 *
 * Lo que hay que demostrar acá no es que una función devuelva lo que promete
 * —eso ya está probado en `maintenance-due.test.ts`— sino que **la fecha de la
 * próxima mantención de una máquina no se mueve** cuando la orden se cierra
 * desde la etiqueta, y que sí se mueve cuando un supervisor lo aprueba. Eso
 * atraviesa dos rutas, `applyWorkOrderUpdate`, `advanceLinkedSchedule` y cuatro
 * columnas nuevas. Con todo eso mockeado la prueba pasaría igual el día que la
 * columna se llame distinto, que es exactamente el error que se encontró
 * preparando esta prueba: el esquema público aceptaba `actual_minutes` y la
 * columna se llama `total_time_minutes`, así que cerrar desde la etiqueta
 * respondía 500 y el operario perdía el reporte del trabajo que acababa de
 * hacer.
 *
 * Por eso corre contra Postgres, y por eso no corre siempre.
 *
 * ── Cómo correrla ─────────────────────────────────────────────────────────
 *
 *   npx supabase start
 *   npm run test:integracion
 *
 * Sin `TEST_SUPABASE_URL` se saltea sola, así que `npm test` y CI no la ven.
 *
 * ── El candado ────────────────────────────────────────────────────────────
 *
 * Esta prueba escribe, cierra órdenes y mueve fechas de mantención. Apuntada a
 * producción ensuciaría registros que bajo FSSC 22000 son evidencia. Si la URL
 * no es local, **aborta**; no se saltea en silencio, porque un salteo
 * silencioso es como alguien terminaría creyendo que la corrió.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL_LOCAL = process.env.TEST_SUPABASE_URL ?? '';
const KEY_LOCAL = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? '';
const hayStack = Boolean(URL_LOCAL && KEY_LOCAL);

if (hayStack) {
	const host = new URL(URL_LOCAL).hostname;
	if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') {
		throw new Error(
			`TEST_SUPABASE_URL apunta a ${host}. Esta prueba escribe y mueve fechas de ` +
				'mantención: sólo corre contra el stack local.',
		);
	}
	// Las rutas leen su cliente de estas variables, y lo hacen perezosamente
	// (`getClient()` en integrations/supabase/server.ts), así que alcanza con
	// fijarlas antes del primer import dinámico de un handler.
	process.env.NEXT_PUBLIC_SUPABASE_URL = URL_LOCAL;
	process.env.SUPABASE_SERVICE_ROLE_KEY = KEY_LOCAL;
}

/** Quién firma la aprobación. UUID fijo para poder asertar el sello. */
const APROBADOR = '4e1dd2a2-0000-4000-8000-00000000d1a1';

/** Lo que devuelve el `requireAuth` mockeado. `null` = sin sesión. */
let rolDelLlamador: string | null = 'supervisor';

/**
 * `requireAuth` se mockea —no hay NextAuth en un proceso de vitest— pero el
 * mock **respeta la lista de roles** que declara cada ruta. Así la prueba de
 * que un técnico no puede aprobar verifica la lista real de `/aprobar-avance`,
 * no una afirmación de este archivo.
 */
vi.mock('@/lib/api-middleware', () => ({
	requireAuth: async (roles?: string | string[]) => {
		if (!rolDelLlamador) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}
		if (roles) {
			const lista = Array.isArray(roles) ? roles : [roles];
			if (!lista.includes(rolDelLlamador)) {
				return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
			}
		}
		return { id: APROBADOR, email: 'suite@local', name: 'Suite', role: rolDelLlamador };
	},
	isAuthError: (v: unknown) => v instanceof NextResponse,
}));

const db = hayStack
	? createClient(URL_LOCAL, KEY_LOCAL, { auth: { persistSession: false } })
	: (null as never);

/** Los pasos de la pauta, con sus minutos estimados. 10+20+15 = 45. */
const PASOS = [
	{ item_id: 'p1', title: 'Revisar nivel de tinta', estimated_minutes: 10 },
	{ item_id: 'p2', title: 'Limpiar mantillas', estimated_minutes: 20 },
	{ item_id: 'p3', title: 'Engrasar cadena', estimated_minutes: 15 },
];
const MINUTOS_DE_LA_PAUTA = 45;

/**
 * Los casos corren en orden: son un recorrido, no casos independientes. La
 * orden se arranca, se marca, se cierra y después se aprueba, que es lo que
 * pasa en el taller. Vitest corre los `it` de un archivo en secuencia.
 */
describe.skipIf(!hayStack)('cierre desde la etiqueta y visto bueno del supervisor', () => {
	const marca = `ZZTEST-${Date.now()}`;
	const FECHA_ORIGINAL = '2026-10-01';

	let maquinaA = '';
	let tokenA = '';
	let checklist = '';
	let pautaEtiqueta = '';
	let pautaSesion = '';
	let ordenEtiqueta = '';
	let ordenSesion = '';
	let ordenAjena = '';

	beforeAll(async () => {
		const nuevaMaquina = async (nombre: string, contador: number) => {
			const { data, error } = await db
				.from('machines')
				.insert({
					name: `${marca} ${nombre}`,
					type: 'offset_printer',
					usage_unit: 'pliegos',
					usage_counter: contador,
					is_active: true,
				} as never)
				.select('id, qr_token')
				.single();
			if (error) throw new Error(`máquina ${nombre}: ${error.message}`);
			return data as unknown as { id: string; qr_token: string };
		};

		const a = await nuevaMaquina('prensa con etiqueta', 120_000);
		maquinaA = a.id;
		tokenA = a.qr_token;
		const b = await nuevaMaquina('prensa ajena', 5_000);

		const { data: ch, error: eCh } = await db
			.from('maintenance_checklists')
			.insert({
				name: `${marca} pauta mensual`,
				frequency: 'monthly',
				machine_type: 'offset_printer',
				items: PASOS,
			} as never)
			.select('id')
			.single();
		if (eCh) throw new Error(`checklist: ${eCh.message}`);
		checklist = (ch as unknown as { id: string }).id;

		const nuevaPauta = async (maquina: string) => {
			const { data, error } = await db
				.from('maintenance_schedules')
				.insert({
					machine_id: maquina,
					checklist_id: checklist,
					frequency_days: 30,
					next_maintenance_date: FECHA_ORIGINAL,
					maintenance_type: 'preventive',
					status: 'scheduled',
				} as never)
				.select('id')
				.single();
			if (error) throw new Error(`pauta: ${error.message}`);
			return (data as unknown as { id: string }).id;
		};
		pautaEtiqueta = await nuevaPauta(maquinaA);
		pautaSesion = await nuevaPauta(maquinaA);

		const nuevaOrden = async (maquina: string, pautaId: string | null, titulo: string) => {
			const { data, error } = await db
				.from('maintenance_work_orders')
				.insert({
					machine_id: maquina,
					checklist_id: checklist,
					schedule_id: pautaId,
					work_order_type: 'preventivo',
					status: 'pending',
					scheduled_date: new Date().toISOString(),
					priority: 2,
					title: `${marca} ${titulo}`,
				} as never)
				.select('id')
				.single();
			if (error) throw new Error(`orden ${titulo}: ${error.message}`);
			return (data as unknown as { id: string }).id;
		};
		ordenEtiqueta = await nuevaOrden(maquinaA, pautaEtiqueta, 'mantención por etiqueta');
		ordenSesion = await nuevaOrden(maquinaA, pautaSesion, 'mantención con sesión');
		ordenAjena = await nuevaOrden(b.id, null, 'orden de la otra máquina');
	});

	afterAll(async () => {
		if (!hayStack) return;
		// En orden inverso a las dependencias. Es local, pero dejar basura con
		// prefijo ZZTEST también se acumula.
		await db
			.from('machine_downtime_logs')
			.delete()
			.in('work_order_id', [ordenEtiqueta, ordenSesion, ordenAjena]);
		await db
			.from('maintenance_work_orders')
			.delete()
			.in('id', [ordenEtiqueta, ordenSesion, ordenAjena]);
		await db.from('maintenance_schedules').delete().in('id', [pautaEtiqueta, pautaSesion]);
		await db.from('maintenance_checklists').delete().eq('id', checklist);
		await db.from('machines').delete().like('name', `${marca}%`);
	});

	const leerEtiqueta = async (token: string) => {
		const { GET } = await import('@/app/api/maquina/[token]/route');
		const res = await GET(new NextRequest(new URL(`http://localhost/api/maquina/${token}`)), {
			params: Promise.resolve({ token }),
		});
		return { res, json: (await res.json()) as Record<string, any> };
	};

	const patch = async (token: string, ordenId: string, cuerpo: unknown) => {
		const { PATCH } = await import('@/app/api/maquina/[token]/ordenes/[orderId]/route');
		const res = await PATCH(
			new NextRequest(new URL(`http://localhost/api/maquina/${token}/ordenes/${ordenId}`), {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(cuerpo),
			}),
			{ params: Promise.resolve({ token, orderId: ordenId }) },
		);
		return { res, json: (await res.json()) as Record<string, any> };
	};

	const aprobar = async (ordenId: string) => {
		const { POST } = await import(
			'@/app/api/maintenance/work-orders/[id]/aprobar-avance/route'
		);
		const res = await POST(
			new NextRequest(
				new URL(`http://localhost/api/maintenance/work-orders/${ordenId}/aprobar-avance`),
				{ method: 'POST' },
			),
			{ params: Promise.resolve({ id: ordenId }) },
		);
		return { res, json: (await res.json()) as Record<string, any> };
	};

	const leerOrden = async (id: string) => {
		const { data } = await db
			.from('maintenance_work_orders')
			.select(
				'status, avance_pendiente, cerrada_desde, avance_aprobado_por, avance_aprobado_en, total_time_minutes, completed_items' as never,
			)
			.eq('id', id)
			.single();
		return data as unknown as Record<string, any>;
	};

	const leerPauta = async (id: string) => {
		const { data } = await db
			.from('maintenance_schedules')
			.select('next_maintenance_date, last_maintenance_date, last_maintenance_usage')
			.eq('id', id)
			.single();
		return data as unknown as Record<string, any>;
	};

	/* ── Lo que ve el operario ──────────────────────────────────────────── */

	it('la etiqueta abre sin sesión y muestra sólo las órdenes de SU máquina', async () => {
		const { res, json } = await leerEtiqueta(tokenA);
		expect(res.status).toBe(200);
		expect(json.machine.name).toContain('prensa con etiqueta');

		const ids = (json.orders as Array<{ id: string }>).map((o) => o.id);
		expect(ids).toContain(ordenEtiqueta);
		// La de la otra máquina no sale acá, ni compartiendo el mismo checklist.
		expect(ids).not.toContain(ordenAjena);

		// El id interno de la máquina no viaja: la pantalla no lo dibuja.
		expect(JSON.stringify(json)).not.toContain(maquinaA);
	});

	it('un token inexistente y uno mal formado contestan igual: 404', async () => {
		const inventado = await leerEtiqueta('11111111-2222-3333-4444-555555555555');
		expect(inventado.res.status).toBe(404);
		const basura = await leerEtiqueta('no-es-un-uuid');
		expect(basura.res.status).toBe(404);
		// Mismo cuerpo: no se distingue «no existe» de «no es un UUID».
		expect(basura.json.error).toBe(inventado.json.error);
	});

	/* ── Los candados de la ruta pública ───────────────────────────────── */

	it('la etiqueta de una máquina NO sirve para cerrar la orden de otra', async () => {
		const { res } = await patch(tokenA, ordenAjena, {
			status: 'completed',
			completed_at: new Date().toISOString(),
		});
		expect(res.status).toBe(404);
		// Y la orden ajena sigue abierta.
		expect((await leerOrden(ordenAjena)).status).toBe('pending');
	});

	it('rechaza un arreglo de ítems más largo que el tope', async () => {
		const demasiados = Array.from({ length: 201 }, (_, i) => ({
			item_id: `p${i}`,
			completed: true,
		}));
		const { res } = await patch(tokenA, ordenEtiqueta, { completed_items: demasiados });
		expect(res.status).toBe(400);
	});

	it('rechaza una fecha que no es una fecha', async () => {
		const { res } = await patch(tokenA, ordenEtiqueta, {
			status: 'completed',
			completed_at: 'el martes',
		});
		expect(res.status).toBe(400);
	});

	/* ── El trabajo del operario ────────────────────────────────────────── */

	it('arranca la orden desde la etiqueta', async () => {
		const { res } = await patch(tokenA, ordenEtiqueta, {
			status: 'in_progress',
			started_at: new Date().toISOString(),
		});
		expect(res.status).toBe(200);
		expect((await leerOrden(ordenEtiqueta)).status).toBe('in_progress');
	});

	it('cierra la orden: queda registrada, con sus minutos, y la pauta NO se mueve', async () => {
		const items = PASOS.map((p) => ({
			...p,
			completed: true,
			completed_at: new Date().toISOString(),
		}));
		const { res } = await patch(tokenA, ordenEtiqueta, {
			status: 'completed',
			completed_at: new Date().toISOString(),
			// Exactamente lo que manda `cerrar()` en /m/[token]: la suma de los
			// minutos estimados. Este es el campo que estaba mal nombrado.
			total_time_minutes: MINUTOS_DE_LA_PAUTA,
			completed_items: items,
		});
		expect(res.status).toBe(200);

		const o = await leerOrden(ordenEtiqueta);
		expect(o.status).toBe('completed');
		expect(Number(o.total_time_minutes)).toBe(MINUTOS_DE_LA_PAUTA);
		expect(o.completed_items as unknown[]).toHaveLength(3);
		// De dónde vino el cierre, para que el supervisor lo vea al aprobar.
		expect(o.cerrada_desde).toBe('etiqueta');
		// Lo que importa: la pauta quedó esperando visto bueno.
		expect(o.avance_pendiente).toBe(true);
		expect(o.avance_aprobado_por).toBeNull();

		// Y la fecha de la próxima mantención sigue donde estaba.
		expect((await leerPauta(pautaEtiqueta)).next_maintenance_date).toBe(FECHA_ORIGINAL);
	});

	it('una orden ya cerrada no se reabre desde la etiqueta', async () => {
		const { res } = await patch(tokenA, ordenEtiqueta, { status: 'in_progress' });
		expect(res.status).toBe(409);
	});

	/* ── El visto bueno ─────────────────────────────────────────────────── */

	it('un técnico no puede aprobar que la fecha se mueva', async () => {
		rolDelLlamador = 'technician';
		const { res } = await aprobar(ordenEtiqueta);
		expect(res.status).toBe(403);
		// La fecha sigue sin moverse.
		expect((await leerPauta(pautaEtiqueta)).next_maintenance_date).toBe(FECHA_ORIGINAL);
		rolDelLlamador = 'supervisor';
	});

	it('sin sesión tampoco', async () => {
		rolDelLlamador = null;
		const { res } = await aprobar(ordenEtiqueta);
		expect(res.status).toBe(401);
		rolDelLlamador = 'supervisor';
	});

	it('el supervisor aprueba: la fecha se mueve y queda firmada', async () => {
		const { res, json } = await aprobar(ordenEtiqueta);
		expect(res.status).toBe(200);
		expect(json.data.avanzada).toBe(true);

		const o = await leerOrden(ordenEtiqueta);
		expect(o.avance_pendiente).toBe(false);
		expect(o.avance_aprobado_por).toBe(APROBADOR);
		expect(o.avance_aprobado_en).not.toBeNull();

		const p = await leerPauta(pautaEtiqueta);
		// 30 días después del cierre, no de hoy ni de la fecha vieja.
		const esperada = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
		expect(p.next_maintenance_date).toBe(esperada);
		expect(p.next_maintenance_date).not.toBe(FECHA_ORIGINAL);
		// El contador de la máquina queda como referencia para la próxima vez.
		expect(Number(p.last_maintenance_usage)).toBe(120_000);
	});

	it('aprobar de nuevo no vuelve a correr la fecha', async () => {
		const antes = (await leerPauta(pautaEtiqueta)).next_maintenance_date;
		const { res } = await aprobar(ordenEtiqueta);
		expect(res.status).toBe(409);
		expect((await leerPauta(pautaEtiqueta)).next_maintenance_date).toBe(antes);
	});

	/* ── Lo que no tenía que cambiar ────────────────────────────────────── */

	it('el cierre CON sesión sigue moviendo la fecha en el acto', async () => {
		const { applyWorkOrderUpdate } = await import(
			'@/app/api/maintenance/work-orders/[id]/route'
		);
		const { error } = await applyWorkOrderUpdate(ordenSesion, {
			status: 'completed',
			completed_at: new Date().toISOString(),
		} as never);
		expect(error).toBeNull();

		const o = await leerOrden(ordenSesion);
		expect(o.status).toBe('completed');
		// No espera a nadie: hubo una persona identificada.
		expect(o.avance_pendiente).toBe(false);
		expect(o.cerrada_desde).toBe('sesion');

		const esperada = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
		expect((await leerPauta(pautaSesion)).next_maintenance_date).toBe(esperada);
	});
});
