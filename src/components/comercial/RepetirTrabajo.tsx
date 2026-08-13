'use client';

/**
 * «¿Es una repetición?» — la primera pregunta, no la última.
 *
 * La mayoría de los trabajos de una imprenta son repeticiones. La llamada
 * normal no es «necesito cotizar una etiqueta nueva», es «lo mismo del mes
 * pasado pero 150.000». Poner esta pregunta al final —o no ponerla— obliga al
 * vendedor a reconstruir a mano un trabajo que el sistema ya conoce.
 *
 * La lógica —qué sirve de precedente, cómo se busca, qué se hereda y cómo se
 * compara el precio— vive en `job-precedent.ts`, con pruebas. Acá sólo se
 * muestra.
 *
 * La regla que importa: se copia el trabajo, NUNCA el precio. El papel de hace
 * ocho meses no vale lo de hoy. Lo que sí se muestra es la deriva, para que el
 * vendedor tenga el motivo a mano antes de llamar en vez de descubrirlo cuando
 * el cliente reclama.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw, TrendingDown, TrendingUp } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { formatCLP } from '@/lib/format';
import { matchJobs, priceDrift, specFrom, type PastJob, type PrecedentSpec } from '@/lib/job-precedent';

function usePastJobs() {
	return useQuery<PastJob[]>({
		queryKey: ['precedentes'],
		queryFn: async () => {
			const res = await fetch('/api/ots?limit=300', { credentials: 'include' });
			if (!res.ok) return [];
			const payload = await res.json();
			return (Array.isArray(payload) ? payload : payload?.data ?? []) as PastJob[];
		},
		staleTime: 5 * 60_000,
	});
}

interface Props {
	onAplicar: (spec: PrecedentSpec) => void;
	/** Para poder decir cuánto cambió el precio del mismo trabajo. */
	precioActual?: number;
	cantidadActual?: number;
}

export function RepetirTrabajo({ onAplicar, precioActual, cantidadActual }: Props) {
	const [term, setTerm] = useState('');
	const [aplicado, setAplicado] = useState<PastJob | null>(null);
	const { data: todos = [] } = usePastJobs();

	const coincidencias = useMemo(() => matchJobs(todos, term), [todos, term]);

	const deriva = useMemo(
		() =>
			aplicado
				? priceDrift({
						pastTotal: aplicado.total_price,
						pastQuantity: aplicado.quantity,
						nowTotal: precioActual,
						nowQuantity: cantidadActual,
					})
				: null,
		[aplicado, precioActual, cantidadActual],
	);

	const aplicar = (job: PastJob) => {
		onAplicar(specFrom(job));
		setAplicado(job);
		setTerm('');
	};

	return (
		<div className="mb-3 rounded-lg border border-primary/25 bg-primary/[0.04] p-2">
			{/* Una sola línea. El párrafo que explicaba qué hace ocupaba sesenta
			    píxeles en el borde superior del formulario, y lo que explicaba se
			    entiende con el título y el marcador de posición del campo. Lo que
			    hay que decir de verdad —que el precio se recalcula— aparece cuando
			    hace falta: al aplicar un precedente. */}
			<div className="relative">
				<RotateCcw className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary" />
				<Input
					value={term}
					onChange={(e) => setTerm(e.target.value)}
					placeholder="¿Es una repetición? Cliente, producto o número de OT…"
					className="h-9 pl-8 text-sm"
					aria-label="Buscar un trabajo anterior para heredar sus especificaciones"
				/>
			</div>

			{coincidencias.length > 0 && (
				<ul className="mt-2 space-y-1">
					{coincidencias.map((o) => (
						<li key={o.id}>
							<button
								type="button"
								onClick={() => aplicar(o)}
								className="flex w-full flex-wrap items-baseline gap-x-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-xs transition-colors hover:border-primary/50 hover:bg-primary/5"
							>
								<span className="font-mono font-semibold text-foreground">{o.ot_number}</span>
								<span className="truncate text-muted-foreground">{o.client_name}</span>
								<span className="truncate text-foreground">{o.product_name}</span>
								<span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
									{Number(o.quantity).toLocaleString('es-CL')} u
									{o.total_price ? ` · ${formatCLP(o.total_price)}` : ''}
								</span>
							</button>
						</li>
					))}
				</ul>
			)}

			{term.trim() !== '' && coincidencias.length === 0 && (
				<p className="mt-2 text-xs text-muted-foreground">
					Ningún trabajo anterior coincide. Si es nuevo, seguí con el formulario de abajo.
				</p>
			)}

			{aplicado && (
				<div className="mt-2.5 border-t border-primary/20 pt-2.5">
					<p className="text-xs text-muted-foreground">
						Se heredaron las especificaciones; el precio se recalcula con las tarifas de
						hoy. Viene de la{' '}
						<span className="font-mono font-semibold text-foreground">{aplicado.ot_number}</span>
						{aplicado.total_price ? (
							<> — entonces se cobró {formatCLP(aplicado.total_price)} por {Number(aplicado.quantity).toLocaleString('es-CL')} unidades.</>
						) : '.'}
					</p>
					{deriva?.note && (
						<p
							className={`mt-1 flex items-start gap-1.5 text-xs leading-relaxed ${
								deriva.direction === 'sube'
									? 'text-amber-700 dark:text-amber-400'
									: 'text-muted-foreground'
							}`}
						>
							{deriva.direction === 'sube' ? (
								<TrendingUp className="mt-0.5 h-3 w-3 shrink-0" />
							) : deriva.direction === 'baja' ? (
								<TrendingDown className="mt-0.5 h-3 w-3 shrink-0" />
							) : null}
							<span>{deriva.note}</span>
						</p>
					)}
				</div>
			)}
		</div>
	);
}
