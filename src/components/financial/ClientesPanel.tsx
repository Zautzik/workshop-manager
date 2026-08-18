'use client';

/**
 * Qué cliente deja plata y cuál se la lleva.
 *
 * `rollupByClient` calculaba esto desde hace tiempo y `/api/ots/cost-summary` lo
 * devolvía en `by_client`. Ningún componente lo leía. La pregunta por la que
 * existe un módulo de analítica estaba respondida y guardada.
 *
 * ── La forma ────────────────────────────────────────────────────────────────
 *
 * El hallazgo no es «cuánto factura cada cliente» —eso ya lo sabe el gerente—
 * sino la DESPROPORCIÓN entre lo que factura y lo que deja. Dos medidas, y la
 * trampa evidente sería un gráfico de dos ejes.
 *
 * Se resuelve con una sola escala: cada barra es la VENTA del cliente, y la
 * parte llena es lo que quedó de margen. Un cliente que factura el doble y deja
 * la mitad se ve de un vistazo, sin comparar dos gráficos ni leer un número.
 * Es parte-sobre-el-todo dentro de la fila, no dos series compitiendo.
 *
 * Color: un solo tono para el margen —la identidad no está en juego, todos son
 * clientes— y rojo sólo para el margen negativo, que es polaridad, no categoría.
 * Veinticuatro colores enterrarían lo único que importa, que es el orden.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info, Users } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCLP } from '@/lib/format';
import { DIVERGING } from './charts/viz-tokens';

interface ClienteFila {
	client_id: string | null;
	client_name: string;
	ots: number;
	revenue: number;
	actual_cost: number;
	gross_margin: number;
	margin_pct: number | null;
	ots_sin_costo: number;
	reason: string;
}

interface Respuesta {
	by_client?: ClienteFila[];
	client_conflicts?: number;
}

function useClientes() {
	return useQuery<Respuesta>({
		queryKey: ['ot-cost-summary', 'by-client'],
		queryFn: async () => {
			const res = await fetch('/api/ots/cost-summary', { credentials: 'include' });
			if (!res.ok) throw new Error('No se pudo cargar la rentabilidad por cliente');
			return res.json();
		},
	});
}

/** Cuántos se muestran antes de pedir «ver todos». */
const VISIBLES = 5;

export function ClientesPanel({ onSelect }: { onSelect?: (q: string) => void }) {
	const { data, isLoading, isError } = useClientes();
	const [todos, setTodos] = useState(false);

	const filas = useMemo(() => data?.by_client ?? [], [data?.by_client]);

	// Se ordena por lo que DEJA, no por lo que factura. Ordenar por venta pone
	// arriba justamente al cliente del que uno no sospecha nada.
	const ordenadas = useMemo(
		() => [...filas].sort((a, b) => b.gross_margin - a.gross_margin),
		[filas],
	);
	const conCifra = useMemo(() => ordenadas.filter((f) => f.margin_pct !== null), [ordenadas]);
	const sinCifra = useMemo(() => ordenadas.filter((f) => f.margin_pct === null), [ordenadas]);

	const maxVenta = useMemo(
		() => Math.max(1, ...conCifra.map((f) => f.revenue)),
		[conCifra],
	);

	const total = useMemo(
		() => conCifra.reduce((a, f) => ({ venta: a.venta + f.revenue, margen: a.margen + f.gross_margin }), { venta: 0, margen: 0 }),
		[conCifra],
	);

	/**
	 * El hallazgo, dicho con palabras: el cliente que más factura no suele ser el
	 * que más deja. Si resulta que sí lo es, se dice eso — inventar una tensión
	 * que no existe es peor que no decir nada.
	 */
	const hallazgo = useMemo(() => {
		if (conCifra.length < 2) return null;
		const porVenta = [...conCifra].sort((a, b) => b.revenue - a.revenue);
		const mayorVenta = porVenta[0];
		const mayorMargen = conCifra[0];
		if (mayorVenta.client_id === mayorMargen.client_id && mayorVenta.client_name === mayorMargen.client_name) {
			return `${mayorMargen.client_name} encabeza las dos listas: es el que más factura y el que más deja.`;
		}
		return (
			`${mayorVenta.client_name} es el que más factura (${formatCLP(mayorVenta.revenue)}) ` +
			`pero deja ${mayorVenta.margin_pct}%. ${mayorMargen.client_name} factura menos y deja ${formatCLP(mayorMargen.gross_margin)}.`
		);
	}, [conCifra]);

	if (isLoading) {
		return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Cargando clientes…</CardContent></Card>;
	}
	if (isError) {
		return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No se pudo cargar la rentabilidad por cliente.</CardContent></Card>;
	}

	const mostradas = todos ? conCifra : conCifra.slice(0, VISIBLES);

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-sm">
					<Users className="h-4 w-4 text-muted-foreground" />
					Qué cliente deja plata
				</CardTitle>
				<p className="text-xs leading-relaxed text-muted-foreground">
					La barra completa es lo que el cliente <strong>factura</strong>; la parte llena es
					lo que <strong>queda</strong> después del costo real. Están ordenados por lo que
					dejan, no por lo que facturan.
				</p>
			</CardHeader>

			<CardContent>
				{conCifra.length === 0 ? (
					<div className="flex max-w-2xl flex-col items-start gap-3 py-2">
						<div className="flex items-center gap-2 text-foreground">
							<Info className="h-4 w-4 shrink-0 text-amber-500" />
							<span className="font-semibold">Todavía no se puede repartir el margen por cliente</span>
						</div>
						<p className="text-sm leading-relaxed text-muted-foreground">
							{sinCifra.length > 0
								? `Ninguno de los ${sinCifra.length} clientes con trabajos tiene una OT con costo real cargado. Sin costo, el margen daría 100%, que no es una ganancia sino una cuenta a medio hacer.`
								: 'No hay OT con cliente asignado en el período.'}
						</p>
					</div>
				) : (
					<div className="space-y-4">
						{/* Totales primero: el detalle se lee contra un marco. */}
						<dl className="flex flex-wrap gap-x-8 gap-y-2 border-b border-border pb-3">
							<div>
								<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Clientes con margen medido</dt>
								<dd className="text-sm font-semibold tabular-nums text-foreground">{conCifra.length}</dd>
							</div>
							<div>
								<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Venta</dt>
								<dd className="text-sm font-semibold tabular-nums text-foreground">{formatCLP(total.venta)}</dd>
							</div>
							<div>
								<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Margen</dt>
								<dd className="text-sm font-semibold tabular-nums text-foreground">
									{formatCLP(total.margen)}
									<span className="ml-1.5 text-xs font-normal text-muted-foreground">
										{total.venta > 0 ? `${Math.round((total.margen / total.venta) * 1000) / 10}%` : ''}
									</span>
								</dd>
							</div>
						</dl>

						{/* Una línea por cliente; la barra queda con tope de 120px — la
						    pista completa (venta) al ancho del card no aporta más lectura
						    que una chica, sólo ocupa más pantalla. El detalle de costo va
						    al title y un clic filtra la tabla de abajo por este cliente. */}
						<ol className="space-y-0.5">
							{mostradas.map((f) => {
								const negativo = f.gross_margin < 0;
								const anchoVenta = (f.revenue / maxVenta) * 100;
								// La porción llena es el margen dentro de la venta del cliente.
								const porcionMargen = f.revenue > 0 ? Math.max(0, Math.min(100, (f.gross_margin / f.revenue) * 100)) : 0;
								const relleno = negativo ? DIVERGING.light.negativo : DIVERGING.light.positivo;

								return (
									<li key={`${f.client_id ?? f.client_name}`}>
										<button
											type="button"
											onClick={() => onSelect?.(f.client_name)}
											title={`Factura ${formatCLP(f.revenue)} · costo ${formatCLP(f.actual_cost)}${f.ots_sin_costo > 0 ? ` · ${f.ots_sin_costo} OT sin costo cargado, fuera del cálculo` : ''}`}
											className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60"
										>
											<span className="w-32 shrink-0 truncate text-xs font-medium text-foreground group-hover:text-primary">{f.client_name}</span>
											<span className="w-10 shrink-0 text-[11px] text-muted-foreground">{f.ots} OT</span>
											{/* Un solo eje: la escala es pesos para todos. La pista es la
											    venta del cliente contra la mayor venta; lo lleno es su margen. */}
											<div
												className="h-2 max-w-[120px] flex-1 rounded-full bg-muted/60"
												role="img"
												aria-label={`${f.client_name}: factura ${formatCLP(f.revenue)}, deja ${formatCLP(f.gross_margin)}`}
											>
												<div className="h-full rounded-full bg-muted-foreground/15" style={{ width: `${anchoVenta}%` }}>
													<div
														className="h-full rounded-full transition-all"
														style={{ width: `${porcionMargen}%`, background: relleno }}
													/>
												</div>
											</div>
											<span className={`ml-auto shrink-0 text-xs font-semibold tabular-nums ${negativo ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
												{formatCLP(f.gross_margin)}
												<span className="ml-1 font-normal text-muted-foreground">{f.margin_pct}%</span>
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
								{todos ? `Mostrar sólo los primeros ${VISIBLES}` : `Ver los ${conCifra.length} clientes`}
							</button>
						)}

						{hallazgo && (
							<p className="flex items-start gap-1.5 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
								<AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
								<span>{hallazgo}</span>
							</p>
						)}

						{/* Los que no se pueden juzgar se nombran, no se esconden ni se
						    mezclan como si valieran cero. */}
						{sinCifra.length > 0 && (
							<details className="border-t border-border pt-3">
								<summary className="cursor-pointer text-xs font-medium text-muted-foreground">
									{sinCifra.length} cliente{sinCifra.length > 1 ? 's' : ''} sin margen medible
								</summary>
								<ul className="mt-2 space-y-1.5">
									{sinCifra.map((f) => (
										<li key={`${f.client_id ?? f.client_name}`} className="text-xs text-muted-foreground">
											<span className="font-medium text-foreground">{f.client_name}</span> — {f.reason}
										</li>
									))}
								</ul>
							</details>
						)}

						{(data?.client_conflicts ?? 0) > 0 && (
							<p className="text-xs text-amber-600 dark:text-amber-400">
								{data!.client_conflicts} OT tienen el nombre del cliente y su ficha en desacuerdo. Se agrupan aparte
								en vez de asignarse a uno de los dos candidatos.
							</p>
						)}

						{/* Tabla equivalente: el color de la barra queda bajo 3:1 en tema
						    claro, así que la lectura numérica tiene que existir siempre. */}
						<details className="border-t border-border pt-3">
							<summary className="cursor-pointer text-xs font-medium text-muted-foreground">Ver como tabla</summary>
							<div className="mt-2 overflow-x-auto">
								<table className="w-full text-xs tabular-nums">
									<thead>
										<tr className="border-b border-border text-left text-muted-foreground">
											<th className="py-1 pr-3 font-medium">Cliente</th>
											<th className="py-1 pr-3 text-right font-medium">OT</th>
											<th className="py-1 pr-3 text-right font-medium">Venta</th>
											<th className="py-1 pr-3 text-right font-medium">Costo real</th>
											<th className="py-1 pr-3 text-right font-medium">Margen</th>
											<th className="py-1 text-right font-medium">%</th>
										</tr>
									</thead>
									<tbody>
										{ordenadas.map((f) => (
											<tr key={`t-${f.client_id ?? f.client_name}`} className="border-b border-border/50">
												<td className="py-1 pr-3 text-foreground">{f.client_name}</td>
												<td className="py-1 pr-3 text-right">{f.ots}</td>
												<td className="py-1 pr-3 text-right">{formatCLP(f.revenue)}</td>
												<td className="py-1 pr-3 text-right">{formatCLP(f.actual_cost)}</td>
												<td className={`py-1 pr-3 text-right ${f.gross_margin < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
													{f.margin_pct === null ? '—' : formatCLP(f.gross_margin)}
												</td>
												<td className="py-1 text-right">{f.margin_pct === null ? '—' : `${f.margin_pct}%`}</td>
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
