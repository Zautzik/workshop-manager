'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
	Activity, Shield, Webhook, RefreshCw,
	XCircle, AlertTriangle, Clock, Eye, FileText, Link2,
} from 'lucide-react';
import type { DiagnosticsData } from './diagnostics/types';
import { fmt, StatusDot, LatencyPill } from './diagnostics/shared';
import { HealthPanel } from './diagnostics/HealthPanel';
import { WebhooksPanel } from './diagnostics/WebhooksPanel';
import { SecurityPanel } from './diagnostics/SecurityPanel';
import { LogsPanel } from './diagnostics/LogsPanel';
import { CoherencePanel } from './diagnostics/CoherencePanel';

// ── Tab IDs ──────────────────────────────────────────────────────────────────

type TabId = 'health' | 'webhooks' | 'security' | 'logs' | 'coherence';

const TABS: { id: TabId; label: string; icon: typeof Activity }[] = [
	{ id: 'health',    label: 'Salud del Sistema',  icon: Activity },
	{ id: 'webhooks',  label: 'Webhooks',            icon: Webhook  },
	{ id: 'security',  label: 'Seguridad',           icon: Shield   },
	{ id: 'logs',      label: 'Logs de Actividad',   icon: FileText },
	{ id: 'coherence', label: 'Coherencia',           icon: Link2    },
];

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

			{/* Consultas que fallaron de verdad — antes esto se veía idéntico a
			    "todo en cero" en esta misma pantalla. Va primero, arriba de todo:
			    si el propio diagnóstico no pudo mirar algo, es lo primero que hay
			    que saber antes de confiar en cualquier otro número de abajo. */}
			{data && data.queryErrors.length > 0 && (
				<div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
					<XCircle className="h-4 w-4 shrink-0 mt-0.5" />
					<div>
						<p className="font-semibold">
							{data.queryErrors.length} consulta{data.queryErrors.length === 1 ? '' : 's'} de este diagnóstico falló{data.queryErrors.length === 1 ? '' : 'ron'} — los números que dependen de ella{data.queryErrors.length === 1 ? '' : 's'} pueden estar en cero sin que eso signifique &ldquo;sin datos&rdquo;.
						</p>
						<ul className="mt-1 space-y-0.5 font-mono text-xs opacity-90">
							{data.queryErrors.map((e, i) => <li key={i}>{e}</li>)}
						</ul>
					</div>
				</div>
			)}

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
							c.duplicateEmployees.length +
							c.employeesWithoutAccount.length +
							c.employeesWithoutRate.length;
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
