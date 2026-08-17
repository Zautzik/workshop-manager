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
	AreaChart, Area, Line, BarChart, Bar, Cell,
	XAxis, YAxis, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import { TrendingUp, BarChart3, DollarSign, Clock3 } from 'lucide-react';

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
}

interface TrendsResponse {
	monthly: MonthlyPoint[];
	statusCounts: Record<string, number>;
	total: number;
}

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

const statusConfig: ChartConfig = {
	value: { label: 'OTs', color: 'hsl(243 75% 59%)' },
} satisfies ChartConfig;

/** Los últimos dos meses con dato medible, para el "vamos mejor o peor". */
function useDelta(chartData: (MonthlyPoint & { label: string })[], key: 'marginPct' | 'onTimeRate') {
	return useMemo(() => {
		const conDato = chartData.filter((m) => m[key] !== null);
		if (conDato.length === 0) return null;
		const last = conDato[conDato.length - 1];
		const prev = conDato.length > 1 ? conDato[conDato.length - 2] : null;
		const delta = prev ? Math.round(((last[key] as number) - (prev[key] as number)) * 10) / 10 : null;
		return { last, delta };
	}, [chartData, key]);
}

function DeltaTag({ delta }: { delta: number | null }) {
	if (delta === null) return null;
	if (Math.abs(delta) < 0.5) return <span className="text-muted-foreground">· estable vs mes anterior</span>;
	const up = delta > 0;
	return (
		<span className={up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
			· {up ? '▲' : '▼'} {Math.abs(delta)} pts vs mes anterior
		</span>
	);
}

export function TrendsDashboard() {
	const [months, setMonths] = useState(12);
	const { data, isLoading } = useTrends(months);

	const chartData = useMemo(
		() =>
			(data?.monthly ?? []).map((m) => ({
				...m,
				label: format(parseISO(`${m.month}-01`), 'MMM yy', { locale: es }),
			})),
		[data?.monthly],
	);

	const statusData = useMemo(() => {
		const counts = data?.statusCounts ?? {};
		return Object.entries(counts).map(([status, count]) => ({
			name: otStatusLabel(status),
			value: count,
		}));
	}, [data?.statusCounts]);

	const marginDelta = useDelta(chartData, 'marginPct');
	const onTimeDelta = useDelta(chartData, 'onTimeRate');

	const sinCostoEnPeriodo = chartData.length > 0 && chartData.every((m) => m.conCosto === 0);
	const sinPlazoEnPeriodo = chartData.length > 0 && chartData.every((m) => m.onTimeEligible === 0);

	return (
		<div className="space-y-6">
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

			{/* ── Distribución por estado (todas las OT, sin el límite de 200) ── */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base flex items-center gap-2">
						<BarChart3 className="h-4 w-4" />Distribución por estado
					</CardTitle>
					<p className="text-xs text-muted-foreground">{data?.total ?? 0} OT en total, sin límite de página.</p>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<Skeleton className="h-[200px] w-full rounded-lg" />
					) : (
						<ChartContainer config={statusConfig} className="h-[200px] w-full">
							<BarChart data={statusData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
								<CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
								<XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
								<YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
								<ChartTooltip content={<ChartTooltipContent />} />
								<Bar dataKey="value" name="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} animationDuration={400} animationEasing="ease-out" />
							</BarChart>
						</ChartContainer>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
