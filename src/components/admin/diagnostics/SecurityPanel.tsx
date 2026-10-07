import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Users, CheckCircle2 } from 'lucide-react';
import type { DiagnosticsData } from './types';
import { fmt } from './shared';

export function SecurityPanel({ data }: { data: DiagnosticsData }) {
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
