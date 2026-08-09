'use client';

/**
 * El panorama de rentabilidad: lo que el dueño mira primero.
 *
 * Antes esta pantalla era una tabla de cifras y nada más — y en el estado real
 * de la base, una tabla de ceros. Tres decisiones de forma, tomadas antes que
 * el color:
 *
 *   · El margen por trabajo es POLARIDAD —dejó plata o la perdió—, así que va
 *     en barra divergente alrededor del cero, no en barra común. Perder $200.000
 *     y ganar $200.000 no son «dos barras cortas»: apuntan a lados opuestos.
 *   · La composición del costo es PARTE-TODO, así que va en barra apilada
 *     horizontal: los nombres de las partidas son largos y en horizontal se leen.
 *   · Los totales son NÚMEROS SUELTOS, así que van en fichas. Un gráfico de una
 *     barra no es un gráfico.
 *
 * Y cuando no hay costo cargado —hoy— no se dibuja un gráfico vacío: se explica
 * qué falta y dónde se completa. Una pantalla vacía es la primera que ve alguien
 * nuevo; debería enseñarle el próximo paso.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import {
	Bar,
	BarChart,
	Cell,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { ArrowRight, Info, TrendingDown, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTheme } from '@/contexts/ThemeContext';
import { formatCLP } from '@/lib/format';
import { aggregateMarginConfidence, marginConfidence } from '@/lib/margin-confidence';
import {
	CHROME,
	COST_PARTS,
	DIVERGING,
	compactCLP,
	costPartColor,
	type CostPartKey,
} from './charts/viz-tokens';

export interface OtCostRow {
	ot_id: string;
	ot_number: string;
	client_name: string | null;
	revenue: number;
	estimated_cost: number;
	actual_cost: number;
	material_actual: number;
	labor_actual: number;
	machine_actual: number;
	other_actual: number;
	gross_margin: number;
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// ── Ficha de titular ────────────────────────────────────────────────────────
// Un número suelto no necesita gráfico: la cifra ES el gráfico.

function Ficha({
	label,
	value,
	tone = 'neutral',
	nota,
	icon,
}: {
	label: string;
	value: string;
	tone?: 'neutral' | 'bueno' | 'malo' | 'apagado';
	nota?: string | null;
	icon?: React.ReactNode;
}) {
	const color =
		tone === 'bueno' ? 'text-emerald-600 dark:text-emerald-400'
		: tone === 'malo' ? 'text-red-600 dark:text-red-400'
		: tone === 'apagado' ? 'text-muted-foreground'
		: 'text-foreground';

	return (
		<Card>
			<CardHeader className="pb-1.5">
				<CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{label}
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-0">
				{/* Cifras proporcionales, no tabulares: a este tamaño las tabulares
				    hacen que «121» se vea suelto. */}
				<div className={`flex items-center gap-2 text-2xl font-bold leading-none ${color}`}>
					{icon}
					{value}
				</div>
				{nota && <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{nota}</p>}
			</CardContent>
		</Card>
	);
}

// ── Tooltip común ───────────────────────────────────────────────────────────
// El tooltip mejora, nunca es la única vía: cada valor está también en la tabla
// de abajo y en las etiquetas directas.

function Globo({ titulo, filas }: { titulo: string; filas: { label: string; value: string; color?: string }[] }) {
	return (
		<div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
			<p className="mb-1 text-xs font-semibold text-foreground">{titulo}</p>
			<div className="space-y-0.5">
				{filas.map((f) => (
					<div key={f.label} className="flex items-center gap-2 text-xs">
						{f.color && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: f.color }} />}
						<span className="text-muted-foreground">{f.label}</span>
						<span className="ml-auto font-medium tabular-nums text-foreground">{f.value}</span>
					</div>
				))}
			</div>
		</div>
	);
}

// ── Estado vacío que enseña ─────────────────────────────────────────────────

function SinCosto({ ots }: { ots: number }) {
	return (
		<Card className="border-dashed">
			<CardContent className="flex flex-col items-start gap-3 py-8 px-6">
				<div className="flex items-center gap-2 text-foreground">
					<Info className="h-4 w-4 text-amber-500" />
					<span className="font-semibold">Todavía no se puede calcular el margen</span>
				</div>
				<p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
					{ots === 0
						? 'No hay órdenes en el período.'
						: `Las ${ots} órdenes del período tienen ingreso pero ningún costo real cargado. Con el costo en cero el margen daría 100%, que no es una ganancia: es una cuenta a medio hacer.`}
				</p>
				<p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
					El costo real de una OT se arma solo cuando el taller reporta su avance
					y cuando la gente asignada en Planta queda enganchada a un trabajo.
				</p>
				<div className="flex flex-wrap gap-2 pt-1">
					<Link
						href="/operaciones/captures"
						className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
					>
						Revisar capturas del taller <ArrowRight className="h-3.5 w-3.5" />
					</Link>
					<Link
						href="/operaciones/planta"
						className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
					>
						Asignar personal a una OT <ArrowRight className="h-3.5 w-3.5" />
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}

// ── Panorama ────────────────────────────────────────────────────────────────

export function RentabilidadPanorama({ rows }: { rows: OtCostRow[] }) {
	const { theme } = useTheme();
	const dark = theme === 'dark';
	const chrome = dark ? CHROME.dark : CHROME.light;
	const div = dark ? DIVERGING.dark : DIVERGING.light;

	const totals = useMemo(() => {
		const revenue = rows.reduce((s, r) => s + n(r.revenue), 0);
		const actual = rows.reduce((s, r) => s + n(r.actual_cost), 0);
		const estimated = rows.reduce((s, r) => s + n(r.estimated_cost), 0);
		return { revenue, actual, estimated, verdict: aggregateMarginConfidence(rows) };
	}, [rows]);

	/** Sólo las OT con costo real entran a los gráficos: dibujar un margen sin
	 *  costo sería el mismo error de antes, con mejor tipografía. */
	const conCosto = useMemo(() => rows.filter((r) => n(r.actual_cost) > 0), [rows]);

	const margenData = useMemo(
		() =>
			conCosto
				.map((r) => ({
					ot: r.ot_number,
					cliente: r.client_name ?? '—',
					margen: n(r.revenue) - n(r.actual_cost),
					pct: marginConfidence(r).pct,
				}))
				.sort((a, b) => a.margen - b.margen),
		[conCosto],
	);

	const composicionData = useMemo(
		() =>
			conCosto.map((r) => ({
				ot: r.ot_number,
				material_actual: n(r.material_actual),
				labor_actual: n(r.labor_actual),
				machine_actual: n(r.machine_actual),
				other_actual: n(r.other_actual),
			})),
		[conCosto],
	);

	const v = totals.verdict;

	return (
		<div className="space-y-4">
			{/* Fila de titulares */}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Ficha label="Ingresos" value={formatCLP(totals.revenue)} />
				<Ficha label="Costo estimado" value={formatCLP(totals.estimated)} tone="apagado" />
				<Ficha label="Costo real" value={formatCLP(totals.actual)} tone={totals.actual > 0 ? 'neutral' : 'apagado'} />
				<Ficha
					label="Margen"
					value={v.pct !== null ? `${v.pct}%` : 'Sin determinar'}
					tone={v.pct === null ? 'apagado' : v.pct >= 0 ? 'bueno' : 'malo'}
					nota={v.hint}
					icon={
						v.pct === null ? null : v.pct >= 0
							? <TrendingUp className="h-5 w-5" />
							: <TrendingDown className="h-5 w-5" />
					}
				/>
			</div>

			{conCosto.length === 0 ? (
				<SinCosto ots={rows.length} />
			) : (
				<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
					{/* ── Margen por trabajo — polaridad, barra divergente ── */}
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm">Margen por trabajo</CardTitle>
							<p className="text-xs text-muted-foreground">
								A la derecha del cero dejó plata; a la izquierda la perdió.
							</p>
						</CardHeader>
						<CardContent>
							{/* La altura crece con las filas para que el eje quepa: un alto fijo
							    deja el eje fuera y el card termina con scroll interno. */}
							<ResponsiveContainer width="100%" height={Math.max(160, margenData.length * 42 + 48)}>
								<BarChart data={margenData} layout="vertical" margin={{ top: 4, right: 56, bottom: 8, left: 8 }}>
									<XAxis
										type="number"
										tickFormatter={compactCLP}
										stroke={chrome.axis}
										tick={{ fill: chrome.muted, fontSize: 11 }}
										tickLine={false}
										axisLine={{ stroke: chrome.axis }}
									/>
									<YAxis
										type="category"
										dataKey="ot"
										width={64}
										stroke={chrome.axis}
										tick={{ fill: chrome.muted, fontSize: 11 }}
										tickLine={false}
										axisLine={false}
									/>
									{/* El cero es la referencia, no una rejilla: se dibuja sólido y
									    en el gris neutro del par divergente. */}
									<ReferenceLine x={0} stroke={chrome.axis} strokeWidth={1} />
									<Tooltip
										cursor={{ fill: 'transparent' }}
										content={({ active, payload }) =>
											active && payload?.[0] ? (
												<Globo
													titulo={`OT ${payload[0].payload.ot} · ${payload[0].payload.cliente}`}
													filas={[
														{
															label: 'Margen',
															value: formatCLP(payload[0].payload.margen),
															color: payload[0].payload.margen >= 0 ? div.positivo : div.negativo,
														},
														...(payload[0].payload.pct !== null
															? [{ label: 'Sobre ingreso', value: `${payload[0].payload.pct}%` }]
															: []),
													]}
												/>
											) : null
										}
									/>
									<Bar dataKey="margen" radius={[4, 4, 4, 4]} barSize={18} isAnimationActive={false}>
										{margenData.map((d) => (
											<Cell key={d.ot} fill={d.margen >= 0 ? div.positivo : div.negativo} />
										))}
									</Bar>
								</BarChart>
							</ResponsiveContainer>
						</CardContent>
					</Card>

					{/* ── Composición del costo — parte-todo, apilada horizontal ── */}
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm">En qué se fue la plata</CardTitle>
							<p className="text-xs text-muted-foreground">Costo real de cada trabajo, por partida.</p>
						</CardHeader>
						<CardContent>
							{/* Leyenda siempre presente con 4 series: la identidad nunca puede
							    quedar sólo en el color. */}
							<div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
								{COST_PARTS.map((p) => (
									<span key={p.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
										<span
											className="h-2.5 w-2.5 rounded-sm"
											style={{ background: costPartColor(p.key, dark) }}
										/>
										{p.label}
									</span>
								))}
							</div>
							<ResponsiveContainer width="100%" height={Math.max(160, composicionData.length * 42 + 48)}>
								<BarChart data={composicionData} layout="vertical" margin={{ top: 4, right: 16, bottom: 8, left: 8 }}>
									<XAxis
										type="number"
										tickFormatter={compactCLP}
										stroke={chrome.axis}
										tick={{ fill: chrome.muted, fontSize: 11 }}
										tickLine={false}
										axisLine={{ stroke: chrome.axis }}
									/>
									<YAxis
										type="category"
										dataKey="ot"
										width={64}
										stroke={chrome.axis}
										tick={{ fill: chrome.muted, fontSize: 11 }}
										tickLine={false}
										axisLine={false}
									/>
									<Tooltip
										cursor={{ fill: 'transparent' }}
										content={({ active, payload, label }) =>
											active && payload?.length ? (
												<Globo
													titulo={`OT ${label}`}
													filas={payload
														.filter((s) => n(s.value) > 0)
														.map((s) => ({
															label: COST_PARTS.find((p) => p.key === s.dataKey)?.label ?? String(s.dataKey),
															value: formatCLP(n(s.value)),
															color: costPartColor(s.dataKey as CostPartKey, dark),
														}))}
												/>
											) : null
										}
									/>
									{COST_PARTS.map((p, i) => (
										<Bar
											key={p.key}
											dataKey={p.key}
											stackId="costo"
											fill={costPartColor(p.key, dark)}
											barSize={18}
											isAnimationActive={false}
											// 2px de SUPERFICIE entre segmentos, no un borde dibujado
											// alrededor de cada uno. Se toma del token de la tarjeta y no
											// de un hex fijo: así sigue al tema aunque cambie en caliente.
											stroke="hsl(var(--card))"
											strokeWidth={2}
											radius={i === COST_PARTS.length - 1 ? [0, 4, 4, 0] : undefined}
										/>
									))}
								</BarChart>
							</ResponsiveContainer>
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}
