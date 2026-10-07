import { Badge } from '@/components/ui/badge';

export function fmt(iso: string | null) {
	if (!iso) return '—';
	return new Date(iso).toLocaleString('es-CL', {
		day: '2-digit', month: '2-digit', year: '2-digit',
		hour: '2-digit', minute: '2-digit',
	});
}

export function StatusDot({ status }: { status: 'ok' | 'error' | 'active' | 'inactive' | 'warning' }) {
	const cls =
		status === 'ok' || status === 'active'
			? 'bg-emerald-500'
			: status === 'warning'
				? 'bg-amber-500'
				: 'bg-red-500';
	return <span className={`inline-block w-2 h-2 rounded-full ${cls} mr-2`} />;
}

export function LatencyPill({ ms }: { ms: number | null }) {
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

export function ReviewBadge({ status }: { status: string }) {
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
