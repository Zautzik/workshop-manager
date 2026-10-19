import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { applyWorkOrderUpdate } from '@/app/api/maintenance/work-orders/[id]/route';

export const dynamic = 'force-dynamic';

/**
 * Actualizar una orden de mantención desde el QR de la máquina, sin sesión.
 *
 * ── Ruta PÚBLICA, y por eso con dos candados propios ──────────────────────
 *
 * 1. El token de la etiqueta tiene que resolver a una máquina.
 * 2. La orden tiene que pertenecer a ESA máquina.
 *
 * El segundo es el que importa: sin él, cualquier etiqueta serviría para cerrar
 * la orden de cualquier máquina pasando otro `orderId`. Es la diferencia entre
 * «el token abre esta máquina» y «el token abre el módulo de mantención».
 *
 * ── Reusa `applyWorkOrderUpdate`, no reimplementa ──────────────────────────
 *
 * Esa función se extrajo del PATCH con sesión justamente para esto, y su propio
 * comentario lo dice: para que otro camino pueda cerrar una orden «por el mismo
 * camino exacto que este endpoint, no uno paralelo que se olvide de alguno de
 * los dos» efectos secundarios (el registro de parada y el avance de la pauta).
 * `whatsapp-maintenance-ingest.ts` ya entra por ahí. Esta ruta es el tercer
 * llamador, y el esquema de validación es el mismo porque es el de esa función.
 *
 * ── El límite de esto, dicho sin adornos ──────────────────────────────────
 *
 * No hay persona identificada. Quien tenga una foto de la etiqueta puede marcar
 * ítems y cerrar órdenes de esa máquina desde cualquier parte, y el registro no
 * dirá quién fue. Son evidencia bajo FSSC 22000. El token acota el daño a una
 * máquina y se puede revocar regenerándolo, pero si hace falta saber QUIÉN, el
 * paso siguiente es pedir la credencial del operario como hace
 * `/api/attendance/clock`. Está anotado en la migración 20261016150000.
 *
 * Por eso esta ruta NO acepta todo lo que acepta el PATCH con sesión: sólo lo
 * que el operario hace frente a la máquina.
 */

/**
 * Un error de base NO se devuelve textual en una ruta publica.
 *
 * La primera version devolvia `error.message` de Postgrest. Probando con un
 * token bien formado antes de aplicar la migracion, la respuesta decia
 * "column machines.qr_token does not exist": nombre de tabla y de columna,
 * a quien sea, sin sesion. Es poco, y es exactamente la clase de poco con la
 * que se empieza a mapear un esquema.
 *
 * Hacia afuera va un mensaje util para el operario; el detalle queda en el log
 * del servidor, que es donde sirve para arreglarlo.
 */
function fallaInterna(contexto: string, detalle: unknown) {
	console.error(`[etiqueta] ${contexto}:`, detalle);
	return NextResponse.json(
		{ error: 'No se pudo guardar. Intentá de nuevo en un momento.' },
		{ status: 500 },
	);
}
const TokenSchema = z.string().uuid();

/**
 * Lo que el QR puede cambiar: arrancar, marcar ítems, cerrar, y dejar una nota.
 *
 * Deliberadamente más angosto que el PATCH con sesión. No se puede reasignar,
 * cambiar prioridad ni reabrir una orden cerrada desde una etiqueta.
 */
/**
 * Un item de checklist, CON TOPES.
 *
 * El esquema de la ruta con sesion no acota nada: `item_id: z.string()`, sin
 * largo, y `completed_items` sin maximo de elementos. Detras de una sesion eso
 * es descuido; en una ruta publica es un buzon de escritura. A 200 pedidos por
 * minuto por IP, un arreglo sin tope de strings sin tope se guarda entero en una
 * columna jsonb que ademas es evidencia de mantencion.
 *
 * Los numeros son generosos a proposito: una pauta real tiene decenas de pasos,
 * no cientos, y ningun titulo de paso necesita 300 caracteres. Lo que se corta
 * es el abuso, no el uso.
 */
const ItemSchema = z.object({
	item_id: z.string().min(1).max(120),
	completed: z.boolean(),
	completed_at: z.string().datetime().nullable().optional(),
	estimated_minutes: z.coerce.number().min(0).max(10_000).nullable().optional(),
	title: z.string().max(300).optional(),
	section: z.string().max(120).nullable().optional(),
	action_type: z.string().max(120).nullable().optional(),
});

/**
 * Lo que el QR puede cambiar: arrancar, marcar items, cerrar, y dejar una nota.
 *
 * Deliberadamente mas angosto que el PATCH con sesion. No se puede reasignar,
 * cambiar prioridad ni reabrir una orden cerrada desde una etiqueta.
 *
 * Las fechas van con `.datetime()`, igual que en la ruta con sesion. La primera
 * version de este archivo usaba `z.string()` suelto: una fecha cualquiera habria
 * llegado a una columna timestamptz para fallar en la base en vez de rebotar
 * como 400 aca.
 */
const CuerpoSchema = z
	.object({
		status: z.enum(['in_progress', 'completed']).optional(),
		started_at: z.string().datetime().optional(),
		completed_at: z.string().datetime().optional(),
		// Una semana en minutos. Una orden que dice durar mas que eso es un error
		// de tipeo o un abuso, y en los dos casos no deberia entrar al costo.
		actual_minutes: z.coerce.number().min(0).max(10_080).optional(),
		notes: z.string().max(2000).nullable().optional(),
		completed_items: z.array(ItemSchema).max(200).optional(),
	})
	.refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ token: string; orderId: string }> },
) {
	const { token, orderId } = await params;

	if (!TokenSchema.safeParse(token).success || !z.string().uuid().safeParse(orderId).success) {
		return NextResponse.json({ error: 'Etiqueta u orden no válida' }, { status: 404 });
	}

	// 1) El token tiene que resolver a una máquina.
	const { data: maquina, error: errMaquina } = await supabaseAdmin
		.from('machines' as never)
		.select('id, name')
		.eq('qr_token' as never, token as never)
		.maybeSingle();

	if (errMaquina) return fallaInterna('lectura de maquina', errMaquina);
	if (!maquina) return NextResponse.json({ error: 'Etiqueta no válida' }, { status: 404 });

	// 2) La orden tiene que ser de ESA máquina. Sin este chequeo el token sería
	//    una llave del módulo de mantención y no de una máquina.
	const { data: orden, error: errOrden } = await supabaseAdmin
		.from('maintenance_work_orders')
		.select('id, machine_id, status')
		.eq('id', orderId)
		.maybeSingle();

	if (errOrden) return fallaInterna('lectura de orden', errOrden);
	if (!orden || (orden as any).machine_id !== (maquina as any).id) {
		// Mismo 404 que una etiqueta inexistente: no se confirma que la orden
		// exista si no es de esta máquina.
		return NextResponse.json({ error: 'Esa orden no es de esta máquina' }, { status: 404 });
	}

	// Una orden ya cerrada no se reabre desde una etiqueta.
	if ((orden as any).status === 'completed' || (orden as any).status === 'cancelled') {
		return NextResponse.json(
			{ error: 'Esta orden ya está cerrada. Avisá al supervisor si hay que reabrirla.' },
			{ status: 409 },
		);
	}

	const parsed = CuerpoSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	try {
		// Mismo camino que el PATCH con sesión: incluye el registro de parada y el
		// avance de la pauta.
		//
		// `applyWorkOrderUpdate` devuelve {data, error} y NO lanza. La primera
		// versión de este archivo tomaba el retorno como si fuera el dato: un fallo
		// de escritura habría salido con HTTP 200 y el operario habría visto su
		// casilla marcada sin que se guardara nada. Se destructura igual que en la
		// ruta con sesión.
		// `advanceSchedule: false`: cerrar desde la etiqueta registra el trabajo pero
		// NO mueve la fecha de la proxima mantencion. Aca no hay persona
		// identificada, y estirar el intervalo de un equipo lo tiene que firmar un
		// supervisor desde /aprobar-avance. La orden queda `avance_pendiente`.
		const { data, error } = await applyWorkOrderUpdate(orderId, parsed.data as never, {
			advanceSchedule: false,
			closedFrom: 'etiqueta',
		});
		if (error) return fallaInterna('update de orden', error);
		if (!data) {
			return NextResponse.json({ error: 'No se pudo actualizar la orden' }, { status: 500 });
		}
		return NextResponse.json({ data });
	} catch (err) {
		return fallaInterna('excepcion en update', err);
	}
}
