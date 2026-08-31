'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMovementTypes, useUpdateMovementType, type MovementType } from '@/hooks/use-movement-types';
import { Save, ArrowDownToLine, ArrowUpFromLine, Info } from 'lucide-react';

/**
 * Qué significa cada tipo de movimiento de inventario — editable acá en vez
 * de por SQL.
 *
 * Chico a propósito: `label`, `active`, `requires_ot` y `sort_order` son
 * campos seguros (una edición equivocada se corrige con otra edición).
 * `direction` se MUESTRA, no se edita — cambiarla invertiría el signo de
 * todo movimiento futuro de ese tipo contra el stock disponible, y `code`
 * sigue acotado por un enum de Postgres: un tipo genuinamente nuevo pide una
 * migración (ALTER TYPE + una fila), no un botón acá.
 */
export function MovementTypesManager() {
	const { data: types = [], isLoading, isError } = useMovementTypes();
	const update = useUpdateMovementType();

	type Draft = Pick<MovementType, 'label' | 'active' | 'requires_ot' | 'sort_order'>;
	const [drafts, setDrafts] = useState<Record<string, Draft>>({});
	// Se llena UNA vez, cuando la carga inicial llega — no en cada refetch en
	// segundo plano, que borraría una edición sin guardar todavía. Ajustar
	// estado condicionalmente durante el render es el patrón que React
	// recomienda para esto en vez de un useEffect con setState síncrono.
	const [initialized, setInitialized] = useState(false);
	if (!initialized && types.length > 0) {
		setInitialized(true);
		setDrafts(
			Object.fromEntries(
				types.map((t): [string, Draft] => [
					t.code,
					{ label: t.label, active: t.active, requires_ot: t.requires_ot, sort_order: t.sort_order },
				]),
			),
		);
	}

	if (isLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>;
	if (isError) return <p className="text-sm text-destructive py-8 text-center">No se pudieron cargar los tipos de movimiento.</p>;

	const isDirty = (t: MovementType) => {
		const d = drafts[t.code];
		if (!d) return false;
		return d.label !== t.label || d.active !== t.active || d.requires_ot !== t.requires_ot || d.sort_order !== t.sort_order;
	};

	const save = async (t: MovementType) => {
		const d = drafts[t.code];
		if (!d) return;
		try {
			await update.mutateAsync({ code: t.code, ...d });
			toast.success(`"${d.label}" guardado`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
		}
	};

	return (
		<div className="space-y-3">
			<p className="text-xs text-muted-foreground flex items-start gap-1.5 max-w-2xl">
				<Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
				La dirección (suma/resta stock) no es editable acá: cambiarla invertiría el signo de todo
				movimiento futuro de este tipo. Un tipo de movimiento genuinamente nuevo necesita una
				migración — pedila y se agrega.
			</p>

			<div className="overflow-x-auto rounded-lg border">
				<table className="w-full text-sm border-collapse">
					<thead>
						<tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
							<th className="py-2 px-3 font-medium">Código</th>
							<th className="py-2 px-3 font-medium">Etiqueta</th>
							<th className="py-2 px-3 font-medium text-center">Dirección</th>
							<th className="py-2 px-3 font-medium text-center">Exige OT</th>
							<th className="py-2 px-3 font-medium text-center">Activo</th>
							<th className="py-2 px-3 font-medium text-center">Orden</th>
							<th className="py-2 px-3 font-medium text-right">&nbsp;</th>
						</tr>
					</thead>
					<tbody>
						{types.map((t, i) => {
							const d = drafts[t.code];
							if (!d) return null;
							const dirty = isDirty(t);
							return (
								<tr key={t.code} className={cn('border-b last:border-0', i % 2 === 1 && 'bg-muted/20', !t.active && 'opacity-60')}>
									<td className="py-1.5 px-3 font-mono text-xs text-muted-foreground">{t.code}</td>
									<td className="py-1.5 px-3">
										<Input
											value={d.label}
											onChange={(e) => setDrafts((p) => ({ ...p, [t.code]: { ...p[t.code], label: e.target.value } }))}
											className="h-7 text-sm max-w-56"
										/>
									</td>
									<td className="py-1.5 px-3 text-center">
										<Badge
											variant="outline"
											className={cn(
												'text-xs gap-1',
												t.direction === 'in' ? 'text-emerald-600 border-emerald-500/40' : 'text-rose-600 border-rose-500/40',
											)}
										>
											{t.direction === 'in' ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowUpFromLine className="h-3 w-3" />}
											{t.direction === 'in' ? 'Suma' : 'Resta'}
										</Badge>
									</td>
									<td className="py-1.5 px-3 text-center">
										<Checkbox
											checked={d.requires_ot}
											onCheckedChange={(v) => setDrafts((p) => ({ ...p, [t.code]: { ...p[t.code], requires_ot: !!v } }))}
										/>
									</td>
									<td className="py-1.5 px-3 text-center">
										<Checkbox
											checked={d.active}
											onCheckedChange={(v) => setDrafts((p) => ({ ...p, [t.code]: { ...p[t.code], active: !!v } }))}
										/>
									</td>
									<td className="py-1.5 px-3 text-center">
										<Input
											type="number"
											min={0}
											max={999}
											value={d.sort_order}
											onChange={(e) => setDrafts((p) => ({ ...p, [t.code]: { ...p[t.code], sort_order: Number(e.target.value) } }))}
											className="h-7 text-sm w-16 mx-auto text-center"
										/>
									</td>
									<td className="py-1.5 px-3 text-right">
										<Button
											size="sm"
											variant={dirty ? 'default' : 'outline'}
											className="h-7 gap-1 text-xs"
											disabled={!dirty || update.isPending}
											onClick={() => save(t)}
										>
											<Save className="h-3 w-3" />Guardar
										</Button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}
