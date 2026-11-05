'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCLP } from '@/lib/whatsapp-cost-inference';
import { newDraftLine, type DraftLine } from '@/lib/review-edits';

/**
 * La misma tabla que `CostLineTable`, pero editable. El total de cada línea se
 * recalcula (cantidad × $/u) — es lo que `apply_capture_event` vuelve
 * a leer, y un total escrito a mano que no cuadre con sus factores sería un
 * costo que nadie puede reconstruir después. Tocar una línea la marca como
 * manual: desde ahí, corregir los pliegos ya no la recalcula.
 */
export function EditableCostLineTable({
	lines,
	onChange,
}: {
	lines: DraftLine[];
	onChange: (lines: DraftLine[]) => void;
}) {
	const update = (key: string, patch: Partial<DraftLine>) => {
		onChange(
			lines.map((l) => {
				if (l._key !== key) return l;
				const next = { ...l, ...patch, _manual: true };
				return { ...next, total_cost: Math.round(next.quantity * next.unit_cost) };
			}),
		);
	};

	const num = (v: string) => {
		const x = Number(v.replace(',', '.'));
		return Number.isFinite(x) && x >= 0 ? x : 0;
	};

	return (
		<div className="space-y-2">
			<div className="rounded-lg border border-border overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="bg-muted/50">
							<th className="text-left p-2 font-medium">Concepto</th>
							<th className="text-right p-2 font-medium w-24">Cant.</th>
							<th className="text-right p-2 font-medium w-16">Unid.</th>
							<th className="text-right p-2 font-medium w-28">$/u</th>
							<th className="text-right p-2 font-medium">Total</th>
							<th className="p-2 w-10" />
						</tr>
					</thead>
					<tbody>
						{lines.map((line) => (
							<tr key={line._key} className="border-t border-border/50">
								<td className="p-1">
									<Input
										value={line.description}
										onChange={(e) => update(line._key, { description: e.target.value })}
										placeholder="Descripción"
										className="h-8"
									/>
								</td>
								<td className="p-1">
									<Input
										type="number"
										min={0}
										step="any"
										value={line.quantity}
										onChange={(e) => update(line._key, { quantity: num(e.target.value) })}
										className="h-8 text-right font-mono"
									/>
								</td>
								<td className="p-1">
									<Input
										value={line.unit}
										onChange={(e) => update(line._key, { unit: e.target.value })}
										className="h-8 text-right"
									/>
								</td>
								<td className="p-1">
									<Input
										type="number"
										min={0}
										step="any"
										value={line.unit_cost}
										onChange={(e) => update(line._key, { unit_cost: num(e.target.value) })}
										className="h-8 text-right font-mono"
									/>
								</td>
								<td className="p-2 text-right font-mono font-medium whitespace-nowrap">
									{formatCLP(line.total_cost)}
								</td>
								<td className="p-1 text-center">
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-8 w-8 text-muted-foreground hover:text-destructive"
										onClick={() => onChange(lines.filter((l) => l._key !== line._key))}
										aria-label="Quitar línea"
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr className="border-t-2 border-border bg-muted/30">
							<td colSpan={4} className="p-2 font-semibold">Total corregido</td>
							<td className="p-2 text-right font-mono font-bold text-lg whitespace-nowrap">
								{formatCLP(lines.reduce((s, l) => s + l.total_cost, 0))}
							</td>
							<td />
						</tr>
					</tfoot>
				</table>
			</div>
			<Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, newDraftLine()])} className="gap-1">
				<Plus className="h-4 w-4" />
				Agregar línea
			</Button>
		</div>
	);
}
