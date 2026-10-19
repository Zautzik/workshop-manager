import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { evaluateSchedule } from '@/lib/maintenance-due';

export const dynamic = 'force-dynamic';

/**
 * Lo que necesita la pantalla pública del QR de una máquina, y nada más.
 *
 * ── Ruta PÚBLICA, a propósito ──────────────────────────────────────────────
 *
 * No lleva `requireAuth`. El QR está pegado en la máquina y lo escanea el
 * operario desde su teléfono, en el taller, sin sesión — si pidiera login no
 * serviría para lo único que tiene que servir. Lo que autoriza es el token de la
 * etiqueta, no una cuenta.
 *
 * El token vive en `machines.qr_token`, es un UUID aleatorio y único, y se puede
 * revocar regenerándolo y reimprimiendo la etiqueta. Mismo patrón que
 * `ots.share_token` para el portal del cliente.
 *
 * ── Devuelve SÓLO lo de esta máquina ──────────────────────────────────────
 *
 * Esto importa más de lo que parece. La pantalla con sesión
 * (`MachinePendingMaintenance`) pide TODAS las órdenes abiertas a
 * `/api/maintenance/work-orders` y filtra por máquina EN EL NAVEGADOR. Servir
 * eso en una ruta pública haría que la etiqueta de una máquina expusiera las
 * órdenes de todas. Acá el filtro es parte de la consulta, no del cliente.
 *
 * Y las columnas son explícitas. Un `select('*')` sobre máquinas y órdenes
 * mandaría a una pantalla anónima campos que nadie pidió — el mismo error que
 * `/api/workers` tenía con `employees`.
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
		{ error: 'No se pudo leer la etiqueta. Intentá de nuevo en un momento.' },
		{ status: 500 },
	);
}
const TokenSchema = z.string().uuid();

/** Datos de la máquina que la etiqueta puede mostrar. Nada más. */
const COLUMNAS_MAQUINA = 'id, name, type, usage_counter, usage_unit';

/** Lo que la pantalla necesita de cada orden abierta. */
// El join a maintenance_checklists NO es opcional: deriveChecklistItems() lee
// order.maintenance_checklists.items para armar la lista cuando la orden
// todavia no tiene completed_items. Sin el, la primera vez que alguien abre una
// orden desde la etiqueta no veria ningun paso.
const COLUMNAS_ORDEN =
	'id, machine_id, schedule_id, status, work_order_type, priority, scheduled_date, ' +
	'started_at, completed_at, notes, total_time_minutes, completed_items, checklist_id, ' +
	// La pantalla muestra 'esperando visto bueno' cuando la pauta todavia no se
	// movio, asi que la columna tiene que viajar.
	'avance_pendiente, ' +
	// Sin `fault_description`: la pantalla no lo dibuja, y es texto libre del
	// operario. Lo que una ruta publica no necesita, no lo publica.
	'title, maintenance_checklists(name, frequency, items)';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
	const { token } = await params;

	// Un token mal formado no llega a la base: se contesta 404 igual que un token
	// inexistente, para no distinguir «no es un UUID» de «no existe».
	if (!TokenSchema.safeParse(token).success) {
		return NextResponse.json({ error: 'Etiqueta no válida' }, { status: 404 });
	}

	const { data: maquina, error: errMaquina } = await supabaseAdmin
		.from('machines' as never)
		.select(COLUMNAS_MAQUINA)
		.eq('qr_token' as never, token as never)
		.maybeSingle();

	if (errMaquina) return fallaInterna('lectura de maquina', errMaquina);
	if (!maquina) {
		return NextResponse.json({ error: 'Etiqueta no válida' }, { status: 404 });
	}

	const maq = maquina as {
		id: string; name: string; type: string;
		usage_counter: number | null; usage_unit: string | null;
	};

	// Órdenes abiertas DE ESTA MÁQUINA. El filtro va en la consulta.
	const { data: ordenes, error: errOrdenes } = await supabaseAdmin
		.from('maintenance_work_orders')
		.select(COLUMNAS_ORDEN)
		.eq('machine_id', maq.id)
		.in('status', ['pending', 'in_progress'])
		.order('scheduled_date', { ascending: true });

	if (errOrdenes) return fallaInterna('lectura de ordenes', errOrdenes);

	// Pautas de esta máquina, para poder ofrecer «crear orden» cuando una está
	// vencida y todavía no tiene orden abierta.
	const { data: pautas, error: errPautas } = await supabaseAdmin
		.from('maintenance_schedules')
		.select(
			'id, machine_id, checklist_id, system_id, frequency_days, next_maintenance_date, ' +
			'frequency_usage, last_maintenance_usage',
		)
		.eq('machine_id', maq.id);

	if (errPautas) return fallaInterna('lectura de pautas', errPautas);

	// `due` se calcula con la misma función pura que usa el resto de la
	// aplicación, así que «vencida» significa lo mismo acá que en Vencimientos.
	const pautasConVencimiento = (pautas ?? []).map((p) => {
		const s = p as Record<string, any>;
		return {
			...s,
			due: evaluateSchedule({
				frequencyDays: s.frequency_days,
				nextMaintenanceDate: s.next_maintenance_date,
				frequencyUsage: s.frequency_usage,
				lastMaintenanceUsage: s.last_maintenance_usage,
				usageCounter: maq.usage_counter,
				usagePerDay: null,
			}),
		};
	});

	// El `id` de la máquina NO viaja en la respuesta: la pantalla no lo dibuja y
	// es un UUID interno. Se usa sólo acá, del lado del servidor, para filtrar.
	return NextResponse.json({
		machine: {
			name: maq.name,
			type: maq.type,
			usage_counter: maq.usage_counter,
			usage_unit: maq.usage_unit,
		},
		orders: ordenes ?? [],
		schedules: pautasConVencimiento,
	});
}
