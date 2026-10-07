import { Card, CardContent } from '@/components/ui/card';
import type { DiagnosticsData } from './types';
import { fmt } from './shared';

export function LogsPanel({ data }: { data: DiagnosticsData }) {
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
