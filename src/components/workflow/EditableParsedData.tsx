'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PROCESOS_CONOCIDOS } from '@/lib/whatsapp-flow';
import type { EditableData } from '@/lib/review-edits';

type NumField = 'pliegos_produced' | 'merma' | 'buenos' | 'hours_reported' | 'ajuste_minutes';

const CAMPOS: { key: NumField; label: string; hint?: string }[] = [
	{ key: 'pliegos_produced', label: 'Pliegos producidos', hint: 'Recalcula papel y tinta' },
	{ key: 'merma', label: 'Merma', hint: 'Recalcula papel' },
	{ key: 'buenos', label: 'Buenos' },
	{ key: 'hours_reported', label: 'Horas', hint: 'Van a la etapa en el tablero' },
	{ key: 'ajuste_minutes', label: 'Ajuste (min)', hint: 'Sólo en offset' },
];

/**
 * Lo que el parser leyó del mensaje, editable. Es lo que decide qué etapa se
 * cierra, con cuántas horas, y a dónde va la OT: corregirlo acá es corregir lo
 * que «Editar e Integrar» le hace al tablero, no sólo a los costos.
 */
export function EditableParsedData({
	data,
	onChange,
}: {
	data: EditableData;
	onChange: (data: EditableData) => void;
}) {
	const setNum = (key: NumField, raw: string) => {
		const t = raw.trim().replace(',', '.');
		const x = t === '' ? null : Number(t);
		onChange({ ...data, [key]: x != null && Number.isFinite(x) && x >= 0 ? x : null });
	};

	const toggleProceso = (p: string) =>
		onChange({
			...data,
			processes_mentioned: data.processes_mentioned.includes(p)
				? data.processes_mentioned.filter((x) => x !== p)
				: [...data.processes_mentioned, p],
		});

	return (
		<div className="space-y-3">
			<div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
				{CAMPOS.map(({ key, label, hint }) => (
					<label key={key} className="space-y-1">
						<span className="text-xs text-muted-foreground font-medium block">{label}</span>
						<Input
							type="number"
							min={0}
							step="any"
							value={data[key] ?? ''}
							placeholder="—"
							onChange={(e) => setNum(key, e.target.value)}
							className="h-8 text-right font-mono"
						/>
						{hint && <span className="text-[10px] text-muted-foreground block">{hint}</span>}
					</label>
				))}
			</div>

			<div>
				<p className="text-xs text-muted-foreground font-medium mb-1">
					Procesos — deciden a qué etapa corresponde el parte y a dónde avanza la OT
				</p>
				<div className="flex flex-wrap gap-1">
					{PROCESOS_CONOCIDOS.map((p) => {
						const on = data.processes_mentioned.includes(p);
						return (
							<button
								key={p}
								type="button"
								onClick={() => toggleProceso(p)}
								aria-pressed={on}
								className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
									on
										? 'bg-primary text-primary-foreground border-primary'
										: 'bg-transparent text-muted-foreground border-border hover:bg-muted'
								}`}
							>
								{p.replace(/_/g, ' ')}
							</button>
						);
					})}
				</div>
			</div>

			<label className="block space-y-1">
				<span className="text-xs text-muted-foreground font-medium block">Problemas reportados (uno por línea)</span>
				<Textarea
					rows={2}
					value={data.problems_reported.join('\n')}
					onChange={(e) =>
						onChange({ ...data, problems_reported: e.target.value.split('\n') })
					}
					placeholder="Sin problemas"
				/>
			</label>
		</div>
	);
}
