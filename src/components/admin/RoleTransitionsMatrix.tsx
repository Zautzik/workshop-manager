'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { OTStatusSchema } from '@/lib/ot-state-machine';
import { otStatusLabel, otStatusColor } from '@/lib/status-labels';
import type { AppRole } from '@/types/app-role';
import { RotateCcw, Save } from 'lucide-react';

/**
 * A qué estado puede mover una OT cada rol — editable acá en vez de por SQL.
 *
 * Esta pantalla ES `ot_role_transitions` (ver 20260901100000_..._rol.sql y
 * src/lib/transition-rules.ts). "Guardar" reemplaza la tabla entera por lo
 * que se ve acá: la semántica de la tabla es todo-o-nada, así que un
 * guardado parcial no tiene una forma honesta de existir.
 *
 * Las cinco compuertas de negocio (ficha completa, visto bueno, desviación de
 * precio, requisitos, cierre de etapa) NO viven acá — siguen en código, a
 * propósito. Esto sólo configura A DÓNDE puede llegar cada rol.
 */

const ROLES: readonly AppRole[] = ['admin', 'supervisor', 'manager', 'hr_manager', 'technician', 'vendedor'];

const ROLE_LABEL: Record<AppRole, string> = {
	admin: 'Admin',
	supervisor: 'Supervisor',
	manager: 'Gerencia',
	hr_manager: 'RR.HH.',
	technician: 'Técnico',
	vendedor: 'Vendedor',
};

const STATUSES = OTStatusSchema.options;

interface Row {
	role: string;
	to_status: string;
}

const key = (role: string, status: string) => `${role}:${status}`;

export function RoleTransitionsMatrix() {
	const qc = useQueryClient();
	const { data, isLoading, isError } = useQuery<{ rows: Row[] }>({
		queryKey: ['admin', 'role-transitions'],
		queryFn: async () => {
			const res = await fetch('/api/admin/role-transitions', { credentials: 'include' });
			if (!res.ok) throw new Error('No se pudo cargar la configuración');
			return res.json();
		},
	});

	const original = useMemo(() => new Set((data?.rows ?? []).map((r) => key(r.role, r.to_status))), [data]);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [saving, setSaving] = useState(false);

	// Se sincroniza cuando llega la carga inicial (o tras guardar y refetch),
	// no en cada render — si no, cualquier edición sin guardar se perdería
	// apenas React Query revalidara la query en segundo plano.
	useEffect(() => {
		if (data) setSelected(new Set(original));
	}, [data, original]);

	const dirty = useMemo(() => {
		if (selected.size !== original.size) return true;
		for (const k of selected) if (!original.has(k)) return true;
		return false;
	}, [selected, original]);

	const toggle = (role: AppRole, status: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			const k = key(role, status);
			if (next.has(k)) next.delete(k);
			else next.add(k);
			return next;
		});
	};

	const toggleColumn = (role: AppRole) => {
		const roleKeys = STATUSES.map((s) => key(role, s));
		const allOn = roleKeys.every((k) => selected.has(k));
		setSelected((prev) => {
			const next = new Set(prev);
			for (const k of roleKeys) (allOn ? next.delete(k) : next.add(k));
			return next;
		});
	};

	const revert = () => setSelected(new Set(original));

	const save = async () => {
		setSaving(true);
		try {
			const rows = [...selected].map((k) => {
				const [role, to_status] = k.split(':');
				return { role, to_status };
			});
			const res = await fetch('/api/admin/role-transitions', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ rows }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				throw new Error(body?.error ?? 'No se pudo guardar');
			}
			await qc.invalidateQueries({ queryKey: ['admin', 'role-transitions'] });
			toast.success('Reglas de flujo guardadas');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
		} finally {
			setSaving(false);
		}
	};

	if (isLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>;
	if (isError) return <p className="text-sm text-destructive py-8 text-center">No se pudo cargar la configuración.</p>;

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-3 flex-wrap">
				<p className="text-xs text-muted-foreground max-w-2xl">
					Marcado = ese rol puede mover una OT a ese estado. Las compuertas de negocio (ficha
					completa, visto bueno, precio, requisitos, cierre de etapa) siguen aplicando igual —
					esto sólo decide quién puede intentarlo.
				</p>
				<div className="flex items-center gap-2 shrink-0">
					{dirty && <Badge variant="outline" className="text-amber-600 border-amber-500/40 text-xs">Sin guardar</Badge>}
					<Button size="sm" variant="outline" className="gap-1.5" onClick={revert} disabled={!dirty || saving}>
						<RotateCcw className="h-3.5 w-3.5" />Descartar
					</Button>
					<Button size="sm" className="gap-1.5" onClick={save} disabled={!dirty || saving}>
						<Save className="h-3.5 w-3.5" />{saving ? 'Guardando…' : 'Guardar'}
					</Button>
				</div>
			</div>

			<div className="overflow-x-auto rounded-lg border">
				<table className="w-full text-sm border-collapse">
					<thead>
						<tr className="border-b bg-muted/40">
							<th className="text-left font-medium text-xs text-muted-foreground py-2 px-3 sticky left-0 bg-muted/40">
								Estado
							</th>
							{ROLES.map((role) => (
								<th key={role} className="text-center font-medium text-xs py-2 px-2 min-w-[84px]">
									<button
										type="button"
										onClick={() => toggleColumn(role)}
										className="hover:text-primary transition-colors"
										title={`Marcar/desmarcar todo para ${ROLE_LABEL[role]}`}
									>
										{ROLE_LABEL[role]}
									</button>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{STATUSES.map((status, i) => (
							<tr key={status} className={cn('border-b last:border-0', i % 2 === 1 && 'bg-muted/20')}>
								<td className="py-1.5 px-3 sticky left-0 bg-inherit">
									<div className="flex items-center gap-1.5">
										<span className={cn('h-2 w-2 rounded-full shrink-0', otStatusColor(status))} />
										<span className="text-xs">{otStatusLabel(status)}</span>
									</div>
								</td>
								{ROLES.map((role) => (
									<td key={role} className="text-center py-1.5 px-2">
										<Checkbox
											checked={selected.has(key(role, status))}
											onCheckedChange={() => toggle(role, status)}
										/>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
