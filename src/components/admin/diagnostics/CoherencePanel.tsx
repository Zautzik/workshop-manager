import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { DiagnosticsData } from './types';

export function CoherencePanel({ data }: { data: DiagnosticsData }) {
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
			id: 'duplicate-employees',
			label: 'Personas repetidas',
			description: 'El mismo nombre en más de una ficha — las horas y las competencias se reparten entre las copias',
			modules: 'Personas interno',
			items: c.duplicateEmployees.map(e => ({ label: e.name, detail: `${e.count} fichas` })),
			severity: c.duplicateEmployees.length > 0 ? 'error' : 'ok',
		},
		{
			id: 'employees-without-rate',
			label: 'Personas vigentes sin tarifa',
			description: 'Primer eslabón del hilo dorado roto: sin tarifa sus horas cuestan cero y toda OT en la que trabajen sale más barata de lo que es',
			modules: 'Personas → Costos',
			items: c.employeesWithoutRate.map(e => ({ label: e.name })),
			severity: c.employeesWithoutRate.length > 0 ? 'error' : 'ok',
		},
		{
			id: 'employees-without-account',
			label: 'Personas vigentes sin cuenta',
			description: 'No pueden entrar a la app, así que no registran nada por sí mismas: alguien marca y captura por ellas',
			modules: 'Personas → Acceso',
			items: c.employeesWithoutAccount.map(e => ({ label: e.name })),
			severity: c.employeesWithoutAccount.length > 0 ? 'warning' : 'ok',
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
