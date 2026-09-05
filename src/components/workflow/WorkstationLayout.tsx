'use client';
import { useEffect, useState, useMemo, useCallback, memo, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
	Users,
	Printer,
	Scissors,
	Wrench,
	Layers,
	Hand,
	ChevronRight,
	X,
	Zap,
	GaugeCircle,
	MapPin,
} from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { useToast } from '@/hooks/use-toast';
import { getWorkerPrimaryStationType, getWorkerQualificationScore } from '@/lib/workstation-skills';
import { useStationsUnderMaintenance } from '@/hooks/use-maintenance-queries';
import { formatCLP } from '@/lib/format';
import { machineGroupRank, machinePhase } from '@/lib/machine-groups';
import { phaseLabel, phaseRank } from '@/lib/production-phases';

interface WorkstationLayoutProps {
	workstations: any[];
	assignments: any[];
	workers: any[];
	workerIndicatorsById?: Record<string, any>;
	monthlyOvertimeByWorker: Record<string, { hours: number; shifts: number }>;
	compensationByWorker: Record<string, any>;
	shiftHours: number;
	costModel: any;
	shiftContext: { isWeekend: boolean; isNightShift: boolean };
	selectedShift: string;
	selectedOT: any;
	onWorkerSelect: (worker: any) => void;
	onUnassignWorker: (assignmentId?: string, workerName?: string) => void;
	onAssignmentChange: () => void;
}

const QUICK_GUIDE_SESSION_KEY = 'workflow_planta_quick_guide_seen';

// Puras — no leen props ni estado del componente, sólo su propio argumento —
// así que viven a nivel de módulo en vez de recrearse (y volver a pasarse
// como prop con una identidad distinta) en cada render (auditoría de
// performance 2026-09).
const getWorkstationIcon = (type: string) => {
	switch (type) {
		case 'offset_printer':
			return <Printer className='w-4 h-4' />;
		case 'guillotine':
			return <Scissors className='w-4 h-4' />;
		case 'die_cutter':
			return <Layers className='w-4 h-4' />;
		case 'workshop':
			return <Wrench className='w-4 h-4' />;
		default:
			return <Wrench className='w-4 h-4' />;
	}
};

const getWorkstationColor = (type: string) => {
	switch (type) {
		case 'offset_printer':
			return 'bg-violet-500/10 border-violet-500/40';
		case 'guillotine':
			return 'bg-orange-500/10 border-orange-500/40';
		case 'die_cutter':
			return 'bg-rose-500/10 border-rose-500/40';
		case 'workshop':
			return 'bg-emerald-500/10 border-emerald-500/40';
		default:
			return 'bg-card border-border';
	}
};

const getDepartmentTheme = (type: string) => {
	switch (type) {
		case 'offset_printer':
			return {
				sectionCard: 'bg-violet-500/10 border-violet-500/40',
				title: 'text-violet-700 dark:text-violet-300',
				countBadge: 'bg-violet-500/20 text-violet-700 dark:text-violet-200 border-violet-500/40',
				poolCard: 'border-violet-500/40 bg-card',
			};
		case 'guillotine':
			return {
				sectionCard: 'bg-orange-500/10 border-orange-500/40',
				title: 'text-orange-700 dark:text-orange-300',
				countBadge: 'bg-orange-500/20 text-orange-700 dark:text-orange-200 border-orange-500/40',
				poolCard: 'border-orange-500/40 bg-card',
			};
		case 'die_cutter':
			return {
				sectionCard: 'bg-rose-500/10 border-rose-500/40',
				title: 'text-rose-700 dark:text-rose-300',
				countBadge: 'bg-rose-500/20 text-rose-700 dark:text-rose-200 border-rose-500/40',
				poolCard: 'border-rose-500/40 bg-card',
			};
		case 'workshop':
			return {
				sectionCard: 'bg-emerald-500/10 border-emerald-500/40',
				title: 'text-emerald-700 dark:text-emerald-300',
				countBadge: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-200 border-emerald-500/40',
				poolCard: 'border-emerald-500/40 bg-card',
			};
		default:
			return {
				sectionCard: 'bg-card/50 border-border',
				title: 'text-foreground',
				countBadge: 'bg-primary/20 text-primary border-primary/40',
				poolCard: 'border-border bg-card',
			};
	}
};

/** Los tipos de máquina presentes en una fase, en orden de recorrido. Pura. */
const typesInPhase = (stations: any[]): string[] =>
	[...new Set(stations.map((s: any) => s.type).filter(Boolean))].sort(
		(a, b) => machineGroupRank(a) - machineGroupRank(b),
	);

/** El tipo de la fase en el que este operario puntúa mejor. Pura. */
const bestTypeForWorker = (worker: any, types: string[]): string =>
	types.reduce((best, t) =>
		(getWorkerQualificationScore(worker, t) ?? -1) > (getWorkerQualificationScore(worker, best) ?? -1) ? t : best,
	types[0]);

const PLANNING_WEIGHTS = {
	skill: 0.4,
	availability: 0.2,
	cost: 0.3,
	overtimeRisk: 0.1,
};

const DraggableWorker = memo(function DraggableWorker({
	worker,
		assignmentId,
	isOvertime = false,
	onUnassignWorker,
	compact = false,
}: {
	worker: any;
	assignmentId?: string;
	isOvertime?: boolean;
	compact?: boolean;
	monthlyOvertime?: { hours: number; shifts: number };
	costInfo?: { hourlyRate?: number; currencyCode?: string; estimatedCost?: number };
	planningScore?: number | null;
	explainability?: string[];
	stationType?: string | null;
	onUnassignWorker?: (assignmentId?: string, workerName?: string) => void;
	indicators?: {
		leaveStatus?: string;
		leaveTone?: 'ok' | 'warn' | 'alert';
		incentiveStatus?: string;
		incentiveTone?: 'ok' | 'warn' | 'alert';
		certificationAlert?: string;
		certificationTone?: 'ok' | 'warn' | 'alert';
		legalHourConflict?: boolean;
	};
}) {
	// Hooks must run unconditionally — the null guard comes after, and the
	// draggable is disabled so the placeholder registration is inert.
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({
			id: assignmentId || `worker-${worker?.id ?? 'none'}`,
			data: { worker, assignmentId, isOvertime },
			disabled: !worker,
		});

	if (!worker) return null;

	const style = transform
		? {
				transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
				opacity: isDragging ? 0.5 : 1,
		  }
		: undefined;

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...listeners}
			{...attributes}
			className={`relative flex items-center gap-1.5 rounded-md border text-foreground shadow-sm transition-colors cursor-grab active:cursor-grabbing ${compact ? 'px-2 py-1' : 'px-3 py-2'} ${
				isOvertime
					? 'border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/15'
					: 'border-border bg-card hover:border-primary/40 hover:bg-accent/20'
			}`}
		>
			{assignmentId && onUnassignWorker && (
				<button
					type='button'
					onPointerDown={event => event.stopPropagation()}
					onClick={event => {
						event.stopPropagation();
						onUnassignWorker(assignmentId, worker?.name);
					}}
					className='absolute top-1 right-1 rounded-full p-0.5 text-muted-foreground hover:text-destructive transition-colors'
					aria-label={`Remove ${worker?.name || 'worker'} from station`}
				>
					<X className='w-3 h-3' />
				</button>
			)}
			<div className={`rounded-full flex items-center justify-center font-bold shrink-0 ${compact ? 'w-5 h-5 text-[10px]' : 'w-7 h-7 text-xs'} ${
				isOvertime
					? 'bg-amber-500/30 text-amber-700 dark:text-amber-300'
					: 'bg-primary/20 text-primary'
			}`}>
				{worker.name.charAt(0)}
			</div>
			<span className={`font-medium break-words min-w-0 ${compact ? 'text-[11px]' : 'text-sm'}`}>{worker.name}</span>
			{isOvertime && (
				<span className='ml-auto text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0'>OT</span>
			)}
		</div>
	);
});

function DroppableAvailablePool({
	id,
	children,
	className,
}: {
	id: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			id={id}
			className={`${className || ''} rounded-lg border-2 border-dashed border-border transition-all`}
		>
			{children}
		</div>
	);
}

const DroppableWorkstation = memo(function DroppableWorkstation({
	station,
	assignedWorkers,
	occupancy,
	capacity,
	onWorkerSelect,
	selectedOT,
	monthlyOvertimeByWorker,
	workerIndicatorsById,
	showOnlyOvertime,
	getWorkerMeta,
	onUnassignWorker,
	maintenanceBlock,
	maintenanceUnknown,
}: any) {
	// A machine opened for maintenance takes its station out of service. dnd-kit
	// won't even consider it a target, so the drop is refused at the source
	// rather than rejected after the fact.
	const maintenance = maintenanceBlock ?? null;
	// Si no se pudo consultar mantención (sesión vencida, red caída), no se
	// asume "está libre" — se asume "no sé" y se bloquea igual. Lo contrario
	// es exactamente el defecto que dejaba asignar gente a una prensa abierta
	// para mantención cuando la consulta fallaba en silencio (auditoría 2026-08).
	const { setNodeRef, isOver } = useDroppable({
		id: station.id,
		data: { workstation: station, selectedOT },
		disabled: Boolean(maintenance) || Boolean(maintenanceUnknown),
	});
	const normalizedCapacity = Math.max(1, Number(capacity || 0));
	const openSlotCount = Math.max(0, normalizedCapacity - occupancy);
	// Barra de ocupación GPU-compositada: animar `width` fuerza reflow del
	// bloque en cada asignación/desasignación. `scaleX` con origen a la
	// izquierda pinta lo mismo sin tocar layout (auditoría de performance
	// 2026-09).
	const occupancyRatio = Math.min(1, occupancy / normalizedCapacity);

	return (
		<Card
			ref={setNodeRef}
			className={`${getWorkstationColor(
				station.type
			)} border-3 p-2 transition-all duration-300 ${
				maintenance || maintenanceUnknown
					? 'opacity-60 border-amber-500/60 saturate-50'
					: isOver
					? 'ring-2 ring-primary border-primary shadow-lg'
					: 'hover:border-primary/40 hover:shadow-md'
			}`}
		>
		{maintenance && (
			<div
				className='mb-1.5 flex items-center gap-1 rounded border border-amber-500/50 bg-amber-500/15 px-1.5 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400'
				title={`Orden de mantención ${maintenance.status === 'in_progress' ? 'en curso' : 'pendiente'} — no se puede asignar personal`}
			>
				<Wrench className='h-3 w-3 shrink-0' />
				<span className='truncate'>En mantención</span>
			</div>
		)}
		{/* No es que esté en mantención — es que no se pudo confirmar que NO lo
			está. Mensaje distinto a propósito: reclamar una orden de mantención
			que no se sabe si existe sería inventar un dato. */}
		{!maintenance && maintenanceUnknown && (
			<div
				className='mb-1.5 flex items-center gap-1 rounded border border-amber-500/50 bg-amber-500/15 px-1.5 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400'
				title='No se pudo confirmar si esta estación está en mantención — asignación bloqueada por seguridad'
			>
				<Wrench className='h-3 w-3 shrink-0' />
				<span className='truncate'>Sin verificar</span>
			</div>
		)}
		<div className='flex items-center justify-between mb-1.5'>
			<div className='flex items-center gap-1.5 flex-1 min-w-0'>
				{getWorkstationIcon(station.type)}
				<div className='min-w-0 flex-1'>
					<h3 className='font-bold text-foreground text-sm leading-tight break-words'>
							{station.display_name ?? station.name ?? station.machine?.name}
						</h3>
						{station.machine?.brand || station.machine?.model ? (
							<p className='text-xs text-muted-foreground break-words'>
								{[station.machine.brand, station.machine.model].filter(Boolean).join(' ')}
								{station.machine.year_manufactured ? ` (${station.machine.year_manufactured})` : ''}
							</p>
						) : (
							<p className='text-xs text-muted-foreground capitalize'>
								{station.type.replace(/_/g, ' ')}
							</p>
						)}
					</div>
				</div>
				<div className='flex flex-col items-end gap-1 shrink-0'>
					<Badge
						variant='outline'
						className={`text-[10px] ${
							(station.machine?.status ?? station.status) === 'running'
								? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
								: (station.machine?.status ?? station.status) === 'maintenance'
									? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
									: (station.machine?.status ?? station.status) === 'offline'
										? 'bg-destructive/15 border-destructive/40 text-destructive'
										: 'bg-muted border-border text-muted-foreground'
						}`}
					>
						{station.machine?.status ?? station.status}
					</Badge>
					{(station.machine?.nominal_speed_sheets_hr ?? station.machine?.productivity_sheets_per_hour) ? (
						<span className='flex items-center gap-0.5 text-[10px] text-muted-foreground'>
							<GaugeCircle className='w-2.5 h-2.5' />
							{(station.machine.nominal_speed_sheets_hr ?? station.machine.productivity_sheets_per_hour).toLocaleString()}/h
						</span>
					) : null}
				</div>
			</div>

		<div className='mb-1.5'>
			<div className='flex items-center justify-between text-xs text-foreground mb-0.5'>
					<span>Capacity</span>
					<span className='font-bold'>
						{occupancy}/{normalizedCapacity}
					</span>
				</div>
				<div className='h-1.5 bg-muted rounded-full overflow-hidden'>
					<div
						className={`h-full origin-left transition-transform ${
							occupancy >= normalizedCapacity ? 'bg-destructive' : 'bg-primary'
						}`}
						style={{ transform: `scaleX(${occupancyRatio})` }}
					/>
				</div>
			</div>

		<div
			className={`space-y-1.5 mb-1.5 min-h-[64px] rounded-md border-2 border-dashed p-1.5 transition-all duration-300 ${
					isOver ? 'border-primary bg-primary/10' : 'border-border bg-muted/30'
				}`}
			>
				{assignedWorkers.length > 0 ? (
					assignedWorkers
						.filter((assignment: any) => assignment?.worker)
						.map((assignment: any) => {
							const meta = getWorkerMeta(assignment.worker, station.type);
							return (
								<DraggableWorker
									key={assignment.id}
									worker={assignment.worker}
									assignmentId={assignment.id}
									isOvertime={meta.overtime}
									monthlyOvertime={monthlyOvertimeByWorker?.[assignment.worker?.id]}
									costInfo={meta.costInfo}
									planningScore={meta.planningScore}
									explainability={meta.explainability}
									indicators={workerIndicatorsById?.[assignment.worker?.id]}
									stationType={station.type}
									onUnassignWorker={onUnassignWorker}
								/>
							);
						})
				) : null}

				{/* One compact line for however many slots are open — the capacity bar
					above already shows occupancy/N, and the whole card (not each
					slot) is the actual drop target, so listing every empty slot as
					its own box was pure vertical clutter with zero extra information
					(owner request 2026-07-23: catch the floor at a glance). */}
				{openSlotCount > 0 && (
				<div
					className={`rounded-md border border-dashed px-2 py-1 text-center text-[10px] font-medium transition-colors ${
						isOver
							? 'border-primary text-primary bg-primary/10'
							: 'border-border text-muted-foreground bg-background/40'
					}`}
				>
					{isOver ? 'Suelta aquí' : `${openSlotCount} ${openSlotCount === 1 ? 'cupo libre' : 'cupos libres'}`}
				</div>
			)}

				{assignedWorkers.length === 0 && openSlotCount === 0 ? (
					<div className='text-center py-2 text-xs text-muted-foreground'>
						{showOnlyOvertime ? 'No OT workers assigned in this station' : 'No slots available'}
					</div>
				) : null}
			</div>

			{/* Machine location / energy pill */}
			{(station.machine?.location || station.machine?.energy_consumption_kw) && (
				<div className='flex items-center gap-2 mb-2 flex-wrap'>
					{station.machine?.location && (
						<span className='flex items-center gap-0.5 text-[10px] text-muted-foreground'>
							<MapPin className='w-2.5 h-2.5' />
							{station.machine.location}
						</span>
					)}
					{station.machine?.energy_consumption_kw ? (
						<span className='flex items-center gap-0.5 text-[10px] text-muted-foreground'>
							<Zap className='w-2.5 h-2.5' />
							{station.machine.energy_consumption_kw} kW
						</span>
					) : null}
				</div>
			)}
			{selectedOT && (
				<Badge className='bg-primary/15 text-foreground border-primary/30 w-full justify-center mb-2'>
					{selectedOT.ot_number}
				</Badge>
			)}
		</Card>
	);
});

/**
 * WorkstationLayout - Visual layout of all workstations
 * Similar to FIFA formation view
 */
export function WorkstationLayout({
	workstations,
	assignments,
	workers,
	workerIndicatorsById,
	monthlyOvertimeByWorker,
	compensationByWorker,
	shiftHours,
	costModel,
	shiftContext,
	selectedShift,
	selectedOT,
	onWorkerSelect,
	onUnassignWorker,
	onAssignmentChange,
}: WorkstationLayoutProps) {
	const { toast } = useToast();
	// Equipos tells Planta which machines are out of service. `isError` matters
	// as much as `data`: a failed check must block assignment, not clear it.
	const { data: stationsUnderMaintenance, isError: maintenanceCheckFailed } = useStationsUnderMaintenance();
	const [showOnlyOvertime, setShowOnlyOvertime] = useState(false);
	const [showQuickGuide, setShowQuickGuide] = useState(false);
	const [guideOpenedOnce, setGuideOpenedOnce] = useState(false);

	useEffect(() => {
		const hasSeenGuide = sessionStorage.getItem(QUICK_GUIDE_SESSION_KEY) === '1';
		setShowQuickGuide(!hasSeenGuide);
	}, []);

	/*
	 * Todo lo de acá abajo, hasta el `return`, recalculaba desde cero en CADA
	 * render de este componente — y cada drag-and-drop en Planta dispara dos
	 * de esos renders (uno al tomar la tarjeta, uno al soltarla) desde el
	 * `activeId` que vive en PlantaBoard. Nada estaba memoizado: ni las listas
	 * derivadas (turno actual, no asignados, agrupados por fase) ni las
	 * funciones de costo/score/explicación, que además se llamaban 2-4 veces
	 * por operario por render (`getSelectionExplanation` invocaba
	 * `getPlanningScore` para un resultado que nunca leía, y el pool de
	 * disponibles por fase se calculaba dos veces — una para el `.length`,
	 * otra para el `.map`). Se consolida todo en `useMemo`/`useCallback` con
	 * las dependencias reales, y las tres funciones de costo/score/explicación
	 * se funden en `getWorkerMeta`, que calcula el costo una sola vez por
	 * operario en vez de cuatro (auditoría de performance 2026-09).
	 */

	// `getAssignedWorkers` filtraba `assignments` completo por cada estación
	// (O(estaciones × asignaciones)) — se agrupa una sola vez.
	const assignmentsByStation = useMemo(() => {
		const map = new Map<string, any[]>();
		for (const a of assignments) {
			if (a.shift_id !== selectedShift) continue;
			if (showOnlyOvertime && !String(a.role || '').includes('overtime')) continue;
			const list = map.get(a.machine_id);
			if (list) list.push(a);
			else map.set(a.machine_id, [a]);
		}
		return map;
	}, [assignments, selectedShift, showOnlyOvertime]);

	const getAssignedWorkers = useCallback(
		(workstationId: string) => assignmentsByStation.get(workstationId) ?? [],
		[assignmentsByStation],
	);

	const currentShiftAssignments = useMemo(
		() => assignments.filter(a => a.shift_id === selectedShift),
		[assignments, selectedShift],
	);

	const currentShiftOvertimeAssignments = useMemo(
		() => currentShiftAssignments.filter(a => String(a.role || '').includes('overtime')),
		[currentShiftAssignments],
	);

	const currentShiftOvertimeWorkerCount = useMemo(
		() => new Set(currentShiftOvertimeAssignments.map(a => a.employee_id ?? a.worker_id)).size,
		[currentShiftOvertimeAssignments],
	);

	// `pre_press` no tiene puesto físico en Planta — se filtra acá, no en la
	// consulta, porque otras vistas sí quieren ver esa máquina.
	const visibleWorkstations = useMemo(() => workstations.filter((station) => {
		const type = String(station?.type || '').toLowerCase().trim();
		return !/pre\s*-?\s*press|pre\s*-?\s*prensa|pre_press|preprensa/.test(type);
	}), [workstations]);

	const currentShiftWorkerIds = useMemo(
		() => new Set(currentShiftAssignments.map(a => a.employee_id ?? a.worker_id)),
		[currentShiftAssignments],
	);
	const otherShiftWorkerIds = useMemo(
		() => new Set(
			assignments
				.filter(a => a.shift_id !== selectedShift)
				.map(a => a.employee_id ?? a.worker_id)
		),
		[assignments, selectedShift],
	);

	const strictUnassignedWorkers = useMemo(
		() => workers.filter(worker => !currentShiftWorkerIds.has(worker.id)),
		[workers, currentShiftWorkerIds],
	);

	const unassignedWorkers = useMemo(
		() => (strictUnassignedWorkers.length > 0 ? strictUnassignedWorkers : workers),
		[strictUnassignedWorkers, workers],
	);

	const stationTypes = useMemo(
		() => Array.from(new Set(visibleWorkstations.map(station => station.type))),
		[visibleWorkstations],
	);

	const getWorkerPrimaryType = useCallback(
		(worker: any) => getWorkerPrimaryStationType(worker, stationTypes),
		[stationTypes],
	);

	const isOvertimeWorker = useCallback(
		(worker: any) => Boolean(worker?.id) && otherShiftWorkerIds.has(worker.id),
		[otherShiftWorkerIds],
	);

	const getWorkerCostInfo = useCallback((worker: any, overtime: boolean) => {
		const rate = compensationByWorker?.[worker?.id];
		const hourlyRate = Number(rate?.hourly_rate ?? 0);
		if (!hourlyRate) return undefined;

		const minRate = costModel?.minimum_hourly_rate;
		const maxRate = costModel?.maximum_hourly_rate;
		let adjustedRate = hourlyRate;
		if (Number.isFinite(Number(minRate))) {
			adjustedRate = Math.max(adjustedRate, Number(minRate));
		}
		if (Number.isFinite(Number(maxRate))) {
			adjustedRate = Math.min(adjustedRate, Number(maxRate));
		}

		const overtimeMultiplier = Number(
			costModel?.overtime_multiplier_50 ?? rate?.overtime_multiplier_50 ?? 1.5
		);
		const nightMultiplier = Number(
			costModel?.night_shift_multiplier ?? rate?.night_shift_multiplier ?? 1
		);
		const weekendMultiplier = Number(
			costModel?.weekend_multiplier ?? rate?.weekend_multiplier ?? 1
		);

		let multiplier = 1;
		if (overtime) multiplier *= overtimeMultiplier;
		if (shiftContext?.isNightShift) multiplier *= nightMultiplier;
		if (shiftContext?.isWeekend) multiplier *= weekendMultiplier;

		let estimatedCost = shiftHours
			? adjustedRate * shiftHours * multiplier
			: undefined;

		const roundingIncrement = Number(costModel?.rounding_increment ?? 0.01);
		if (estimatedCost !== undefined && Number.isFinite(roundingIncrement) && roundingIncrement > 0) {
			estimatedCost = Math.round(estimatedCost / roundingIncrement) * roundingIncrement;
		}
		return {
			hourlyRate: adjustedRate,
			currencyCode: rate?.currency_code,
			estimatedCost,
		};
	}, [compensationByWorker, costModel, shiftContext, shiftHours]);

	/**
	 * Costo + score + explicación de un operario para un tipo de estación, en
	 * una sola pasada. Antes eran tres funciones separadas (getWorkerCostInfo,
	 * getPlanningScore, getSelectionExplanation) que se llamaban juntas en
	 * cada tarjeta — y getSelectionExplanation llamaba a getPlanningScore por
	 * un `score` que nunca usaba. Resultado: hasta 4 cálculos de costo por
	 * operario por render. Acá se calcula una vez y se reparte.
	 */
	const getWorkerMeta = useCallback((worker: any, type?: string | null) => {
		const overtime = isOvertimeWorker(worker);
		const costInfo = getWorkerCostInfo(worker, overtime);
		const skillScore = Number(getWorkerQualificationScore(worker, type) ?? 0);
		const rating = Number(worker?.overall_rating ?? 0);

		const availabilityScore = overtime
			? worker?.overtime_availability
				? 0.6
				: 0.3
			: 1;
		const overtimeRiskScore = overtime ? 0.2 : 1;

		const costNormBase = Number(costInfo?.estimatedCost ?? Number.MAX_SAFE_INTEGER);
		const costScore = Number.isFinite(costNormBase)
			? 1 / Math.max(1, costNormBase)
			: 0;

		const weighted =
			PLANNING_WEIGHTS.skill * (skillScore / 5) +
			PLANNING_WEIGHTS.availability * availabilityScore +
			PLANNING_WEIGHTS.cost * costScore * 100 +
			PLANNING_WEIGHTS.overtimeRisk * overtimeRiskScore +
			(0.05 * (rating / 100));

		const planningScore = Math.max(0, Math.min(100, weighted * 100));

		const explainability = [
			`Skill fit: ${skillScore}/5 for ${type || 'station type'}`,
			overtime
				? worker?.overtime_availability
					? 'Availability: assigned in another shift, OT allowed'
					: 'Availability: assigned in another shift, OT risk elevated'
				: 'Availability: free in this shift',
			costInfo?.hourlyRate
				? `Costo estimado: ${formatCLP(costInfo.estimatedCost || 0)} (tarifa ${formatCLP(costInfo.hourlyRate)}/h)`
				: 'Cost estimate: no active compensation rate for selected date',
			`Performance rating: ${rating.toFixed(0)}/100`,
			`Selection rationale balances skill, availability, cost, and overtime risk`,
		];

		return { overtime, costInfo, planningScore, explainability };
	}, [isOvertimeWorker, getWorkerCostInfo]);

	/**
	 * Operarios disponibles para una FASE: los que califican para al menos uno de
	 * los tipos de máquina que hay en ella. Filtrar por un solo tipo dejaría la
	 * bandeja de Terminación casi vacía, porque quien sabe corchetear no
	 * necesariamente figura como calificado para la polilaminadora.
	 */
	const getAvailableWorkersForType = useCallback((type: string) => {
		// Show every unassigned worker qualified for this station type, not only the
		// one whose single "primary" type happens to match. Two types with identical
		// skill requirements (workshop and manual_workshop both need MANUAL_WORKSHOP)
		// would otherwise funnel all qualified workers into whichever type sorts first,
		// leaving the other pool ("Taller") permanently empty.
		const availableByType = unassignedWorkers.filter(
			worker => getWorkerQualificationScore(worker, type) !== null
		);

		const pool = availableByType;

		const filtered = showOnlyOvertime
			? pool.filter(worker => isOvertimeWorker(worker))
			: pool;

		const entries = filtered.map(worker => {
			const overtime = isOvertimeWorker(worker);
			const costInfo = getWorkerCostInfo(worker, overtime);
			const skillScore = getWorkerQualificationScore(worker, type) ?? 0;
			return {
				worker,
				cost: costInfo?.estimatedCost,
				rating: Number(worker?.overall_rating ?? 0),
				skill: Number(skillScore),
			};
		});

		const costValues = entries
			.map(entry => entry.cost)
			.filter(value => Number.isFinite(value)) as number[];
		const ratingValues = entries.map(entry => entry.rating);
		const skillValues = entries.map(entry => entry.skill);

		const costMin = costValues.length ? Math.min(...costValues) : 0;
		const costMax = costValues.length ? Math.max(...costValues) : 0;
		const ratingMin = ratingValues.length ? Math.min(...ratingValues) : 0;
		const ratingMax = ratingValues.length ? Math.max(...ratingValues) : 0;
		const skillMin = skillValues.length ? Math.min(...skillValues) : 0;
		const skillMax = skillValues.length ? Math.max(...skillValues) : 0;

		const normalize = (value: number, min: number, max: number) =>
			max === min ? 0 : (value - min) / (max - min);

		const costWeight = Number(costModel?.cost_weight ?? 1);
		const ratingWeight = Number(costModel?.rating_weight ?? 0);
		const skillWeight = Number(costModel?.skill_weight ?? 0);
		const totalWeight = costWeight + ratingWeight + skillWeight;
		const preferLowerCost = Boolean(costModel?.prefer_lower_cost ?? true);

		return entries
			.map(entry => {
				const costNorm = Number.isFinite(entry.cost)
					? normalize(entry.cost as number, costMin, costMax)
					: 1;
				const costScore = preferLowerCost ? 1 - costNorm : costNorm;
				const ratingScore = normalize(entry.rating, ratingMin, ratingMax);
				const skillScore = normalize(entry.skill, skillMin, skillMax);

				const weightedScore = totalWeight > 0
					? costWeight * costScore + ratingWeight * ratingScore + skillWeight * skillScore
					: -1;

				return {
					...entry,
					score: weightedScore,
				};
			})
			.sort((a, b) => {
				if (totalWeight > 0 && a.score !== b.score) {
					return b.score - a.score;
				}
				const aCost = Number.isFinite(a.cost) ? (a.cost as number) : Number.POSITIVE_INFINITY;
				const bCost = Number.isFinite(b.cost) ? (b.cost as number) : Number.POSITIVE_INFINITY;
				if (aCost !== bCost) return aCost - bCost;
				return (a.worker?.name || '').localeCompare(b.worker?.name || '');
			})
			.map(entry => entry.worker);
	}, [unassignedWorkers, showOnlyOvertime, isOvertimeWorker, getWorkerCostInfo, costModel]);

	// Precalculado una vez por tipo visible, no por cada fase que lo referencia
	// (varios tipos comparten fase) ni dos veces por fase como pasaba antes
	// (`.length` y `.map` llamaban a la función completa cada uno).
	const availableWorkersByType = useMemo(() => {
		const map = new Map<string, any[]>();
		for (const type of stationTypes) {
			map.set(type, getAvailableWorkersForType(type));
		}
		return map;
	}, [stationTypes, getAvailableWorkersForType]);

	const uncategorizedAvailableWorkers = useMemo(
		() => unassignedWorkers.filter(worker => !getWorkerPrimaryType(worker)),
		[unassignedWorkers, getWorkerPrimaryType],
	);

	const visibleUncategorizedWorkers = useMemo(
		() => showOnlyOvertime
			? uncategorizedAvailableWorkers.filter(worker => isOvertimeWorker(worker))
			: uncategorizedAvailableWorkers,
		[showOnlyOvertime, uncategorizedAvailableWorkers, isOvertimeWorker],
	);

	// Agrupado por FASE del taller, igual que Equipos y con el mismo vocabulario
	// que el Kanban. Antes había una sección por tipo de máquina: la Dobladora,
	// la Alzadora, la Corchetera, la Hotmelera y la Polilaminadora ocupaban cinco
	// bloques con una máquina cada uno, cuando en el piso son un solo puesto de
	// trabajo —el taller— por el que la hoja pasa en secuencia.
	const groupedWorkstations = useMemo(() => visibleWorkstations.reduce((acc: any, station: any) => {
		const phase = machinePhase(station.type) ?? 'otros';
		if (!acc[phase]) acc[phase] = [];
		acc[phase].push(station);
		return acc;
	}, {}), [visibleWorkstations]);

	const getPhaseLabel = (phase: string) =>
		phase === 'otros' ? 'Sin clasificar' : phaseLabel(phase);

	const sectionRank = phaseRank;

	// Pool de disponibles por fase, calculado una sola vez por fase (antes se
	// recalculaba en cada acceso — dos veces por fase sólo en el JSX de abajo).
	const availableWorkersByPhase = useMemo(() => {
		const map = new Map<string, any[]>();
		for (const [phase, stations] of Object.entries(groupedWorkstations)) {
			const types = typesInPhase(stations as any[]);
			const seen = new Set<string>();
			const pool: any[] = [];
			for (const t of types) {
				for (const w of availableWorkersByType.get(t) ?? []) {
					if (!seen.has(w.id)) {
						seen.add(w.id);
						pool.push(w);
					}
				}
			}
			map.set(phase, pool);
		}
		return map;
	}, [groupedWorkstations, availableWorkersByType]);

	return (
		<div className='space-y-6'>
			{/* Enhanced Instructions */}
			{showQuickGuide && (
				<Alert className='bg-card/35 border border-border/50 backdrop-blur-sm shadow-sm py-1.5 px-2.5'>
					<AlertDescription className='text-muted-foreground w-full'>
						<details
							className='group'
							onToggle={(event) => {
								const isOpen = (event.currentTarget as HTMLDetailsElement).open;
								if (isOpen) {
									setGuideOpenedOnce(true);
									return;
								}
								if (guideOpenedOnce) {
									sessionStorage.setItem(QUICK_GUIDE_SESSION_KEY, '1');
									setShowQuickGuide(false);
								}
							}}
						>
							<summary className='list-none cursor-pointer select-none flex items-center gap-1.5 text-[11px] leading-none'>
								<Hand className='h-3.5 w-3.5 text-primary/65 shrink-0' />
								<span className='font-semibold text-primary/80 uppercase tracking-wide'>Guía rápida</span>
								<span className='text-muted-foreground/80'>arrastrar y soltar operarios</span>
								<ChevronRight className='ml-auto h-3 w-3 text-muted-foreground transition-transform group-open:rotate-90' />
							</summary>
							<ol className='mt-2 pl-5 space-y-0.5 text-[11px] leading-snug list-decimal'>
								<li>
									<strong>Toma</strong> la tarjeta de un operario desde la sección &quot;Operarios Disponibles&quot;
								</li>
								<li>
									<strong>Arrastra</strong> al operario sobre la máquina (el cuadro brilla cuando está listo)
								</li>
								<li>
									<strong>Suelta</strong> para asignar. También puedes mover operarios entre máquinas
								</li>
							</ol>
						</details>
					</AlertDescription>
				</Alert>
			)}

			{/* Workshop Floor - Grouped by Machine Type - MOVED BEFORE WORKERS */}
			<div className='space-y-6'>
				<div className='flex items-center gap-3'>
					<h2 className='text-3xl font-bold text-foreground'>Planta</h2>
					<Badge
						variant='outline'
						className='bg-supervisor/20 text-supervisor border-supervisor/40 text-sm'
					>
						Live View
					</Badge>
					<button
						type='button'
						onClick={() => setShowOnlyOvertime(prev => !prev)}
						className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
							showOnlyOvertime
								? 'bg-amber-500 text-black border-amber-600'
								: 'bg-amber-500/20 text-amber-700 border-amber-500/40 hover:bg-amber-500/30'
						}`}
					>
						Operarios HE: {currentShiftOvertimeWorkerCount}
					</button>
				</div>

				{Object.entries(groupedWorkstations)
					.sort(([typeA], [typeB]) => {
						const rankDiff = sectionRank(typeA) - sectionRank(typeB);
						return rankDiff !== 0 ? rankDiff : typeA.localeCompare(typeB);
					})
					.map(
					([phase, stations]: [string, any]) => {
						const types = typesInPhase(stations as any[]);
						// El icono y el color vienen del primer tipo del recorrido dentro
						// de la fase: en "Corte & Impresión" manda la prensa, no la
						// guillotina que va después.
						const type = types[0] ?? phase;
						const theme = getDepartmentTheme(type);
						const phaseWorkers = availableWorkersByPhase.get(phase) ?? [];

						return (
						<Card
							key={phase}
							className={`${theme.sectionCard} backdrop-blur-sm p-3`}
						>
							<div className='flex items-center gap-2 mb-3'>
								{getWorkstationIcon(type)}
								<h3 className={`text-lg font-bold ${theme.title}`}>
									{getPhaseLabel(phase)}
								</h3>
								<Badge className={theme.countBadge}>
									{(stations as any[]).length}{' '}
								{(stations as any[]).length === 1 ? 'Máquina' : 'Máquinas'}
								</Badge>
							</div>

				<div className='flex gap-2 items-start'>
					<div className='flex-1 min-w-0 grid grid-cols-2 gap-2'>
									{(stations as any[]).map(station => {
										const assignedWorkers = getAssignedWorkers(station.id);
										const occupancy = assignedWorkers.length;
										const capacity = station.max_workers;

										return (
											<DroppableWorkstation
												key={station.id}
												station={station}
												assignedWorkers={assignedWorkers}
												occupancy={occupancy}
												capacity={capacity}
												onWorkerSelect={onWorkerSelect}
												selectedOT={selectedOT}
												monthlyOvertimeByWorker={monthlyOvertimeByWorker}
												workerIndicatorsById={workerIndicatorsById}
												showOnlyOvertime={showOnlyOvertime}
												getWorkerMeta={getWorkerMeta}
												onUnassignWorker={onUnassignWorker}
												maintenanceBlock={stationsUnderMaintenance?.[station.id]}
												maintenanceUnknown={maintenanceCheckFailed}
											/>
										);
									})}
								</div>

								<Card className={`${theme.poolCard} p-2 sticky top-4 self-start w-40 shrink-0`}>
									<div className='mb-2'>
										<h4 className='text-xs font-semibold text-foreground'>
											Operarios disponibles — {getPhaseLabel(phase)}
										</h4>
										<p className='text-[10px] text-muted-foreground leading-tight'>
											Arrastra hacia una máquina para asignar. Usa la X para quitar.
										</p>
									</div>
									<DroppableAvailablePool
										id={`available-${phase}`}
										className='p-2'
									>
										<div className='space-y-2 max-h-[420px] overflow-y-auto pr-1'>
											{phaseWorkers.length > 0 ? (
												phaseWorkers.map(worker => {
													const bestType = bestTypeForWorker(worker, types);
													const meta = getWorkerMeta(worker, bestType);
													return (
														<DraggableWorker
															key={worker.id}
															worker={worker}
															compact
															isOvertime={meta.overtime}
															monthlyOvertime={monthlyOvertimeByWorker?.[worker.id]}
															costInfo={meta.costInfo}
															planningScore={meta.planningScore}
															explainability={meta.explainability}
															indicators={workerIndicatorsById?.[worker?.id]}
															stationType={type}
														/>
													);
												})
											) : (
												<p className='text-sm text-muted-foreground border border-dashed border-border rounded-md p-3'>
													No hay operarios disponibles para este sector.
												</p>
											)}
										</div>
									</DroppableAvailablePool>
								</Card>
							</div>
						</Card>
						);
					}
				)}
			</div>

			{/* Workers without department-machine mapping */}
			{visibleUncategorizedWorkers.length > 0 && (
				<Card className='bg-card border-border p-6'>
					<div className='flex items-center gap-2 mb-3'>
						<Hand className='w-5 h-5 text-primary' />
						<div>
							<h3 className='text-lg font-bold text-foreground'>
								Otros Operarios Disponibles
							</h3>
							<p className='text-sm text-muted-foreground'>
								Estos operarios no tienen una máquina asignada como principal.
							</p>
						</div>
						<Badge className='ml-auto bg-primary/15 text-foreground border-primary/30'>
							{visibleUncategorizedWorkers.length}
						</Badge>
					</div>
					<DroppableAvailablePool id='available-other' className='p-3'>
						<div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'>
							{visibleUncategorizedWorkers.map(worker => {
								const primaryType = getWorkerPrimaryType(worker);
								const meta = getWorkerMeta(worker, primaryType);
								return (
									<DraggableWorker
										key={worker.id}
										worker={worker}
										isOvertime={meta.overtime}
										monthlyOvertime={monthlyOvertimeByWorker?.[worker.id]}
										costInfo={meta.costInfo}
										planningScore={meta.planningScore}
										explainability={meta.explainability}
										indicators={workerIndicatorsById?.[worker?.id]}
										stationType={primaryType}
									/>
								);
							})}
						</div>
					</DroppableAvailablePool>
				</Card>
			)}
		</div>
	);
}
