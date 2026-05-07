'use client';
import { useEffect, useState, type ReactNode } from 'react';
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

function DraggableWorker({
	worker,
	assignmentId,
	isOvertime = false,
	onUnassignWorker,
}: {
	worker: any;
	assignmentId?: string;
	isOvertime?: boolean;
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
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({
			id: assignmentId || `worker-${worker.id}`,
			data: { worker, assignmentId, isOvertime },
		});

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
			className={`relative flex items-center gap-2 rounded-md border px-3 py-2 text-foreground shadow-sm transition-all cursor-grab active:cursor-grabbing ${
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
			<div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
				isOvertime
					? 'bg-amber-500/30 text-amber-700 dark:text-amber-300'
					: 'bg-primary/20 text-primary'
			}`}>
				{worker.name.charAt(0)}
			</div>
			<span className='text-sm font-medium break-words'>{worker.name}</span>
			{isOvertime && (
				<span className='ml-auto text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0'>OT</span>
			)}
		</div>
	);
}

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

function DroppableWorkstation({
	station,
	assignedWorkers,
	occupancy,
	capacity,
	getWorkstationIcon,
	getWorkstationColor,
	onWorkerSelect,
	selectedOT,
	monthlyOvertimeByWorker,
	workerIndicatorsById,
	showOnlyOvertime,
	getWorkerCostInfo,
	getPlanningScore,
	getSelectionExplanation,
	onUnassignWorker,
}: any) {
	const { setNodeRef, isOver } = useDroppable({
		id: station.id,
		data: { workstation: station, selectedOT },
	});
	const normalizedCapacity = Math.max(1, Number(capacity || 0));
	const openSlotCount = Math.max(0, normalizedCapacity - occupancy);

	return (
		<Card
			ref={setNodeRef}
			className={`${getWorkstationColor(
				station.type
			)} border-3 p-3 transition-all duration-300 ${
				isOver
					? 'ring-2 ring-primary border-primary shadow-lg'
					: 'hover:border-primary/40 hover:shadow-md'
			}`}
		>
			<div className='flex items-center justify-between mb-2'>
				<div className='flex items-center gap-2 flex-1 min-w-0'>
					{getWorkstationIcon(station.type)}
					<div className='min-w-0 flex-1'>
						<h3 className='font-bold text-foreground text-base leading-tight break-words'>
							{station.machine?.name ?? station.display_name ?? station.name}
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

			<div className='mb-2'>
				<div className='flex items-center justify-between text-xs text-foreground mb-1'>
					<span>Capacity</span>
					<span className='font-bold'>
						{occupancy}/{normalizedCapacity}
					</span>
				</div>
				<div className='h-2 bg-muted rounded-full overflow-hidden'>
					<div
						className={`h-full ${
							occupancy >= normalizedCapacity ? 'bg-destructive' : 'bg-primary'
						} transition-all`}
						style={{ width: `${Math.min(100, (occupancy / normalizedCapacity) * 100)}%` }}
					/>
				</div>
			</div>

			<div
				className={`space-y-2 mb-2 min-h-[96px] rounded-lg border-2 border-dashed p-2 transition-all duration-300 ${
					isOver ? 'border-primary bg-primary/10' : 'border-border bg-muted/30'
				}`}
			>
				{assignedWorkers.length > 0 ? (
					assignedWorkers.map((assignment: any) => (
						<DraggableWorker
							key={assignment.id}
							worker={assignment.worker}
							assignmentId={assignment.id}
							isOvertime={String(assignment.role || '').includes('overtime')}
							monthlyOvertime={monthlyOvertimeByWorker?.[assignment.worker?.id]}
							costInfo={getWorkerCostInfo(
								assignment.worker,
								String(assignment.role || '').includes('overtime')
							)}
							planningScore={getPlanningScore(
								assignment.worker,
								station.type
							)}
							explainability={getSelectionExplanation(
								assignment.worker,
								station.type
							)}
							indicators={workerIndicatorsById?.[assignment.worker?.id]}
							stationType={station.type}
							onUnassignWorker={onUnassignWorker}
						/>
					))
				) : null}

				{openSlotCount > 0 && (
					<div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
						{Array.from({ length: openSlotCount }).map((_, idx) => (
							<div
								key={`open-slot-${station.id}-${idx}`}
								className={`rounded-md border border-dashed px-2 py-1.5 text-xs ${
									isOver
										? 'border-primary text-primary bg-primary/10'
										: 'border-border text-muted-foreground bg-background/40'
								}`}
							>
								{isOver ? 'Suelta aqui' : `Cupo libre ${occupancy + idx + 1}`}
							</div>
						))}
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
}

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
	const [showOnlyOvertime, setShowOnlyOvertime] = useState(false);
	const [showQuickGuide, setShowQuickGuide] = useState(false);
	const [guideOpenedOnce, setGuideOpenedOnce] = useState(false);

	useEffect(() => {
		const hasSeenGuide = sessionStorage.getItem(QUICK_GUIDE_SESSION_KEY) === '1';
		setShowQuickGuide(!hasSeenGuide);
	}, []);

	const getWorkstationIcon = (type: string) => {
		switch (type) {
			case 'offset_printer':
				return <Printer className='w-6 h-6' />;
			case 'guillotine':
				return <Scissors className='w-6 h-6' />;
			case 'die_cutter':
				return <Layers className='w-6 h-6' />;
			case 'workshop':
				return <Wrench className='w-6 h-6' />;
			default:
				return <Wrench className='w-6 h-6' />;
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

	const getAssignedWorkers = (workstationId: string) => {
		const workersInStation = assignments.filter(
			a => a.workstation_id === workstationId && a.shift_id === selectedShift
		);

		if (showOnlyOvertime) {
			return workersInStation.filter(a =>
				String(a.role || '').includes('overtime')
			);
		}

		return workersInStation;
	};

	const currentShiftAssignments = assignments.filter(
		a => a.shift_id === selectedShift
	);

	const currentShiftOvertimeAssignments = currentShiftAssignments.filter(a =>
		String(a.role || '').includes('overtime')
	);

	const currentShiftOvertimeWorkerCount = new Set(
		currentShiftOvertimeAssignments.map(a => a.employee_id ?? a.worker_id)
	).size;

	const currentShiftWorkerIds = new Set(
		currentShiftAssignments.map(a => a.employee_id ?? a.worker_id)
	);
	const otherShiftWorkerIds = new Set(
		assignments
			.filter(a => a.shift_id !== selectedShift)
			.map(a => a.employee_id ?? a.worker_id)
	);

	const unassignedWorkers = workers.filter(worker => {
		if (currentShiftWorkerIds.has(worker.id)) return false;
		if (!otherShiftWorkerIds.has(worker.id)) return true;
		return Boolean(worker.overtime_availability);
	});

	const stationTypes = Array.from(
		new Set(workstations.map(station => station.type))
	);

	const getWorkerPrimaryType = (worker: any) =>
		getWorkerPrimaryStationType(worker, stationTypes);

	const isOvertimeWorker = (worker: any) => otherShiftWorkerIds.has(worker.id);

	const getWorkerCostInfo = (worker: any, overtime: boolean) => {
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
	};

	const planningWeights = {
		skill: 0.4,
		availability: 0.2,
		cost: 0.3,
		overtimeRisk: 0.1,
	};

	const getPlanningScore = (worker: any, type?: string | null) => {
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
			planningWeights.skill * (skillScore / 5) +
			planningWeights.availability * availabilityScore +
			planningWeights.cost * costScore * 100 +
			planningWeights.overtimeRisk * overtimeRiskScore +
			(0.05 * (rating / 100));

		return Math.max(0, Math.min(100, weighted * 100));
	};

	const getSelectionExplanation = (worker: any, type?: string | null) => {
		const overtime = isOvertimeWorker(worker);
		const skillScore = Number(getWorkerQualificationScore(worker, type) ?? 0);
		const rating = Number(worker?.overall_rating ?? 0);
		const costInfo = getWorkerCostInfo(worker, overtime);
		const score = getPlanningScore(worker, type);

		return [
			`Skill fit: ${skillScore}/5 for ${type || 'station type'}`,
			overtime
				? worker?.overtime_availability
					? 'Availability: assigned in another shift, OT allowed'
					: 'Availability: assigned in another shift, OT risk elevated'
				: 'Availability: free in this shift',
			costInfo?.hourlyRate
				? `Cost estimate: ${costInfo.currencyCode || 'USD'} ${(costInfo.estimatedCost || 0).toFixed(2)} (rate ${costInfo.hourlyRate.toFixed(2)}/hr)`
				: 'Cost estimate: no active compensation rate for selected date',
			`Performance rating: ${rating.toFixed(0)}/100`,
			`Selection rationale balances skill, availability, cost, and overtime risk`,
		];
	};

	const getAvailableWorkersForType = (type: string) => {
		const availableByType = unassignedWorkers.filter(
			worker => getWorkerPrimaryType(worker) === type
		);

		const filtered = showOnlyOvertime
			? availableByType.filter(worker => isOvertimeWorker(worker))
			: availableByType;

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
	};

	const uncategorizedAvailableWorkers = unassignedWorkers.filter(
		worker => !getWorkerPrimaryType(worker)
	);

	const visibleUncategorizedWorkers = showOnlyOvertime
		? uncategorizedAvailableWorkers.filter(worker => isOvertimeWorker(worker))
		: uncategorizedAvailableWorkers;

	// Group workstations by type
	const groupedWorkstations = workstations.reduce((acc: any, station: any) => {
		if (!acc[station.type]) {
			acc[station.type] = [];
		}
		acc[station.type].push(station);
		return acc;
	}, {});

	const getTypeLabel = (type: string) => {
		const labels: { [key: string]: string } = {
			offset_printer:  'Prensas Offset',
			guillotine:      'Guillotinas',
			die_cutter:      'Troqueladoras',
			digital_printer: 'Impresión Digital',
			pre_press:       'Pre-Prensa',
			manual_workshop: 'Taller Manual',
			workshop:        'Taller',
			delivery:        'Despacho',
		};
		return labels[type] || type.replace(/_/g, ' ');
	};

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

				{Object.entries(groupedWorkstations).map(
					([type, stations]: [string, any]) => {
						const theme = getDepartmentTheme(type);

						return (
						<Card
							key={type}
							className={`${theme.sectionCard} backdrop-blur-sm p-4`}
						>
							<div className='flex items-center gap-3 mb-4'>
								{getWorkstationIcon(type)}
								<h3 className={`text-xl font-bold ${theme.title}`}>
									{getTypeLabel(type)}
								</h3>
								<Badge className={theme.countBadge}>
									{(stations as any[]).length}{' '}
								{(stations as any[]).length === 1 ? 'Máquina' : 'Máquinas'}
								</Badge>
							</div>

							<div className='grid grid-cols-1 2xl:grid-cols-5 gap-3'>
								<div className='2xl:col-span-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'>
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
												getWorkstationIcon={getWorkstationIcon}
												getWorkstationColor={getWorkstationColor}
												onWorkerSelect={onWorkerSelect}
												selectedOT={selectedOT}
												monthlyOvertimeByWorker={monthlyOvertimeByWorker}
												workerIndicatorsById={workerIndicatorsById}
												showOnlyOvertime={showOnlyOvertime}
												getWorkerCostInfo={getWorkerCostInfo}
												getPlanningScore={getPlanningScore}
												getSelectionExplanation={getSelectionExplanation}
												onUnassignWorker={onUnassignWorker}
											/>
										);
									})}
								</div>

								<Card className={`${theme.poolCard} p-3 2xl:sticky 2xl:top-4 self-start`}>
									<div className='mb-3'>
										<h4 className='text-sm font-semibold text-foreground'>
											Operarios disponibles — {getTypeLabel(type)}
										</h4>
										<p className='text-xs text-muted-foreground'>
											Arrastra hacia una máquina para asignar. Usa la X para quitar.
										</p>
									</div>
									<DroppableAvailablePool
										id={`available-${type}`}
										className='p-2'
									>
										<div className='space-y-2 max-h-[420px] overflow-y-auto pr-1'>
											{getAvailableWorkersForType(type).length > 0 ? (
												getAvailableWorkersForType(type).map(worker => (
													<DraggableWorker
														key={worker.id}
														worker={worker}
														isOvertime={isOvertimeWorker(worker)}
														monthlyOvertime={monthlyOvertimeByWorker?.[worker.id]}
														costInfo={getWorkerCostInfo(worker, isOvertimeWorker(worker))}
														planningScore={getPlanningScore(worker, type)}
														explainability={getSelectionExplanation(worker, type)}
														indicators={workerIndicatorsById?.[worker?.id]}
														stationType={type}
													/>
												))
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
					<div className='flex items-center gap-3 mb-4'>
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
							{visibleUncategorizedWorkers.map(worker => (
								<DraggableWorker
									key={worker.id}
									worker={worker}
									isOvertime={isOvertimeWorker(worker)}
									monthlyOvertime={monthlyOvertimeByWorker?.[worker.id]}
									costInfo={getWorkerCostInfo(worker, isOvertimeWorker(worker))}
									planningScore={getPlanningScore(worker, getWorkerPrimaryType(worker))}
									explainability={getSelectionExplanation(worker, getWorkerPrimaryType(worker))}
									indicators={workerIndicatorsById?.[worker?.id]}
									stationType={getWorkerPrimaryType(worker)}
								/>
							))}
						</div>
					</DroppableAvailablePool>
				</Card>
			)}
		</div>
	);
}
