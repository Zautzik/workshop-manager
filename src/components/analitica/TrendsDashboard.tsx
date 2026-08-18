'use client';

/**
 * Tendencias mostraba dos gráficos genéricos —OT creadas/completadas y
 * distribución por estado— armados en el cliente con `useOTs()`, que trae
 * como mucho 200 filas. Con el taller ya sobre esa marca, un promedio de
 * doce meses armado con esas 200 es el promedio de un taller que no es
 * este: los meses más viejos de la ventana quedan subcontados primero.
 *
 * Ahora la agregación vive en `/api/analytics/trends` (todo `ots`, sin ese
 * límite) y la pantalla suma las dos preguntas que faltaban — ¿estamos
 * ganando plata? ¿llegamos a tiempo? — porque "tendencias" sin ingresos ni
 * cumplimiento de plazo es sólo un conteo de filas por mes.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
	AreaChart, Area, Line, LineChart, BarChart, Bar, Cell,
	XAxis, YAxis, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import { TrendingUp, BarChart3, DollarSign, Clock3, Timer, Info } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
	ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { otStatusLabel } from '@/lib/status-labels';
import { formatCLP } from '@/lib/format';
import { DIVERGING, CHROME, compactCLP } from '@/components/financial/charts/viz-tokens';

interface MonthlyPoint {
	month: string;
	created: number;
	completed: number;
	onTime: number;
	onTimeEligible: number;
	onTimeRate: number | null;
	revenue: number;
	cost: number;
	margin: number;
	marginPct: number | null;
	conCosto: number;
	avgCycleDays: number | null;
}

interface TrendsResponse {
	monthly: MonthlyPoint[];
	completedCount: number;
	activeByStatus: Record<string, number>;
	total: number;
	warning: string | null;
}

// El mismo orden en que un trabajo recorre el taller — ver `ot_status` en
// supabase/migrations/20260221143000_hr_domain_core_tables.sql. 'completed'
// queda fuera: ésa es la pregunta que ya responde el titular de arriba.
const PIPELINE_ORDER = [
	'pre_press', 'visto_bueno', 'paper_purchase', 'in_storage',
	'guillotine_first_cut', 'offset_printing', 'digital_printing', 'die_cutting',
	'guillotine_final_cut', 'workshop', 'outsourced', 'workshop_revision',
	'ready_for_delivery', 'in_delivery',
];

const MONTH_OPTIONS = [
	{ value: '6', label: 'Últimos 6 meses' },
	{ value: '12', label: 'Últimos 12 meses' },
	{ value: '24', label: 'Últimos 24 meses' },
];

function useTrends(months: number) {
	return useQuery<TrendsResponse>({
		queryKey: ['analytics-trends', months],
		queryFn: async () => {
			const res = await fetch(`/api/analytics/trends?months=${months}`, { credentials: 'include' });
			if (!res.ok) throw new Error('No se pudo cargar las tendencias');
			return res.json();
		},
	});
}

const otConfig: ChartConfig = {
	created: { label: 'Creadas', color: 'hsl(243 75% 59%)' },
	completed: { label: 'Completadas', color: 'hsl(142 71% 45%)' },
} satisfies ChartConfig;

const moneyConfig: ChartConfig = {
	revenue: { label: 'Ingresos', color: 'hsl(243 75% 59%)' },
	cost: { label: 'Costo real', color: 'hsl(0 72% 51%)' },
} satisfies ChartConfig;

const activeConfig: ChartConfig = {
	value: { label: 'OTs', color: 'hsl(243 75% 59%)' },
} satisfies ChartConfig;

const cycleConfig: ChartConfig = {
	avgCycleDays: { label: 'Días promedio', color: 'hsl(263 70% 58%)' },
} satisfies ChartConfig;

/** Los últimos dos meses con dato medible, para el "vamos mejor o peor". */
function useDelta(chartData: (MonthlyPoint & { label: string })[], key: 'marginPct' | 'onTimeRate' | 'avgCycleDays') {
	return useMemo(() => {
		const conDato = chartData.filter((m) => m[key] !== null);
		if (conDato.length === 0) return null;
		const last = conDato[conDato.length - 1];
		const prev = conDato.length > 1 ? conDato[conDato.length - 2] : null;
		const delta = prev ? Math.round(((last[key] as number) - (prev[key] as number)) * 10) / 10 : null;
		return { last, delta };
	}, [chartData, key]);
}

/** `invert`: para el tiempo de ciclo, MENOS días es la mejora — la flecha
 *  sigue mostrando el signo real del cambio, sólo cambia qué color es "bien". */
function DeltaTag({ delta, invert = false }: { delta: number | null; invert?: boolean }) {
	if (delta === null) return null;
	if (Math.abs(delta) < 0.5) return <span className="text-muted-foreground">· estable vs mes anterior</span>;
	const up = delta > 0;
	const good = invert ? !up : up;
	return (
		<span className={good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
			· {up ? '▲' : '▼'} {Math.abs(delta)} {invert ? 'días' : 'pts'} vs mes anterior
		</span>
	);
}

export function TrendsDashboard() {
	const [months, setMonths] = useState(6);
	const { data, isLoading } = useTrends(months);

	const chartData = useMemo(
		() =>
			(data?.monthly ?? []).map((m) => ({
				...m,
				label: format(parseISO(`${m.month}-01`), 'MMM yy', { locale: es }),
			})),
		[data?.monthly],
	);

	const activeData = useMemo(() => {
		const counts = data?.activeByStatus ?? {};
		return PIPELINE_ORDER
			.filter((s) => (counts[s] ?? 0) > 0)
			.map((s) => ({ name: otStatusLabel(s), value: counts[s] }));
	}, [data?.activeByStatus]);
	const activeTotal = activeData.reduce((s, d) => s + d.value, 0);
	const completionPct = data && data.total > 0 ? Math.round((data.completedCount / data.total) * 1000) / 10 : null;

	const marginDelta = useDelta(chartData, 'marginPct');
	const onTimeDelta = useDelta(chartData, 'onTimeRate');
	const cycleDelta = useDelta(chartData, 'avgCycleDays');

	const sinCostoEnPeriodo = chartData.length > 0 && chartData.every((m) => m.conCosto === 0);
	const sinPlazoEnPeriodo = chartData.length > 0 && chartData.every((m) => m.onTimeEligible === 0);
	const sinCicloEnPeriodo = chartData.length > 0 && chartData.every((m) => m.avgCycleDays === null);

	return (
		<div className="space-y-6">
			{data?.warning && (
				<div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
					<Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
					<p>{data.warning}</p>
				</div>
			)}

			<div className="flex items-center justify-end">
				<Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
					<SelectTrigger className="h-8 w-[170px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{MONTH_OPTIONS.map((o) => (
							<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* ── OTs creadas vs completadas ── */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base flex items-center gap-2">
						<TrendingUp className="h-4 w-4" />OTs creadas vs completadas por mes
					</CardTitle>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<Skeleton className="h-[260px] w-full rounded-lg" />
					) : (
						<ChartContainer config={otConfig} className="h-[260px] w-full">
							<AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
								<defs>
									<linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="var(--color-created)" stopOpacity={0.35} />
										<stop offset="95%" stopColor="var(--color-created)" stopOpacity={0} />
									</linearGradient>
									<linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.35} />
										<stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0} />
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
								<XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
								<YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
								<ChartTooltip content={<ChartTooltipContent />} />
								<Legend />
								<Area type="monotone" dataKey="created" name="created" stroke="var(--color-created)" fill="url(#gradCreated)" strokeWidth={2} dot={false} animationDuration={400} animationEasing="ease-out" />
								<Area type="monotone" dataKey="completed" name="completed" stroke="var(--color-completed)" fill="url(#gradCompleted)" strokeWidth={2} dot={false} animationDuration={400} animationEasing="ease-out" />
							</AreaChart>
						</ChartContainer>
					)}
				</CardContent>
			</Card>

			{/* ── Ingresos vs costo real ── */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base flex items-center gap-2">
						<DollarSign className="h-4 w-4" />Ingresos vs costo real por mes
					</CardTitle>
					<p className="text-xs text-muted-foreground">
						Se cuentan en el mes en que la OT se completó, no en el que se creó — recién ahí hay plata que contar.
						{marginDelta && (
							<> Margen de {marginDelta.last.label}: <strong className="text-foreground">{marginDelta.last.marginPct}%</strong>{' '}
							<DeltaTag delta={marginDelta.delta} /></>
						)}
					</p>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<Skeleton className="h-[260px] w-full rounded-lg" />
					) : sinCostoEnPeriodo ? (
						<div className="flex h-[200px] flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
							<p>Ninguna OT completada en este período tiene costo real cargado todavía.</p>
						</div>
					) : (
						<ChartContainer config={moneyConfig} className="h-[260px] w-full">
							<AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
								<defs>
									<linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.35} />
										<stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0} />
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
								<XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
								<YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} tickFormatter={compactCLP} />
								<ChartTooltip
									content={
										<ChartTooltipContent
											formatter={(value, name) => (
												<div className="flex w-full items-center justify-between gap-4">
													<span className="text-muted-foreground">{name === 'revenue' ? 'Ingresos' : 'Costo real'}</span>
													<span className="font-medium tabular-nums text-foreground">{formatCLP(Number(value))}</span>
												</div>
											)}
										/>
									}
								/>
								<Legend />
								<Area type="monotone" dataKey="revenue" name="revenue" stroke="var(--color-revenue)" fill="url(#gradRevenue)" strokeWidth={2} dot={false} animationDuration={400} animationEasing="ease-out" />
								<Line type="monotone" dataKey="cost" name="cost" stroke="var(--color-cost)" strokeWidth={2} dot={false} animationDuration={400} animationEasing="ease-out" />
							</AreaChart>
						</ChartContainer>
					)}
				</CardContent>
			</Card>

			{/* ── Cumplimiento de plazo ── */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base flex items-center gap-2">
						<Clock3 className="h-4 w-4" />Cumplimiento de plazo por mes
					</CardTitle>
					<p className="text-xs text-muted-foreground">
						% de OT completadas a tiempo, entre las que tenían plazo. Línea punteada en 90%.
						{onTimeDelta && (
							<> {onTimeDelta.last.label}: <strong className="text-foreground">{onTimeDelta.last.onTimeRate}%</strong>{' '}
							<DeltaTag delta={onTimeDelta.delta} /></>
						)}
					</p>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<Skeleton className="h-[200px] w-full rounded-lg" />
					) : sinPlazoEnPeriodo ? (
						<div className="flex h-[160px] flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
							<p>Ninguna OT completada en este período tenía un plazo cargado.</p>
						</div>
					) : (
						<ChartContainer config={{ onTimeRate: { label: '% a tiempo', color: DIVERGING.light.positivo } }} className="h-[200px] w-full">
							<BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
								<CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
								<XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
								<YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} tickFormatter={(v) => `${v}%`} />
								<ReferenceLine y={90} stroke={CHROME.light.axis} strokeDasharray="4 4" />
								<ChartTooltip
									content={
										<ChartTooltipContent
											formatter={(value, _name, item) => (
												<div className="flex w-full items-center justify-between gap-4">
													<span className="text-muted-foreground">A tiempo</span>
													<span className="font-medium tabular-nums text-foreground">
														{value === null ? 'sin plazos' : `${value}% (${item.payload.onTime}/${item.payload.onTimeEligible})`}
													</span>
												</div>
											)}
										/>
									}
								/>
								<Bar dataKey="onTimeRate" name="onTimeRate" radius={[4, 4, 0, 0]} animationDuration={400} animationEasing="ease-out">
									{chartData.map((m) => (
										<Cell
											key={m.month}
											fill={
												m.onTimeRate === null ? CHROME.light.muted
													: m.onTimeRate >= 90 ? DIVERGING.light.positivo
													: m.onTimeRate >= 75 ? '#eda100'
													: DIVERGING.light.negativo
											}
										/>
									))}
								</Bar>
							</BarChart>
						</ChartContainer>
					)}
				</CardContent>
			</Card>

			{/* ── Tiempo de ciclo ── */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base flex items-center gap-2">
						<Timer className="h-4 w-4" />Tiempo de ciclo por mes
					</CardTitle>
					<p className="text-xs text-muted-foreground">
						Días de calendario entre que la OT se crea y se completa, promediado por mes de cierre.
						{cycleDelta && (
							<> {cycleDelta.last.label}: <strong className="text-foreground">{cycleDelta.last.avgCycleDays} días</strong>{' '}
							<DeltaTag delta={cycleDelta.delta} invert /></>
						)}
					</p>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<Skeleton className="h-[220px] w-full rounded-lg" />
					) : sinCicloEnPeriodo ? (
						<div className="flex h-[160px] flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
							<p>Ninguna OT completada en este período tiene ambas fechas cargadas.</p>
						</div>
					) : (
						<ChartContainer config={cycleConfig} className="h-[220px] w-full">
							<LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
								<CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
								<XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
								<YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} tickFormatter={(v) => `${v}d`} />
								<ChartTooltip
									content={
										<ChartTooltipContent
											formatter={(value) => (
												<div className="flex w-full items-center justify-between gap-4">
													<span className="text-muted-foreground">Ciclo promedio</span>
													<span className="font-medium tabular-nums text-foreground">
														{value === null ? 'sin datos' : `${value} días`}
													</span>
												</div>
											)}
										/>
									}
								/>
								<Line
									type="monotone" dataKey="avgCycleDays" name="avgCycleDays"
									stroke="var(--color-avgCycleDays)" strokeWidth={2}
									dot={{ r: 3 }} connectNulls animationDuration={400} animationEasing="ease-out"
								/>
							</LineChart>
						</ChartContainer>
					)}
				</CardContent>
			</Card>

			{/* ── Dónde está el trabajo en curso ── */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base flex items-center gap-2">
						<BarChart3 className="h-4 w-4" />Dónde está el trabajo en curso
					</CardTitle>
					<p className="text-xs text-muted-foreground">
						{data ? (
							<>{data.completedCount} de {data.total} OT ya completadas ({completionPct}%). Las {activeTotal} restantes,
							por etapa del proceso en el orden en que se recorren — no por mes: es una foto de ahora mismo.</>
						) : 'Cargando…'}
					</p>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<Skeleton className="h-[240px] w-full rounded-lg" />
					) : activeData.length === 0 ? (
						<div className="flex h-[160px] flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
							<p>No hay OT activas fuera de &quot;completada&quot; en este momento.</p>
						</div>
					) : (
						<ChartContainer config={activeConfig} className="w-full" style={{ height: Math.max(160, activeData.length * 32 + 40) }}>
							<BarChart data={activeData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
								<CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
								<XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
								<YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
								<ChartTooltip content={<ChartTooltipContent />} />
								<Bar dataKey="value" name="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} barSize={18} animationDuration={400} animationEasing="ease-out" />
							</BarChart>
						</ChartContainer>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
