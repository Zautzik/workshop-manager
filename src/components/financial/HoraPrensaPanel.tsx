'use client';

/**
 * Qué conviene programar cuando la prensa es el cuello de botella.
 *
 * Forma: el trabajo del dato aquí es un ORDEN —cuál va primero— no una
 * magnitud suelta, así que va como lista ordenada con barra comparativa, no
 * como gráfico de dispersión ni de torta. Y muestra las dos cifras juntas
 * porque el hallazgo ES la discrepancia: el trabajo de mayor margen suele no
 * ser el que más deja por hora, y verlas separadas oculta exactamente eso.
 *
 * Color: una sola serie con énfasis en el primero. La identidad no está en
 * juego —todos son trabajos— así que ocho colores sólo enterrarían el orden,
 * que es el mensaje.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Info, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCLP } from '@/lib/format';

interface Trabajo {
	ot_id: string;
	ot: string;
	cliente: string | null;
	revenue: number;
	cost: number;
	sheets: number | null;
	pressHours: number | null;
	costoMillar: number | null;
	precioMillar: number | null;
	margen: number | null;
	margenHora: number | null;
	motivo: string | null;
}

interface Respuesta {
	trabajos: Trabajo[];
	diagnostics: {
		total: number; sin_costo: number; sin_pliegos: number; sin_horas: number;
		blocked: boolean; reasons: string[];
	};
}

function usePressHour() {
	return useQuery<Respuesta>({
		queryKey: ['press-hour'],
		queryFn: async () => {
			const res = await fetch('/api/analytics/press-hour', { credentials: 'include' });
			if (!res.ok) throw new Error('No se pudo cargar');
			return res.json();
		},
	});
}

/** Cuántos se muestran antes de pedir «ver la cola completa». */
const VISIBLES = 5;

export function HoraPrensaPanel({ onSelect }: { onSelect?: (q: string) => void }) {
	const { data, isLoading } = usePressHour();
	const trabajos = useMemo(() => data?.trabajos ?? [], [data?.trabajos]);
	const diag = data?.diagnostics;

	const conCifra = useMemo(() => trabajos.filter((t) => t.margenHora !== null), [trabajos]);
	const max = useMemo(
		() => Math.max(1, ...conCifra.map((t) => Math.abs(t.margenHora!))),
		[conCifra],
	);
	const [todos, setTodos] = useState(false);
	// Ya viene rankeada por rankByPressHour (mejor margen/hora primero); acá
	// sólo se decide cuánto de la cola mostrar por defecto.
	const mostrados = todos ? conCifra : conCifra.slice(0, VISIBLES);

	if (isLoading) {
		return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Cargando…</CardContent></Card>;
	}

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-sm">
					<Clock className="h-4 w-4 text-muted-foreground" />
					Qué conviene programar primero
				</CardTitle>
				<p className="text-xs leading-relaxed text-muted-foreground">
					Cuando la prensa es el cuello de botella, el trabajo que conviene no es
					el de mayor margen sino el que deja más <strong>por hora de máquina</strong>.
					$200.000 en 2 horas rinden más que $400.000 en 8.
				</p>
			</CardHeader>

			<CardContent>
				{conCifra.length === 0 ? (
					<div className="flex max-w-2xl flex-col items-start gap-3 py-2">
						<div className="flex items-center gap-2 text-foreground">
							<Info className="h-4 w-4 shrink-0 text-amber-500" />
							<span className="font-semibold">Todavía no se puede ordenar la cola</span>
						</div>
						{diag?.reasons.map((r) => (
							<p key={r} className="text-sm leading-relaxed text-muted-foreground">{r}</p>
						))}
						<dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
							{[
								{ k: 'OT en el período', v: diag?.total ?? 0, mal: false },
								{ k: 'Sin costo real', v: diag?.sin_costo ?? 0, mal: (diag?.sin_costo ?? 0) > 0 },
								{ k: 'Sin pliegos', v: diag?.sin_pliegos ?? 0, mal: (diag?.sin_pliegos ?? 0) > 0 },
								{ k: 'Sin horas', v: diag?.sin_horas ?? 0, mal: (diag?.sin_horas ?? 0) > 0 },
							].map((d) => (
								<div key={d.k}>
									<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{d.k}</dt>
									<dd className={`text-sm font-semibold tabular-nums ${d.mal ? 'text-destructive' : 'text-foreground'}`}>{d.v}</dd>
								</div>
							))}
						</dl>

						{/* Aunque no haya margen, el costo por millar sí se puede mostrar en
						    cuanto haya pliegos: es la mitad de la respuesta y no depende
						    del costo real. */}
						{trabajos.some((t) => t.precioMillar !== null) && (
							<div className="w-full pt-1">
								<p className="mb-2 text-xs font-medium text-foreground">
									Lo que sí se puede decir hoy — precio por millar
								</p>
								<ul className="space-y-1">
									{trabajos.filter((t) => t.precioMillar !== null).map((t) => (
										<li key={t.ot_id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
											<span className="font-mono font-semibold text-foreground">{t.ot}</span>
											<span className="text-muted-foreground">{t.cliente}</span>
											<span className="ml-auto tabular-nums text-foreground">
												{formatCLP(Math.round(t.precioMillar!))} <span className="text-xs text-muted-foreground">/ millar</span>
											</span>
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				) : (
					<div className="space-y-2">
						{/* Una línea por trabajo, no tres: rango, OT, cliente, una barra
						    chica (tope de 120px — una barra al ancho del card, en un
						    card de 900px, no muestra magnitud, muestra un card ancho) y
						    el valor. El detalle que antes iba en una tercera línea ahora
						    vive en el title (hover) y un clic filtra la tabla de abajo. */}
						<ol className="space-y-0.5">
							{mostrados.map((t, i) => {
								const pos = t.margenHora! >= 0;
								// Énfasis en el primero: el orden es el mensaje, y resaltar
								// uno comunica mejor que colorear los ocho.
								const fill = i === 0 ? '#2a78d6' : pos ? '#86b6ef' : '#d03b3b';
								return (
									<li key={t.ot_id}>
										<button
											type="button"
											onClick={() => onSelect?.(t.ot)}
											title={`Margen ${formatCLP(t.margen ?? 0)} · ${t.pressHours?.toFixed(1) ?? '—'} h de máquina${t.costoMillar !== null ? ` · costo ${formatCLP(Math.round(t.costoMillar))}/millar` : ''}`}
											className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60"
										>
											<span className="w-4 shrink-0 font-mono text-[10px] text-muted-foreground">{i + 1}</span>
											<span className="w-14 shrink-0 truncate font-mono text-xs font-semibold text-foreground group-hover:text-primary">{t.ot}</span>
											<span className="w-20 shrink-0 truncate text-xs text-muted-foreground">{t.cliente}</span>
											<span className="h-1.5 max-w-[120px] flex-1 overflow-hidden rounded-full bg-muted">
												<span
													className="block h-full rounded-full transition-all"
													style={{ width: `${Math.min(100, (Math.abs(t.margenHora!) / max) * 100)}%`, background: fill }}
												/>
											</span>
											<span className={`ml-auto shrink-0 text-xs font-semibold tabular-nums ${pos ? 'text-foreground' : 'text-red-600 dark:text-red-400'}`}>
												{formatCLP(Math.round(t.margenHora!))}
												<span className="font-normal text-muted-foreground"> /hora</span>
											</span>
										</button>
									</li>
								);
							})}
						</ol>

						{conCifra.length > VISIBLES && (
							<button
								type="button"
								onClick={() => setTodos((v) => !v)}
								className="text-xs font-medium text-primary underline-offset-4 hover:underline"
							>
								{todos ? `Mostrar sólo los primeros ${VISIBLES}` : `Ver la cola completa (${conCifra.length})`}
							</button>
						)}

						{conCifra.length > 1 && conCifra[0].margen !== null && (
							<p className="flex items-start gap-1.5 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
								<TrendingUp className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
								<span>
									La <span className="font-mono font-semibold text-foreground">{conCifra[0].ot}</span> encabeza
									por hora de prensa
									{conCifra.some((t) => (t.margen ?? 0) > (conCifra[0].margen ?? 0))
										? ' aunque no sea la de mayor margen absoluto — ésa ocupa más máquina para dejar lo mismo.'
										: '.'}
								</span>
							</p>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
