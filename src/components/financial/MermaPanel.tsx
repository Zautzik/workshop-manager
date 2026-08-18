'use client';

/**
 * La merma, que es el número que un jefe de taller mira antes que el margen.
 *
 * Forma: la tasa de merma es una RAZÓN CONTRA UN LÍMITE, no una magnitud
 * suelta, así que cada trabajo va como barra con la banda de la industria
 * marcada encima. Una barra sin su límite no dice nada: 4% puede ser excelente
 * o pésimo según el tamaño del tiraje, y esa comparación es justo lo que la
 * pantalla tiene que hacer visible sin que nadie calcule.
 *
 * Color: aquí es ESTADO —normal, alta, crítica—, no identidad. Por eso usa la
 * paleta de estado y no las series categóricas, y siempre acompañado de la
 * etiqueta: el color nunca carga el significado solo.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info, Layers } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TrabajoMerma {
	ot: string;
	ot_id: string | null;
	partes: number;
	operarios: string[];
	merma: number;
	pliegos: number;
	rate: number;
	level: 'normal' | 'alta' | 'critica' | 'sin_datos';
	note: string | null;
	band: 'corto' | 'medio' | 'largo' | null;
}

interface MermaResponse {
	trabajos: TrabajoMerma[];
	total: { rate: number | null; merma: number; pliegos: number; level: string };
	diagnostics: {
		partes_produccion: number;
		partes_con_cifras: number;
		partes_sin_ot: number;
		blocked: boolean;
		reasons: string[];
	};
}

/** Estado, no identidad: verde/ámbar/rojo con etiqueta, nunca color solo. */
const NIVEL = {
	normal: { label: 'Normal', fill: '#0ca30c', text: 'text-emerald-700 dark:text-emerald-400' },
	alta: { label: 'Alta', fill: '#fab219', text: 'text-amber-700 dark:text-amber-400' },
	critica: { label: 'Crítica', fill: '#d03b3b', text: 'text-red-700 dark:text-red-400' },
	sin_datos: { label: 'Sin datos', fill: '#898781', text: 'text-muted-foreground' },
} as const;

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

function useMerma() {
	return useQuery<MermaResponse>({
		queryKey: ['merma'],
		queryFn: async () => {
			const res = await fetch('/api/analytics/merma', { credentials: 'include' });
			if (!res.ok) throw new Error('No se pudo cargar la merma');
			return res.json();
		},
	});
}

/** Cuántos se muestran antes de pedir «ver todos». */
const VISIBLES = 5;

export function MermaPanel({ onSelect }: { onSelect?: (q: string) => void }) {
	const { data, isLoading } = useMerma();

	// El `?? []` acuña un arreglo nuevo en cada render, así que sin memo la
	// dependencia del useMemo de abajo cambiaría siempre y no memorizaría nada.
	const trabajos = useMemo(() => data?.trabajos ?? [], [data?.trabajos]);
	const diag = data?.diagnostics;

	/** La escala se estira hasta el peor caso, con un mínimo para que un taller
	 *  sano no dibuje barras microscópicas. */
	const max = useMemo(
		() => Math.max(0.12, ...trabajos.map((t) => t.rate)),
		[trabajos],
	);
	const [todos, setTodos] = useState(false);
	// La API ya entrega `trabajos` ordenado por tasa descendente (peor primero);
	// acá sólo se decide cuánto mostrar por defecto.
	const mostrados = todos ? trabajos : trabajos.slice(0, VISIBLES);

	if (isLoading) {
		return (
			<Card>
				<CardContent className="py-10 text-center text-sm text-muted-foreground">Cargando merma…</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-sm">
					<Layers className="h-4 w-4 text-muted-foreground" />
					Merma por trabajo
				</CardTitle>
				<p className="text-xs leading-relaxed text-muted-foreground">
					Papel que entró a la máquina y no salió vendible. Se juzga contra el
					tamaño del tiraje: en tirajes cortos el arreglo pesa mucho más.
				</p>
			</CardHeader>

			<CardContent>
				{trabajos.length === 0 ? (
					<div className="flex max-w-2xl flex-col items-start gap-3 py-2">
						<div className="flex items-center gap-2 text-foreground">
							<Info className="h-4 w-4 shrink-0 text-amber-500" />
							<span className="font-semibold">Todavía no hay merma que mostrar</span>
						</div>
						{diag?.reasons.map((r) => (
							<p key={r} className="text-sm leading-relaxed text-muted-foreground">{r}</p>
						))}
						<dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
							{[
								{ k: 'Partes de producción', v: diag?.partes_produccion ?? 0, mal: false },
								{ k: 'Con cifras de papel', v: diag?.partes_con_cifras ?? 0, mal: (diag?.partes_con_cifras ?? 0) === 0 },
								{ k: 'Sin OT viva', v: diag?.partes_sin_ot ?? 0, mal: (diag?.partes_sin_ot ?? 0) > 0 },
							].map((d) => (
								<div key={d.k}>
									<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{d.k}</dt>
									<dd className={`text-sm font-semibold tabular-nums ${d.mal ? 'text-destructive' : 'text-foreground'}`}>{d.v}</dd>
								</div>
							))}
						</dl>
					</div>
				) : (
					<div className="space-y-4">
						{/* Titular: la merma del conjunto, ponderada por papel. */}
						{data?.total.rate !== null && data?.total.rate !== undefined && (
							<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-3">
								<span className="text-2xl font-bold leading-none text-foreground">{pct(data.total.rate)}</span>
								<span className="text-sm text-muted-foreground">
									de merma en total — {data.total.merma.toLocaleString('es-CL')} de{' '}
									{data.total.pliegos.toLocaleString('es-CL')} pliegos
								</span>
							</div>
						)}

						{/* Una línea por trabajo. La barra queda chica a propósito — tope
						    de 120px — porque lo que hay que juzgar es el % contra el
						    límite, no cuántos píxeles mide. El detalle largo va al title
						    (hover) y un clic filtra la tabla de abajo por esta OT. */}
						<ul className="space-y-0.5">
							{mostrados.map((t) => {
								const nivel = NIVEL[t.level] ?? NIVEL.sin_datos;
								return (
									<li key={t.ot}>
										<button
											type="button"
											onClick={() => onSelect?.(t.ot)}
											title={t.note ?? `${t.merma.toLocaleString('es-CL')} de ${t.pliegos.toLocaleString('es-CL')} pliegos`}
											className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60"
										>
											<span className="w-16 shrink-0 truncate font-mono text-xs font-semibold text-foreground group-hover:text-primary">{t.ot}</span>
											<span
												className="h-1.5 max-w-[120px] flex-1 overflow-hidden rounded-full bg-muted"
												role="progressbar"
												aria-valuenow={Math.round(t.rate * 100)}
												aria-valuemin={0}
												aria-valuemax={100}
												aria-label={`Merma de la OT ${t.ot}: ${pct(t.rate)}, ${nivel.label}`}
											>
												<span
													className="block h-full rounded-full transition-all"
													style={{ width: `${Math.min(100, (t.rate / max) * 100)}%`, background: nivel.fill }}
												/>
											</span>
											<span className={`w-24 shrink-0 text-xs font-semibold ${nivel.text}`}>
												{pct(t.rate)} · {nivel.label}
											</span>
											{t.note && <AlertTriangle className={`h-3 w-3 shrink-0 ${nivel.text}`} />}
											<span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
												{t.merma.toLocaleString('es-CL')}/{t.pliegos.toLocaleString('es-CL')}
											</span>
										</button>
									</li>
								);
							})}
						</ul>

						{trabajos.length > VISIBLES && (
							<button
								type="button"
								onClick={() => setTodos((v) => !v)}
								className="text-xs font-medium text-primary underline-offset-4 hover:underline"
							>
								{todos ? `Mostrar sólo los primeros ${VISIBLES}` : `Ver los ${trabajos.length} trabajos`}
							</button>
						)}

						{/* Vista de tabla: el valor de cada trabajo también se lee sin
						    depender del color de su barra. */}
						<details className="pt-1">
							<summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
								Ver como tabla
							</summary>
							<div className="mt-2 overflow-x-auto">
								<table className="w-full text-xs">
									<thead>
										<tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
											<th className="py-1.5 pr-3 font-medium">OT</th>
											<th className="py-1.5 pr-3 text-right font-medium">Pliegos</th>
											<th className="py-1.5 pr-3 text-right font-medium">Merma</th>
											<th className="py-1.5 pr-3 text-right font-medium">Tasa</th>
											<th className="py-1.5 font-medium">Nivel</th>
										</tr>
									</thead>
									<tbody>
										{trabajos.map((t) => (
											<tr key={t.ot} className="border-b border-border/50">
												<td className="py-1.5 pr-3 font-mono">{t.ot}</td>
												<td className="py-1.5 pr-3 text-right tabular-nums">{t.pliegos.toLocaleString('es-CL')}</td>
												<td className="py-1.5 pr-3 text-right tabular-nums">{t.merma.toLocaleString('es-CL')}</td>
												<td className="py-1.5 pr-3 text-right tabular-nums">{pct(t.rate)}</td>
												<td className={`py-1.5 ${(NIVEL[t.level] ?? NIVEL.sin_datos).text}`}>
													{(NIVEL[t.level] ?? NIVEL.sin_datos).label}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</details>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
