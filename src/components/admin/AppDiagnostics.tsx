'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Activity, Shield, Webhook, Users, RefreshCw, CheckCircle2,
	XCircle, AlertTriangle, Clock, Database, Cpu, MessageSquare,
	Plug, Eye, FileText, TrendingUp, Wifi, WifiOff, Link2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface DiagnosticsData {
	generatedAt: string;
	health: {
		db: { status: 'ok' | 'error'; latencyMs: number | null; error: string | null };
		counts: {
			otsLast14d: number | null;
			machines: number;
			machinesByStatus: Record<string, number>;
			activeEmployees: number | null;
			workers: number | null;
		};
	};
	webhooks: {
		whatsapp: {
			byStatus: Record<string, number>;
			total: number;
			logs: Array<{
				id: string;
				created_at: string;
				ot_number: string | null;
				message_type: string | null;
				review_status: string;
				operator_name: string | null;
				raw_message: string | null;
			}>;
		};
		connectors: Array<{
			id: string;
			provider: string;
			name: string;
			status: string;
			last_sync_at: string | null;
			last_error: string | null;
			created_at: string;
		}>;
	};
	security: {
		users: Array<{
			id: string;
			email: string;
			role: string;
			created_at: string;
			last_sign_in_at: string | null;
			confirmed_at: string | null;
			inactive: boolean;
		}>;
		inactiveUsers: Array<{ id: string; email: string; last_sign_in_at: string | null }>;
		inactiveThresholdDays: number;
	};
	logs: {
		hrAccessLogs: Array<{
			id: string;
			accessed_at: string;
			accessed_by: string | null;
			access_type: string;
			table_name: string;
			request_method: string | null;
			request_path: string | null;
			purpose: string | null;
			metadata: Record<string, unknown>;
		}>;
	};
	crossModuleChecks: {
		machineWorkerNameCollisions: Array<{ id: string; name: string }>;
		duplicateWorkers: Array<{ name: string; count: number }>;
		workersWithoutEmployee: Array<{ id: string; name: string }>;
		orphanAssignments: Array<{ id: string; date: string; role: string }>;
		brokenEmployeeWorkerLinks: Array<{ id: string; name: string; legacyId: string }>;
	};
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso: string | null) {
	if (!iso) return '—';
	return new Date(iso).toLocaleString('es-CL', {
		day: '2-digit', month: '2-digit', year: '2-digit',
		hour: '2-digit', minute: '2-digit',
	});
}

function StatusDot({ status }: { status: 'ok' | 'error' | 'active' | 'inactive' | 'warning' }) {
	const cls =
		status === 'ok' || status === 'active'
			? 'bg-emerald-500'
			: status === 'warning'
				? 'bg-amber-500'
				: 'bg-red-500';
	return <span className={`inline-block w-2 h-2 rounded-full ${cls} mr-2`} />;
}

function LatencyPill({ ms }: { ms: number | null }) {
	if (ms === null) return <Badge variant="destructive">—</Badge>;
	const color =
		ms < 200 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
		ms < 600 ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
		'bg-red-500/15 text-red-400 border-red-500/30';
	return (
		<span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono ${color}`}>
			{ms} ms
		</span>
	);
}

function ReviewBadge({ status }: { status: string }) {
	const map: Record<string, string> = {
		pending:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
		approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
		rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
		error:    'bg-red-500/15 text-red-400 border-red-500/30',
	};
	return (
		<span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border ${map[status] ?? 'bg-muted text-muted-foreground border-border'}`}>
			{status}
		</span>
	);
}

// ── Tab IDs ──────────────────────────────────────────────────────────────────

type TabId = 'health' | 'webhooks' | 'security' | 'logs' | 'coherence';

const TABS: { id: TabId; label: string; icon: typeof Activity }[] = [
	{ id: 'health',    label: 'Salud del Sistema',  icon: Activity },
	{ id: 'webhooks',  label: 'Webhooks',            icon: Webhook  },
	{ id: 'security',  label: 'Seguridad',           icon: Shield   },
	{ id: 'logs',      label: 'Logs de Actividad',   icon: FileText },
	{ id: 'coherence', label: 'Coherencia',           icon: Link2    },
];

// ── Panels ───────────────────────────────────────────────────────────────────

function HealthPanel({ data }: { data: DiagnosticsData }) {
	const { db, counts } = data.health;
	const machineStatuses = Object.entries(counts.machinesByStatus);

	const machineStatusColor: Record<string, string> = {
		running:     'bg-emerald-500/15 text-emerald-400',
		idle:        'bg-slate-500/15 text-slate-400',
		maintenance: 'bg-amber-500/15 text-amber-400',
		breakdown:   'bg-red-500/15 text-red-400',
		offline:     'bg-zinc-500/15 text-zinc-400',
		setup:       'bg-blue-500/15 text-blue-400',
	};

	return (
		<div className="space-y-4">
			{/* DB Health */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm flex items-center gap-2">
						<Database className="h-4 w-4 text-muted-foreground" />
						Conexión a Base de Datos
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-2">
							{db.status === 'ok'
								? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
								: <XCircle className="h-5 w-5 text-red-500" />}
							<span className={`font-semibold ${db.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
								{db.status === 'ok' ? 'Operacional' : 'Error'}
							</span>
						</div>
						<LatencyPill ms={db.latencyMs} />
						{db.error && (
							<span className="text-xs text-red-400 ml-2">{db.error}</span>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Entity Counters */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				{[
					{ label: 'OTs (14 d)',    value: counts.otsLast14d,      icon: TrendingUp },
					{ label: 'Máquinas',      value: counts.machines,        icon: Cpu        },
					{ label: 'Empleados act.', value: counts.activeEmployees, icon: Users      },
				].map(({ label, value, icon: Icon }) => (
					<Card key={label}>
						<CardContent className="pt-4 pb-3">
							<div className="flex items-center justify-between">
								<span className="text-xs text-muted-foreground">{label}</span>
								<Icon className="h-3.5 w-3.5 text-muted-foreground" />
							</div>
							<p className="text-2xl font-bold text-foreground mt-1">
								{value ?? '—'}
							</p>
						</CardContent>
					</Card>
				))}
			</div>

			{/* Machine status breakdown */}
			{machineStatuses.length > 0 && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-sm flex items-center gap-2">
							<Cpu className="h-4 w-4 text-muted-foreground" />
							Estado de Máquinas
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-wrap gap-2">
							{machineStatuses.map(([status, count]) => (
								<span key={status}
									className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium ${machineStatusColor[status] ?? 'bg-muted text-muted-foreground'}`}>
									{status} <strong>{count}</strong>
								</span>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function WebhooksPanel({ data }: { data: DiagnosticsData }) {
	const { whatsapp, connectors } = data.webhooks;
	const waStats = [
		{ key: 'approved', label: 'Aprobados',  color: 'text-emerald-400' },
		{ key: 'pending',  label: 'Pendientes', color: 'text-amber-400'   },
		{ key: 'rejected', label: 'Rechazados', color: 'text-red-400'     },
		{ key: 'error',    label: 'Error',      color: 'text-red-500'     },
	];

	const connectorStatusIcon = (s: string) =>
		s === 'active' ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> :
		s === 'error'  ? <WifiOff className="h-3.5 w-3.5 text-red-400" /> :
		<WifiOff className="h-3.5 w-3.5 text-zinc-500" />;

	return (
		<div className="space-y-4">
			{/* WhatsApp stats */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm flex items-center gap-2">
						<MessageSquare className="h-4 w-4 text-muted-foreground" />
						WhatsApp Production Logs — últimos 14 días
						<Badge variant="outline" className="ml-auto">{whatsapp.total} entradas</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="grid grid-cols-4 gap-3">
						{waStats.map(({ key, label, color }) => (
							<div key={key} className="text-center">
								<p className={`text-2xl font-bold ${color}`}>{whatsapp.byStatus[key] ?? 0}</p>
								<p className="text-xs text-muted-foreground mt-0.5">{label}</p>
							</div>
						))}
					</div>
					{/* Recent log entries */}
					<div className="mt-3 border rounded-md overflow-hidden">
						<table className="w-full text-xs">
							<thead>
								<tr className="bg-muted/50 text-muted-foreground">
									<th className="text-left px-3 py-2">Fecha</th>
									<th className="text-left px-3 py-2">OT</th>
									<th className="text-left px-3 py-2">Tipo</th>
									<th className="text-left px-3 py-2">Operario</th>
									<th className="text-left px-3 py-2">Estado</th>
								</tr>
							</thead>
							<tbody>
								{whatsapp.logs.slice(0, 20).map((log) => (
									<tr key={log.id} className="border-t border-border/40 hover:bg-muted/30">
										<td className="px-3 py-1.5 font-mono text-muted-foreground">{fmt(log.created_at)}</td>
										<td className="px-3 py-1.5 font-mono">{log.ot_number ?? '—'}</td>
										<td className="px-3 py-1.5 text-muted-foreground">{log.message_type ?? '—'}</td>
										<td className="px-3 py-1.5">{log.operator_name ?? '—'}</td>
										<td className="px-3 py-1.5"><ReviewBadge status={log.review_status} /></td>
									</tr>
								))}
								{whatsapp.logs.length === 0 && (
									<tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Sin registros en los últimos 14 días</td></tr>
								)}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>

			{/* Integration connectors */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm flex items-center gap-2">
						<Plug className="h-4 w-4 text-muted-foreground" />
						Conectores de Integración
						<Badge variant="outline" className="ml-auto">{connectors.length}</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent>
					{connectors.length === 0 ? (
						<p className="text-sm text-muted-foreground">Sin conectores configurados.</p>
					) : (
						<div className="space-y-2">
							{connectors.map((c) => (
								<div key={c.id}
									className="flex items-start justify-between rounded-md border border-border/40 px-3 py-2">
									<div className="flex items-center gap-2">
										{connectorStatusIcon(c.status)}
										<div>
											<p className="text-sm font-medium">{c.name}</p>
											<p className="text-xs text-muted-foreground">{c.provider}</p>
										</div>
									</div>
									<div className="text-right text-xs text-muted-foreground">
										<p>Sync: {fmt(c.last_sync_at)}</p>
										{c.last_error && (
											<p className="text-red-400 max-w-[200px] truncate" title={c.last_error}>
												{c.last_error}
											</p>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function SecurityPanel({ data }: { data: DiagnosticsData }) {
	const { users, inactiveUsers, inactiveThresholdDays } = data.security;

	const roleColor: Record<string, string> = {
		admin:      'bg-violet-500/15 text-violet-400',
		supervisor: 'bg-blue-500/15 text-blue-400',
		manager:    'bg-indigo-500/15 text-indigo-400',
		worker:     'bg-slate-500/15 text-slate-400',
		unknown:    'bg-zinc-500/15 text-zinc-500',
	};

	return (
		<div className="space-y-4">
			{/* Summary pills */}
			<div className="grid grid-cols-3 gap-3">
				<Card>
					<CardContent className="pt-4 pb-3">
						<p className="text-2xl font-bold">{users.length}</p>
						<p className="text-xs text-muted-foreground mt-0.5">Usuarios totales</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4 pb-3">
						<p className="text-2xl font-bold text-amber-400">{inactiveUsers.length}</p>
						<p className="text-xs text-muted-foreground mt-0.5">Inactivos +{inactiveThresholdDays}d</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4 pb-3">
						<p className="text-2xl font-bold text-emerald-400">
							{users.filter(u => !u.inactive && u.last_sign_in_at).length}
						</p>
						<p className="text-xs text-muted-foreground mt-0.5">Activos recientemente</p>
					</CardContent>
				</Card>
			</div>

			{/* Inactive users alert */}
			{inactiveUsers.length > 0 && (
				<Card className="border-amber-500/30 bg-amber-500/5">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm flex items-center gap-2 text-amber-400">
							<AlertTriangle className="h-4 w-4" />
							Usuarios sin actividad en +{inactiveThresholdDays} días
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-1">
							{inactiveUsers.map(u => (
								<div key={u.id} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
									<span className="text-muted-foreground">{u.email}</span>
									<span className="font-mono text-zinc-500">
										{u.last_sign_in_at ? fmt(u.last_sign_in_at) : 'Nunca'}
									</span>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Full user table */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm flex items-center gap-2">
						<Users className="h-4 w-4 text-muted-foreground" />
						Todos los usuarios
					</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					<div className="overflow-x-auto">
						<table className="w-full text-xs">
							<thead>
								<tr className="bg-muted/50 text-muted-foreground">
									<th className="text-left px-4 py-2">Email</th>
									<th className="text-left px-4 py-2">Rol</th>
									<th className="text-left px-4 py-2">Creado</th>
									<th className="text-left px-4 py-2">Último login</th>
									<th className="text-left px-4 py-2">Estado</th>
								</tr>
							</thead>
							<tbody>
								{users.map(u => (
									<tr key={u.id} className="border-t border-border/40 hover:bg-muted/30">
										<td className="px-4 py-2">{u.email}</td>
										<td className="px-4 py-2">
											<span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${roleColor[u.role] ?? roleColor.unknown}`}>
												{u.role}
											</span>
										</td>
										<td className="px-4 py-2 font-mono text-muted-foreground">{fmt(u.created_at)}</td>
										<td className="px-4 py-2 font-mono text-muted-foreground">
											{u.last_sign_in_at ? fmt(u.last_sign_in_at) : <span className="text-zinc-600">Nunca</span>}
										</td>
										<td className="px-4 py-2">
											{u.inactive
												? <span className="flex items-center gap-1 text-amber-400"><AlertTriangle className="h-3 w-3" /> Inactivo</span>
												: <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Activo</span>}
										</td>
									</tr>
								))}
								{users.length === 0 && (
									<tr><td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">Sin usuarios</td></tr>
								)}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function LogsPanel({ data }: { data: DiagnosticsData }) {
	const accessLogs = data.logs.hrAccessLogs;
	const waLogs = data.webhooks.whatsapp.logs;

	// Merge and sort all log sources by time desc
	type LogEntry = { ts: string; source: string; action: string; actor: string | null; path: string | null; detail: string | null };
	const merged: LogEntry[] = [
		...accessLogs.map(l => ({
			ts: l.accessed_at,
			source: 'HR Access',
			action: `${l.request_method ?? ''} ${l.access_type}`,
			actor: l.accessed_by,
			path: l.request_path,
			detail: l.table_name,
		})),
		...waLogs.map(l => ({
			ts: l.created_at,
			source: 'WhatsApp',
			action: l.message_type ?? 'message',
			actor: l.operator_name,
			path: null,
			detail: l.ot_number ? `OT: ${l.ot_number}` : null,
		})),
	].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

	const sourceColor: Record<string, string> = {
		'HR Access': 'bg-violet-500/15 text-violet-400',
		'WhatsApp':  'bg-emerald-500/15 text-emerald-400',
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">{merged.length} entradas en los últimos 14 días</p>
				<div className="flex gap-2">
					{Object.entries(sourceColor).map(([src, cls]) => (
						<span key={src} className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{src}</span>
					))}
				</div>
			</div>

			<Card>
				<CardContent className="p-0">
					<div className="overflow-x-auto max-h-[600px] overflow-y-auto">
						<table className="w-full text-xs">
							<thead className="sticky top-0">
								<tr className="bg-muted/80 backdrop-blur text-muted-foreground">
									<th className="text-left px-3 py-2">Timestamp</th>
									<th className="text-left px-3 py-2">Fuente</th>
									<th className="text-left px-3 py-2">Acción</th>
									<th className="text-left px-3 py-2">Actor</th>
									<th className="text-left px-3 py-2">Detalle</th>
								</tr>
							</thead>
							<tbody>
								{merged.map((entry, i) => (
									<tr key={i} className="border-t border-border/30 hover:bg-muted/20">
										<td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{fmt(entry.ts)}</td>
										<td className="px-3 py-1.5">
											<span className={`px-2 py-0.5 rounded-full text-[11px] ${sourceColor[entry.source] ?? 'bg-muted text-muted-foreground'}`}>
												{entry.source}
											</span>
										</td>
										<td className="px-3 py-1.5 font-mono text-foreground/80">{entry.action}</td>
										<td className="px-3 py-1.5 text-muted-foreground">
											{entry.actor
												? <span className="font-mono text-[11px]">{entry.actor.slice(0, 8)}…</span>
												: '—'}
										</td>
										<td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate" title={entry.detail ?? ''}>
											{entry.path ?? entry.detail ?? '—'}
										</td>
									</tr>
								))}
								{merged.length === 0 && (
									<tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Sin actividad en los últimos 14 días</td></tr>
								)}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function CoherencePanel({ data }: { data: DiagnosticsData }) {
	const c = data.crossModuleChecks;

	type Severity = 'ok' | 'warning' | 'error';
	type CheckDef = {
		id: string;
		label: string;
		description: string;
		modules: string;
		items: { label: string; detail?: string }[];
		severity: Severity;
	};

	const checks: CheckDef[] = [
		{
			id: 'machine-worker-names',
			label: 'Nombres Planta ↔ Personas',
			description: 'Máquinas cuyo nombre coincide exactamente con el de un operario',
			modules: 'Planta → Personas',
			items: c.machineWorkerNameCollisions.map(m => ({ label: m.name, detail: `id: ${m.id.slice(0, 8)}…` })),
			severity: c.machineWorkerNameCollisions.length > 0 ? 'error' : 'ok',
		},
		{
			id: 'duplicate-workers',
			label: 'Operarios repetidos',
			description: 'El mismo nombre en más de una ficha de operario — las horas y las competencias se reparten entre las copias',
			modules: 'Personas interno',
			items: c.duplicateWorkers.map(w => ({ label: w.name, detail: `${w.count} fichas` })),
			severity: c.duplicateWorkers.length > 0 ? 'error' : 'ok',
		},
		{
			id: 'workers-without-employee',
			label: 'Operarios sin ficha de empleado',
			description: 'Sin empleado enlazado no tienen sueldo ni competencias, así que su costo de mano de obra vale cero',
			modules: 'Operarios → Personas',
			items: c.workersWithoutEmployee.map(w => ({ label: w.name })),
			severity: c.workersWithoutEmployee.length > 0 ? 'warning' : 'ok',
		},
		{
			id: 'orphan-assignments',
			label: 'Asignaciones sin empleado',
			description: 'No resuelven a nadie: no acumulan horas ni competencias. Son anteriores al control de cumplimiento, que hoy las rechazaría',
			modules: 'Planta → Personas',
			items: c.orphanAssignments.map(a => ({ label: a.date, detail: a.role })),
			severity: c.orphanAssignments.length > 0 ? 'error' : 'ok',
		},
		{
			id: 'broken-employee-worker-links',
			label: 'Links Empleado ↔ Operario rotos',
			description: 'Empleados con worker_legacy_id apuntando a un operario que no existe',
			modules: 'Personas → Operarios',
			items: c.brokenEmployeeWorkerLinks.map(e => ({
				label: e.name,
				detail: `legacy: ${e.legacyId.slice(0, 8)}…`,
			})),
			severity: c.brokenEmployeeWorkerLinks.length > 0 ? 'error' : 'ok',
		},
	];

	const errors   = checks.filter(ch => ch.severity === 'error').length;
	const warnings = checks.filter(ch => ch.severity === 'warning').length;
	const passing  = checks.filter(ch => ch.severity === 'ok').length;

	return (
		<div className="space-y-4">
			{/* Summary */}
			<div className="flex items-center gap-5 text-sm">
				<span className="flex items-center gap-1.5 text-emerald-400">
					<CheckCircle2 className="h-4 w-4" />{passing} OK
				</span>
				{warnings > 0 && (
					<span className="flex items-center gap-1.5 text-amber-400">
						<AlertTriangle className="h-4 w-4" />{warnings} aviso{warnings > 1 ? 's' : ''}
					</span>
				)}
				{errors > 0 && (
					<span className="flex items-center gap-1.5 text-red-400">
						<XCircle className="h-4 w-4" />{errors} error{errors > 1 ? 'es' : ''}
					</span>
				)}
			</div>

			{/* Check cards */}
			<div className="space-y-3">
				{checks.map(check => {
					const ok = check.severity === 'ok';
					const isWarn = check.severity === 'warning';
					const borderCls = ok
						? 'border-border/40'
						: isWarn
							? 'border-amber-500/30 bg-amber-500/5'
							: 'border-red-500/30 bg-red-500/5';
					const iconEl = ok
						? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
						: isWarn
							? <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
							: <XCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />;
					const badgeCls = ok
						? 'text-emerald-400 border-emerald-500/40'
						: isWarn
							? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
							: 'bg-red-500/15 text-red-400 border-red-500/40';

					return (
						<Card key={check.id} className={`border ${borderCls}`}>
							<CardContent className="pt-4 pb-3">
								<div className="flex items-start justify-between gap-3">
									<div className="flex items-start gap-2.5 min-w-0">
										{iconEl}
										<div className="min-w-0">
											<p className="text-sm font-medium text-foreground">{check.label}</p>
											<p className="text-xs text-muted-foreground mt-0.5">{check.description}</p>
											<span className="inline-flex text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground mt-1.5">
												{check.modules}
											</span>
										</div>
									</div>
									<span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${badgeCls}`}>
										{ok ? 'OK' : `${check.items.length} problema${check.items.length !== 1 ? 's' : ''}`}
									</span>
								</div>

								{!ok && check.items.length > 0 && (
									<div className="mt-3 pl-7 space-y-0.5">
										{check.items.slice(0, 8).map((item, i) => (
											<div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
												<span className="font-medium text-foreground/80">{item.label}</span>
												{item.detail && (
													<span className="text-muted-foreground font-mono text-[11px] ml-3">{item.detail}</span>
												)}
											</div>
										))}
										{check.items.length > 8 && (
											<p className="text-xs text-muted-foreground pt-1">y {check.items.length - 8} más…</p>
										)}
									</div>
								)}
							</CardContent>
						</Card>
					);
				})}
			</div>
		</div>
	);
}

// ── Root component ───────────────────────────────────────────────────────────

export default function AppDiagnostics() {
	const [tab, setTab] = useState<TabId>('health');

	const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery<DiagnosticsData>({
		queryKey: ['admin-diagnostics'],
		queryFn: async () => {
			const res = await fetch('/api/admin/diagnostics', { credentials: 'include' });
			if (!res.ok) {
				const payload = await res.json().catch(() => null);
				throw new Error(payload?.error ?? 'Failed to load diagnostics');
			}
			return res.json();
		},
		staleTime: 60_000,
		refetchOnWindowFocus: false,
	});

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Diagnósticos de Aplicación</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Métricas, webhooks, seguridad y logs de actividad — últimos 14 días
					</p>
				</div>
				<div className="flex items-center gap-3">
					{dataUpdatedAt > 0 && (
						<span className="text-xs text-muted-foreground flex items-center gap-1">
							<Clock className="h-3 w-3" />
							{new Date(dataUpdatedAt).toLocaleTimeString('es-CL')}
						</span>
					)}
					<Button
						variant="outline"
						size="sm"
						onClick={() => refetch()}
						disabled={isFetching}
						className="gap-1.5"
					>
						<RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
						Actualizar
					</Button>
				</div>
			</div>

			{/* Status bar */}
			{data && (
				<div className="flex items-center gap-4 text-xs text-muted-foreground border rounded-md px-4 py-2 bg-muted/30">
					<StatusDot status={data.health.db.status} />
					<span>DB {data.health.db.status === 'ok' ? 'online' : 'offline'}</span>
					{data.health.db.latencyMs !== null && <LatencyPill ms={data.health.db.latencyMs} />}
					<span className="mx-2 text-border">|</span>
					<Eye className="h-3.5 w-3.5" />
					<span>Generado: {fmt(data.generatedAt)}</span>
					{data.security.inactiveUsers.length > 0 && (
						<>
							<span className="mx-2 text-border">|</span>
							<AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
							<span className="text-amber-400">
								{data.security.inactiveUsers.length} usuario(s) inactivo(s)
							</span>
						</>
					)}
					{(() => {
						const c = data.crossModuleChecks;
						const issues =
							c.machineWorkerNameCollisions.length +
							c.duplicateWorkers.length +
							c.workersWithoutEmployee.length +
							c.orphanAssignments.length +
							c.brokenEmployeeWorkerLinks.length;
						return issues > 0 ? (
							<>
								<span className="mx-2 text-border">|</span>
								<Link2 className="h-3.5 w-3.5 text-orange-400" />
								<span className="text-orange-400">{issues} incoherencia{issues !== 1 ? 's' : ''} entre módulos</span>
							</>
						) : null;
					})()}
				</div>
			)}

			{/* Tabs */}
			<div className="flex gap-1 border-b border-border">
				{TABS.map(({ id, label, icon: Icon }) => {
					const active = tab === id;
					return (
						<button
							key={id}
							onClick={() => setTab(id)}
							className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
								active
									? 'border-primary text-foreground'
									: 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
							}`}
						>
							<Icon className="h-3.5 w-3.5" />
							{label}
						</button>
					);
				})}
			</div>

			{/* Content */}
			{isLoading && (
				<div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
					<RefreshCw className="h-5 w-5 animate-spin" />
					<span>Cargando diagnósticos…</span>
				</div>
			)}
			{isError && (
				<Card className="border-red-500/30 bg-red-500/5">
					<CardContent className="pt-6 flex items-center gap-3 text-red-400">
						<XCircle className="h-5 w-5 flex-shrink-0" />
						<p className="text-sm">Error al cargar diagnósticos. Verifica las claves de Supabase y vuelve a intentarlo.</p>
					</CardContent>
				</Card>
			)}
			{data && tab === 'health'    && <HealthPanel    data={data} />}
			{data && tab === 'webhooks'  && <WebhooksPanel  data={data} />}
			{data && tab === 'security'  && <SecurityPanel  data={data} />}
			{data && tab === 'logs'      && <LogsPanel      data={data} />}
			{data && tab === 'coherence' && <CoherencePanel data={data} />}
		</div>
	);
}
