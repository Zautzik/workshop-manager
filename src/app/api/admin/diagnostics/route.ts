/**
 * GET /api/admin/diagnostics
 *
 * Aggregates health, webhook, security and activity data for the
 * Admin Diagnostics dashboard. Admin-only.
 *
 * Returns a single JSON payload so the UI only makes one round-trip.
 */

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const TWO_WEEKS_AGO = () => {
	const d = new Date();
	d.setDate(d.getDate() - 14);
	return d.toISOString();
};

export async function GET() {
	const auth = await requireAuth(['admin']);
	if (isAuthError(auth)) return auth;

	const since = TWO_WEEKS_AGO();
	const db = supabaseAdmin;

	// ── Run all queries in parallel ──────────────────────────────────────────
	const [
		dbPing,
		otsCount,
		machinesCount,
		employeesCount,
		workersCount,
		whatsappStats,
		whatsappLogs,
		connectors,
		accessLogs,
		authUsersResult,
		allWorkers,
		compensationRates,
		employeesWithLegacy,
	] = await Promise.allSettled([
		// 1. DB latency
		(async () => {
			const t0 = Date.now();
			const { error } = await supabaseAdmin
				.from('employees')
				.select('id', { count: 'exact', head: true });
			return { latencyMs: Date.now() - t0, error: error?.message ?? null };
		})(),

		// 2. OT count (last 14 days — created)
		db.from('ots').select('id', { count: 'exact', head: true })
			.gte('created_at', since),

		// 3. Machine count + fields needed for cross-module checks
		supabaseAdmin.from('machines').select('id,status,name,workstation_id,is_active', { count: 'exact' }),

		// 4. Employee count (active)
		supabaseAdmin.from('employees')
			.select('id', { count: 'exact', head: true })
			.eq('status', 'active'),

		// 5. Total de personas en la ficha única (antes se contaba `workers`)
		supabaseAdmin.from('employees')
			.select('id', { count: 'exact', head: true }),

		// 6. WhatsApp log stats last 14 days (group by review_status)
		supabaseAdmin.from('whatsapp_production_logs')
			.select('review_status', { count: 'exact' })
			.gte('created_at', since),

		// 7. WhatsApp logs detail — last 100
		supabaseAdmin.from('whatsapp_production_logs')
			.select('id,created_at,ot_number,message_type,review_status,operator_name,raw_message')
			.gte('created_at', since)
			.order('created_at', { ascending: false })
			.limit(100),

		// 8. Integration connectors
		db.from('integration_connectors')
			.select('id,provider,name,status,last_sync_at,last_error,created_at'),

		// 9. HR compliance access logs last 14 days
		supabaseAdmin.from('hr_compliance_access_logs')
			.select('id,accessed_at,accessed_by,access_type,table_name,request_method,request_path,purpose,metadata')
			.gte('accessed_at', since)
			.order('accessed_at', { ascending: false })
			.limit(200),

		// 10. Auth users list
		supabaseAdmin.auth.admin.listUsers({ perPage: 200 }),

		// 11. Nombres de la planilla (cross-module: Planta↔Personas name collision)
		supabaseAdmin.from('employees').select('id,full_name'),

		// 12. Tarifas vigentes (cross-module: Personas → costo de mano de obra)
		supabaseAdmin.from('compensation_rates').select('employee_id'),

		// 13. Empleados sin cuenta de acceso: existen en la ficha pero no pueden
		//     entrar a la app, así que no pueden registrar nada por sí mismos.
		supabaseAdmin.from('employees')
			.select('id,full_name,status,user_id')
			.eq('status', 'active'),
	]);

	// ── Resolve results safely ───────────────────────────────────────────────
	const health = dbPing.status === 'fulfilled'
		? dbPing.value
		: { latencyMs: null, error: 'Query failed' };

	const machineRows =
		machinesCount.status === 'fulfilled' ? (machinesCount.value.data ?? []) : [];
	const machineSummary = machineRows.reduce((acc: Record<string, number>, m: any) => {
		acc[m.status] = (acc[m.status] || 0) + 1;
		return acc;
	}, {});

	// WhatsApp stats by review_status
	const waRows =
		whatsappStats.status === 'fulfilled' ? (whatsappStats.value.data ?? []) : [];
	const waByStatus = waRows.reduce((acc: Record<string, number>, row: any) => {
		acc[row.review_status] = (acc[row.review_status] || 0) + 1;
		return acc;
	}, {});

	// ── Cross-module integrity checks ────────────────────────────────────────
	// Con `workers` retirada, los chequeos que medían la duplicación entre las
	// dos tablas de personas ya no pueden fallar. Se sustituyen por los cortes
	// del hilo dorado que sí siguen siendo posibles sobre la ficha única.
	const employeeRows =
		allWorkers.status === 'fulfilled' ? (allWorkers.value.data ?? []) : [];
	const activeEmployees =
		employeesWithLegacy.status === 'fulfilled' ? (employeesWithLegacy.value.data ?? []) : [];

	// Check 1: máquinas cuyo nombre coincide con el de una persona. Confunde a
	// cualquiera que lea una asignación: no se sabe si es equipo u operario.
	const employeeNameSet = new Set(
		employeeRows.map((e: any) => (e.full_name ?? '').toLowerCase().trim()),
	);
	const machineWorkerNameCollisions = machineRows
		.filter((m: any) => m.name && employeeNameSet.has(m.name.toLowerCase().trim()))
		.map((m: any) => ({ id: m.id, name: m.name }));

	// Check 2: el mismo nombre en más de una ficha. Es la clase de defecto que
	// tenía `workers` —43 filas para 22 personas— y que ahora sólo puede
	// aparecer aquí, así que conviene seguir vigilándola.
	const byName = new Map<string, { id: string; name: string }[]>();
	for (const e of employeeRows as any[]) {
		const key = (e.full_name ?? '').toLowerCase().trim();
		if (!key) continue;
		byName.set(key, [...(byName.get(key) ?? []), { id: e.id, name: e.full_name }]);
	}
	const duplicateEmployees = [...byName.values()]
		.filter((rows) => rows.length > 1)
		.map((rows) => ({ name: rows[0].name as string, count: rows.length }));

	// Check 3: gente vigente sin cuenta de acceso. No puede entrar a la app, así
	// que no registra nada por sí misma: alguien marca y captura por ella.
	const employeesWithoutAccount = (activeEmployees as any[])
		.filter((e) => !e.user_id)
		.map((e) => ({ id: e.id, name: e.full_name as string }));

	// Check 4: gente vigente sin tarifa de compensación. Es un corte del hilo
	// dorado en su primer eslabón —persona → sueldo—: sin tarifa sus horas
	// cuestan cero y toda OT en la que trabajen sale más barata de lo que es.
	const ratedEmployeeIds = new Set(
		(compensationRates.status === 'fulfilled' ? (compensationRates.value.data ?? []) : [])
			.map((r: any) => r.employee_id),
	);
	const employeesWithoutRate = (activeEmployees as any[])
		.filter((e) => !ratedEmployeeIds.has(e.id))
		.map((e) => ({ id: e.id, name: e.full_name as string }));

	// Auth users — strip sensitive fields, keep only what the UI needs
	const rawUsers =
		authUsersResult.status === 'fulfilled'
			? (authUsersResult.value.data?.users ?? [])
			: [];

	const INACTIVE_THRESHOLD_DAYS = 14;
	const cutoff = new Date(since);
	const users = rawUsers.map((u: any) => ({
		id: u.id,
		email: u.email ?? '—',
		role: u.user_metadata?.role ?? u.app_metadata?.role ?? 'unknown',
		created_at: u.created_at,
		last_sign_in_at: u.last_sign_in_at ?? null,
		confirmed_at: u.confirmed_at ?? null,
		inactive: !u.last_sign_in_at || new Date(u.last_sign_in_at) < cutoff,
	}));

	// Security signal: users who have never signed in OR not in last 14 days
	const inactiveUsers = users.filter((u: any) => u.inactive);

	return NextResponse.json({
		generatedAt: new Date().toISOString(),
		health: {
			db: {
				status: health.error ? 'error' : 'ok',
				latencyMs: health.latencyMs,
				error: health.error,
			},
			counts: {
				otsLast14d: otsCount.status === 'fulfilled' ? (otsCount.value.count ?? 0) : null,
				machines: machineRows.length,
				machinesByStatus: machineSummary,
				activeEmployees: employeesCount.status === 'fulfilled'
					? (employeesCount.value.count ?? 0) : null,
				workers: workersCount.status === 'fulfilled'
					? (workersCount.value.count ?? 0) : null,
			},
		},
		webhooks: {
			whatsapp: {
				byStatus: waByStatus,
				total: waRows.length,
				logs: whatsappLogs.status === 'fulfilled' ? (whatsappLogs.value.data ?? []) : [],
			},
			connectors: connectors.status === 'fulfilled' ? (connectors.value.data ?? []) : [],
		},
		security: {
			users,
			inactiveUsers,
			inactiveThresholdDays: INACTIVE_THRESHOLD_DAYS,
		},
		logs: {
			hrAccessLogs: accessLogs.status === 'fulfilled' ? (accessLogs.value.data ?? []) : [],
		},
		crossModuleChecks: {
			machineWorkerNameCollisions,
			duplicateEmployees,
			employeesWithoutAccount,
			employeesWithoutRate,
		},
	});
}
