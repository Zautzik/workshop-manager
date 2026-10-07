import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, CheckCircle2, XCircle, TrendingUp, Cpu, Users } from 'lucide-react';
import type { DiagnosticsData } from './types';
import { LatencyPill } from './shared';

export function HealthPanel({ data }: { data: DiagnosticsData }) {
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
