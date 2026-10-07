import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Plug, Wifi, WifiOff } from 'lucide-react';
import type { DiagnosticsData } from './types';
import { fmt, ReviewBadge } from './shared';

export function WebhooksPanel({ data }: { data: DiagnosticsData }) {
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
