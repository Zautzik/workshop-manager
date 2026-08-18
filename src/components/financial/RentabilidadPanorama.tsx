'use client';

/**
 * El panorama de rentabilidad: lo que el dueño mira primero.
 *
 * V2 — la V1 resolvía la forma (polaridad → barra divergente, parte-todo →
 * barra apilada) pero cada gráfico de Recharts cargaba su propio eje, grilla
 * y `ResponsiveContainer`, y ocho card llenaban la pantalla de scroll antes de
 * llegar a la tabla. "Rentabilidad por OT" no es un dashboard de un vistazo,
 * es una tabla larga a la que le pegaron gráficos.
 *
 * Se resuelve con el mismo lenguaje visual que ya probó ClientesPanel/
 * HoraPrensaPanel/MermaPanel en este mismo módulo: filas compactas con una
 * barra CSS, no un chart. La forma (polaridad, parte-todo) no cambia — cambia
 * el material: una fila de 36px con su propia barra en vez de un eje, una
 * grilla y 48px de margen que Recharts necesita para respirar.
 *
 * Y las fichas de titular dejan de ser números sueltos: cada una compara
 * contra el período anterior (`useAnalyticsFilters().comparison`), porque
 * "$4M" no decide nada — "$4M, 12% más que el mes pasado" sí.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Info, TrendingDown, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCLP } from '@/lib/format';
import { aggregateMarginConfidence, marginConfidence } from '@/lib/margin-confidence';
import { pctChange } from '@/contexts/AnalyticsFiltersContext';
import { useTheme } from '@/contexts/ThemeContext';
import { COST_PARTS, DIVERGING, costPartColor, type CostPartKey } from './charts/viz-tokens';
import { MermaPanel } from './MermaPanel';
import { HoraPrensaPanel } from './HoraPrensaPanel';
import { ClientesPanel } from './ClientesPanel';

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
// El valor no necesita gráfico — pero solo, tampoco decide nada: la comparación
// contra el período anterior es lo que lo vuelve una señal.

function DeltaBadge({ delta, invert = false, suffix = '%' }: { delta: number | null; invert?: boolean; suffix?: string }) {
	if (delta === null) return null;
	if (Math.abs(delta) < 0.5) {
		return <span className="text-muted-foreground">· estable</span>;
	}
	const up = delta > 0;
	const good = invert ? !up : up;
	return (
		<span className={good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
			{up ? '▲' : '▼'} {Math.abs(Math.round(delta * 10) / 10)}{suffix}
		</span>
	);
}

function Ficha({
	label,
	value,
	tone = 'neutral',
	nota,
	delta,
	invertDelta,
	icon,
	href,
}: {
	label: string;
	value: string;
	tone?: 'neutral' | 'bueno' | 'malo' | 'apagado';
	nota?: string | null;
	delta?: number | null;
	invertDelta?: boolean;
	icon?: React.ReactNode;
	href?: string;
}) {
	const color =
		tone === 'bueno' ? 'text-emerald-600 dark:text-emerald-400'
		: tone === 'malo' ? 'text-red-600 dark:text-red-400'
		: tone === 'apagado' ? 'text-muted-foreground'
		: 'text-foreground';

	const body = (
		<>
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
				{((delta !== undefined && delta !== null) || nota) && (
					<p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs leading-snug text-muted-foreground">
						{delta !== undefined && <DeltaBadge delta={delta} invert={invertDelta} />}
						{nota && <span>{nota}</span>}
					</p>
				)}
			</CardContent>
		</>
	);

	return href ? (
		<Card className="transition-colors hover:border-primary/40">
			<a href={href} className="block">{body}</a>
		</Card>
	) : (
		<Card>{body}</Card>
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

// ── Fila compacta: margen por trabajo (divergente, CSS) ────────────────────

function MargenRow({ ot, cliente, margen, pct, max, positivo, negativo }: {
	ot: string; cliente: string; margen: number; pct: number | null; max: number; positivo: string; negativo: string;
}) {
	const esPositivo = margen >= 0;
	const halfPct = Math.min(50, max > 0 ? (Math.abs(margen) / max) * 50 : 0);
	return (
		<li className="space-y-1">
			<div className="flex flex-wrap items-baseline gap-x-2 text-xs">
				<span className="font-mono font-semibold text-foreground">{ot}</span>
				<span className="truncate text-muted-foreground">{cliente}</span>
				<span className={`ml-auto font-semibold tabular-nums ${esPositivo ? 'text-foreground' : 'text-red-600 dark:text-red-400'}`}>
					{formatCLP(margen)}
					{pct !== null && <span className="ml-1 font-normal text-muted-foreground">({pct}%)</span>}
				</span>
			</div>
			<div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
				<div className="absolute inset-y-0 left-1/2 w-px bg-border" />
				<div
					className={`absolute inset-y-0 rounded-full ${esPositivo ? 'left-1/2' : 'right-1/2'}`}
					style={{ width: `${halfPct}%`, background: esPositivo ? positivo : negativo }}
				/>
			</div>
		</li>
	);
}

// ── Fila compacta: composición del costo (parte-todo, CSS apilado) ─────────

function ComposicionRow({ ot, parts, max, dark }: {
	ot: string;
	parts: { key: CostPartKey; label: string; value: number }[];
	max: number;
	dark: boolean;
}) {
	const total = parts.reduce((s, p) => s + p.value, 0);
	const anchoTotal = max > 0 ? Math.min(100, (total / max) * 100) : 0;
	return (
		<li className="space-y-1">
			<div className="flex items-baseline gap-x-2 text-xs">
				<span className="font-mono font-semibold text-foreground">{ot}</span>
				<span className="ml-auto tabular-nums text-muted-foreground">{formatCLP(total)}</span>
			</div>
			<div
				className="flex h-2.5 overflow-hidden rounded-full bg-muted"
				role="img"
				aria-label={`OT ${ot}: ${parts.filter((p) => p.value > 0).map((p) => `${p.label} ${formatCLP(p.value)}`).join(', ')}`}
				style={{ width: `${anchoTotal}%`, minWidth: total > 0 ? '2px' : 0 }}
			>
				{parts.filter((p) => p.value > 0).map((p, i) => (
					<div
						key={p.key}
						title={`${p.label}: ${formatCLP(p.value)}`}
						style={{
							width: `${(p.value / total) * 100}%`,
							background: costPartColor(p.key, dark),
							marginLeft: i === 0 ? 0 : 2,
						}}
					/>
				))}
			</div>
		</li>
	);
}

// ── Panorama ────────────────────────────────────────────────────────────────

function sumTotals(rows: OtCostRow[]) {
	const revenue = rows.reduce((s, r) => s + n(r.revenue), 0);
	const actual = rows.reduce((s, r) => s + n(r.actual_cost), 0);
	const estimated = rows.reduce((s, r) => s + n(r.estimated_cost), 0);
	return { revenue, actual, estimated, verdict: aggregateMarginConfidence(rows) };
}

export function RentabilidadPanorama({ rows, comparisonRows = [] }: { rows: OtCostRow[]; comparisonRows?: OtCostRow[] }) {
	const { theme } = useTheme();
	const dark = theme === 'dark';
	const div = dark ? DIVERGING.dark : DIVERGING.light;

	const totals = useMemo(() => sumTotals(rows), [rows]);
	const previous = useMemo(() => sumTotals(comparisonRows), [comparisonRows]);

	// Sólo las OT con costo real entran a los gráficos: dibujar un margen sin
	// costo sería el mismo error de antes, con mejor tipografía.
	const conCosto = useMemo(() => rows.filter((r) => n(r.actual_cost) > 0), [rows]);

	/** Todas las OT con costo, peor margen primero. */
	const margenTodo = useMemo(
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

	// 5 y 5: caben en una tarjeta sin scroll. El resto vive completo en la
	// tabla de abajo — este panel es "qué mirar primero", no "todo".
	const TOP_N = 5;
	const margenData = useMemo(() => {
		if (margenTodo.length <= TOP_N * 2) return margenTodo;
		return [...margenTodo.slice(0, TOP_N), ...margenTodo.slice(-TOP_N)];
	}, [margenTodo]);
	const truncado = margenTodo.length > margenData.length;
	const maxMargen = useMemo(() => Math.max(1, ...margenData.map((d) => Math.abs(d.margen))), [margenData]);

	// La composición sigue el mismo recorte y el mismo orden que el margen:
	// son las dos caras del mismo trabajo, y sólo se comparan fila a fila si
	// calzan una a una entre las dos listas.
	const composicionData = useMemo(
		() =>
			margenData.map((d) => {
				const r = conCosto.find((row) => row.ot_number === d.ot);
				return {
					ot: d.ot,
					parts: COST_PARTS.map((p) => ({ key: p.key, label: p.label, value: n(r?.[p.key]) })),
				};
			}),
		[margenData, conCosto],
	);
	const maxComposicion = useMemo(
		() => Math.max(1, ...composicionData.map((d) => d.parts.reduce((s, p) => s + p.value, 0))),
		[composicionData],
	);

	const v = totals.verdict;
	const revenueDelta = pctChange(totals.revenue, previous.revenue);
	const actualDelta = pctChange(totals.actual, previous.actual);
	const marginPtsDelta = v.pct !== null && previous.verdict.pct !== null ? v.pct - previous.verdict.pct : null;

	return (
		<div className="space-y-4">
			{/* Fila de titulares — cada uno contra el período anterior */}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Ficha label="Ingresos" value={formatCLP(totals.revenue)} delta={revenueDelta} href="#detalle-completo" />
				<Ficha label="Costo estimado" value={formatCLP(totals.estimated)} tone="apagado" />
				<Ficha
					label="Costo real"
					value={formatCLP(totals.actual)}
					tone={totals.actual > 0 ? 'neutral' : 'apagado'}
					delta={totals.actual > 0 ? actualDelta : undefined}
					invertDelta
					href="#detalle-completo"
				/>
				<Ficha
					label="Margen"
					value={v.pct !== null ? `${v.pct}%` : 'Sin determinar'}
					tone={v.pct === null ? 'apagado' : v.pct >= 0 ? 'bueno' : 'malo'}
					delta={v.pct !== null ? marginPtsDelta : undefined}
					nota={v.pct === null ? v.hint : null}
					href={conCosto.length > 0 ? '#margen-detalle' : undefined}
					icon={
						v.pct === null ? null : v.pct >= 0
							? <TrendingUp className="h-5 w-5" />
							: <TrendingDown className="h-5 w-5" />
					}
				/>
			</div>

			{/* Las dos caras de un trabajo: cuánto papel se perdió, y cuánto deja
			    la hora de máquina que ocupó. */}
			<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
				<HoraPrensaPanel />
				<MermaPanel />
			</div>

			{/* Por cliente: la pregunta por la que existe el módulo. `rollupByClient`
			    la respondía desde hace tiempo y ninguna pantalla la leía. */}
			<ClientesPanel />

			{conCosto.length === 0 ? (
				<SinCosto ots={rows.length} />
			) : (
				<>
				{truncado && (
					<p className="text-xs text-muted-foreground">
						Mostrando las {TOP_N} OT con mejor margen y las {TOP_N} con peor, de{' '}
						{margenTodo.length} con costo real cargado.{' '}
						<a
							href="#detalle-completo"
							className="font-medium text-primary underline-offset-4 hover:underline"
						>
							Ver el detalle completo de todas
						</a>
					</p>
				)}
				<div id="margen-detalle" className="grid scroll-mt-6 grid-cols-1 gap-4 xl:grid-cols-2">
					{/* ── Margen por trabajo — polaridad, fila compacta ── */}
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm">Margen por trabajo</CardTitle>
							<p className="text-xs text-muted-foreground">
								A la derecha del centro dejó plata; a la izquierda la perdió.
							</p>
						</CardHeader>
						<CardContent>
							<ol className="space-y-2.5">
								{margenData.map((d) => (
									<MargenRow key={d.ot} {...d} max={maxMargen} positivo={div.positivo} negativo={div.negativo} />
								))}
							</ol>
						</CardContent>
					</Card>

					{/* ── Composición del costo — parte-todo, fila compacta ── */}
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
							<ol className="space-y-2.5">
								{composicionData.map((d) => (
									<ComposicionRow key={d.ot} ot={d.ot} parts={d.parts} max={maxComposicion} dark={dark} />
								))}
							</ol>
						</CardContent>
					</Card>
				</div>
				</>
			)}
		</div>
	);
}
