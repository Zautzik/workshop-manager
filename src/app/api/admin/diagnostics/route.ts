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
		assignmentsNoEmployee,
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

		// 5. Worker count
		supabaseAdmin.from('workers')
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

		// 11. All worker names (cross-module: Planta↔Personas name collision)
		supabaseAdmin.from('workers').select('id,name'),

		// 12. Asignaciones sin empleado resuelto (cross-module: Planta↔Personas)
		supabaseAdmin.from('worker_assignments').select('id,employee_id,worker_id,date,role'),

		// 13. Employees with worker_legacy_id set (cross-module: broken link check)
		supabaseAdmin.from('employees')
			.select('id,full_name,worker_legacy_id')
			.not('worker_legacy_id', 'is', null),
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
	const workerRows2 =
		allWorkers.status === 'fulfilled' ? (allWorkers.value.data ?? []) : [];
	const legacyEmployeeRows =
		employeesWithLegacy.status === 'fulfilled' ? (employeesWithLegacy.value.data ?? []) : [];

	// Check 1: machines whose name matches a worker name (Planta ↔ Personas)
	const workerNameSet = new Set(
		workerRows2.map((w: any) => (w.name ?? '').toLowerCase().trim()),
	);
	const machineWorkerNameCollisions = machineRows
		.filter((m: any) => m.name && workerNameSet.has(m.name.toLowerCase().trim()))
		.map((m: any) => ({ id: m.id, name: m.name }));

	// Los tres chequeos que había aquí —nombre de puesto igual al de su máquina,
	// puestos sin máquina, y máquinas sin puesto— medían el enlace entre
	// `workstations` y `machines`. Al fusionar las dos tablas ese enlace dejó de
	// existir, así que no pueden fallar: mantenerlos sería reportar siempre cero
	// sobre algo que ya no se puede romper. Se reemplazan por los desajustes que
	// sí siguen vivos entre Planta y Personas.

	// Check 2: operarios repetidos (mismo nombre, distinta fila)
	const workersByName = new Map<string, { id: string; name: string }[]>();
	for (const w of workerRows2 as any[]) {
		const key = (w.name ?? '').toLowerCase().trim();
		if (!key) continue;
		workersByName.set(key, [...(workersByName.get(key) ?? []), { id: w.id, name: w.name }]);
	}
	const duplicateWorkers = [...workersByName.values()]
		.filter((rows) => rows.length > 1)
		.map((rows) => ({ name: rows[0].name as string, count: rows.length }));

	// Check 3: operarios sin ficha de empleado — no tienen sueldo ni competencias,
	// así que cualquier costo de mano de obra que pase por ellos vale cero.
	const linkedWorkerIds = new Set(
		legacyEmployeeRows.map((e: any) => e.worker_legacy_id).filter(Boolean),
	);
	const workersWithoutEmployee = (workerRows2 as any[])
		.filter((w) => !linkedWorkerIds.has(w.id))
		.map((w) => ({ id: w.id, name: w.name as string }));

	// Check 4: asignaciones que no resuelven a ningún empleado. El trigger de
	// cumplimiento las rechaza hoy, así que son anteriores a él y quedaron
	// atascadas: no acumulan horas ni competencias para nadie.
	const assignmentRows =
		assignmentsNoEmployee.status === 'fulfilled' ? (assignmentsNoEmployee.value.data ?? []) : [];
	const orphanAssignments = (assignmentRows as any[])
		.filter((a) => !a.employee_id && !linkedWorkerIds.has(a.worker_id))
		.map((a) => ({ id: a.id, date: a.date as string, role: a.role as string }));

	// Check 5: employees whose worker_legacy_id points to a non-existent worker
	const workerIdSet = new Set(workerRows2.map((w: any) => w.id));
	const brokenEmployeeWorkerLinks = legacyEmployeeRows
		.filter((e: any) => !workerIdSet.has(e.worker_legacy_id))
		.map((e: any) => ({ id: e.id, name: e.full_name as string, legacyId: e.worker_legacy_id as string }));

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
			duplicateWorkers,
			workersWithoutEmployee,
			orphanAssignments,
			brokenEmployeeWorkerLinks,
		},
	});
}
