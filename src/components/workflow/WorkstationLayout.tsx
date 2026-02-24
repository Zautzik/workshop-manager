'use client';
import { useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
	Users,
	Printer,
	Scissors,
	Wrench,
	Layers,
	GripVertical,
	Hand,
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
	onAssignmentChange: () => void;
}

function DraggableWorker({
	worker,
	assignmentId,
	isOvertime = false,
	monthlyOvertime,
	costInfo,
	planningScore,
	explainability,
	indicators,
	stationType,
}: {
	worker: any;
	assignmentId?: string;
	isOvertime?: boolean;
	monthlyOvertime?: { hours: number; shifts: number };
	costInfo?: { hourlyRate?: number; currencyCode?: string; estimatedCost?: number };
	planningScore?: number | null;
	explainability?: string[];
	stationType?: string | null;
	indicators?: {
		leaveStatus?: string;
		leaveTone?: 'ok' | 'warn' | 'alert';
		incentiveStatus?: string;
		incentiveTone?: 'ok' | 'warn' | 'alert';
		certificationAlert?: string;
		certificationTone?: 'ok' | 'warn' | 'alert';
		legalHourConflict?: boolean;
		contractRestrictionConflict?: boolean;
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

	const getToneClass = (tone?: 'ok' | 'warn' | 'alert') => {
		if (tone === 'alert') return 'text-destructive';
		if (tone === 'warn') return 'text-amber-600';
		return 'text-emerald-600';
	};

	const skillScore = Number(getWorkerQualificationScore(worker, stationType || undefined) ?? 0);
	const missingSkillConflict = Boolean(stationType) && skillScore <= 0;
	const leaveConflict = indicators?.leaveTone === 'alert';
	const legalHourConflict = Boolean(indicators?.legalHourConflict);
	const contractRestrictionConflict = Boolean(indicators?.contractRestrictionConflict && isOvertime);

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...listeners}
			{...attributes}
			className={`relative rounded-lg border-2 p-3 text-foreground shadow-sm transition-all cursor-grab active:cursor-grabbing ${
				isOvertime
					? 'border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20'
					: 'border-border bg-card hover:border-primary/60 hover:bg-accent/40'
			}`}
		>
			{!assignmentId && (
				<div className='absolute -top-2 -right-2 rounded-full border border-primary/50 bg-primary p-1'>
					<Hand className='w-4 h-4 text-primary-foreground' />
				</div>
			)}
			{isOvertime && (
				<Badge className='absolute -top-2 left-2 bg-amber-500 text-black border-amber-600 text-[10px] h-5 px-2'>
					OT +50%
				</Badge>
			)}
			<div className='mb-2 flex flex-wrap gap-1'>
				{leaveConflict ? (
					<Badge variant='destructive' className='text-[10px] h-5'>Leave conflict</Badge>
				) : null}
				{legalHourConflict ? (
					<Badge variant='destructive' className='text-[10px] h-5'>Legal hour conflict</Badge>
				) : null}
				{missingSkillConflict ? (
					<Badge variant='destructive' className='text-[10px] h-5'>Missing skill</Badge>
				) : null}
				{contractRestrictionConflict ? (
					<Badge variant='destructive' className='text-[10px] h-5'>Contract restriction</Badge>
				) : null}
			</div>
			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-2'>
					<GripVertical className='w-5 h-5 text-muted-foreground' />
					<div className='w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold'>
						{worker.name.charAt(0)}
					</div>
					<div>
						<p className='text-sm font-bold text-foreground'>{worker.name}</p>
						<p className='text-xs text-muted-foreground'>
							{worker.department || 'Unassigned department'}
						</p>
						<p className='text-[11px] text-muted-foreground'>
							Monthly OT: {(monthlyOvertime?.hours || 0).toFixed(1)}h ({monthlyOvertime?.shifts || 0} shifts)
						</p>
						{costInfo?.hourlyRate ? (
							<p className='text-[11px] text-muted-foreground'>
								Hourly salary: {costInfo.currencyCode || 'USD'} {costInfo.hourlyRate.toFixed(2)}/hr
								{typeof costInfo.estimatedCost === 'number'
									? ` | Est: ${costInfo.currencyCode || 'USD'} ${costInfo.estimatedCost.toFixed(2)}`
									: ''}
							</p>
						) : null}
						<p className={`text-[11px] ${getToneClass(indicators?.leaveTone)}`}>
							Leave: {indicators?.leaveStatus || 'Available'}
						</p>
						<p className={`text-[11px] ${getToneClass(indicators?.incentiveTone)}`}>
							Incentive: {indicators?.incentiveStatus || 'Review'}
						</p>
						{indicators?.certificationAlert ? (
							<p className={`text-[11px] ${getToneClass(indicators?.certificationTone)}`}>
								Cert: {indicators.certificationAlert}
							</p>
						) : null}
						{typeof planningScore === 'number' ? (
							<p className='text-[11px] text-muted-foreground'>
								Plan score: {planningScore.toFixed(1)}
							</p>
						) : null}
					</div>
				</div>
				<div className='text-right'>
					<div className='text-xl font-bold text-primary'>
						{worker.overall_rating}
					</div>
					<p className='text-xs text-muted-foreground'>OVR</p>
				</div>
			</div>
			{explainability && explainability.length > 0 ? (
				<div className='mt-3 rounded-md border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground'>
					<p className='font-semibold text-foreground/80'>Why selected</p>
					<ul className='mt-1 space-y-0.5'>
						{explainability.map((item, index) => (
							<li key={`${worker.id}-reason-${index}`}>{item}</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}

function DroppableAvailablePool({
	id,
	children,
	className,
	type,
}: {
	id: string;
	children: ReactNode;
	className?: string;
	type: string;
}) {
	const { setNodeRef, isOver } = useDroppable({
		id,
		data: { action: 'unassign', type },
	});

	return (
		<div
			ref={setNodeRef}
			className={`${className || ''} rounded-lg border-2 border-dashed transition-all ${
				isOver
					? 'border-primary bg-primary/10 ring-2 ring-primary/40'
					: 'border-border'
			}`}
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
}: any) {
	const { setNodeRef, isOver } = useDroppable({
		id: station.id,
		data: { workstation: station, selectedOT },
	});

	return (
		<Card
			ref={setNodeRef}
			className={`${getWorkstationColor(
				station.type
			)} border-3 p-4 transition-all duration-300 ${
				isOver
					? 'ring-2 ring-primary border-primary shadow-lg'
					: 'hover:border-primary/40 hover:shadow-md'
			}`}
		>
			<div className='flex items-center justify-between mb-3'>
				<div className='flex items-center gap-2'>
					{getWorkstationIcon(station.type)}
					<div>
						<h3 className='font-bold text-foreground text-lg'>{station.name}</h3>
						<p className='text-xs text-muted-foreground capitalize'>
							{station.type.replace('_', ' ')}
						</p>
					</div>
				</div>
				<Badge
					variant='outline'
					className={`${
						station.status === 'active'
							? 'bg-primary/15 border-primary/40 text-foreground'
							: 'bg-muted border-border text-muted-foreground'
					}`}
				>
					{station.status}
				</Badge>
			</div>

			<div className='mb-3'>
				<div className='flex items-center justify-between text-xs text-foreground mb-1'>
					<span>Capacity</span>
					<span className='font-bold'>
						{occupancy}/{capacity}
					</span>
				</div>
				<div className='h-3 bg-muted rounded-full overflow-hidden'>
					<div
						className={`h-full ${
							occupancy >= capacity ? 'bg-destructive' : 'bg-primary'
						} transition-all`}
						style={{ width: `${(occupancy / capacity) * 100}%` }}
					/>
				</div>
			</div>

			<div
				className={`space-y-2 mb-3 min-h-[140px] rounded-lg border-3 border-dashed p-3 transition-all duration-300 ${
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
						/>
					))
				) : (
					<div
						className={`text-center py-8 transition-all ${
							isOver ? 'text-primary' : 'text-muted-foreground'
						}`}
					>
						<Users
							className={`w-12 h-12 mx-auto mb-2 ${
								isOver ? 'opacity-100 scale-110' : 'opacity-50'
							}`}
						/>
						<p
							className={`text-sm font-bold ${
								isOver ? 'text-primary' : 'text-muted-foreground'
							}`}
						>
							{isOver
								? '📌 Release to assign!'
								: showOnlyOvertime
									? 'No OT workers assigned in this station'
									: 'Drop workers here'}
						</p>
					</div>
				)}
			</div>

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
	onAssignmentChange,
}: WorkstationLayoutProps) {
	const { toast } = useToast();
	const [showOnlyOvertime, setShowOnlyOvertime] = useState(false);

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
		if (!hourlyRate) return null;

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
			`Planning score: ${score.toFixed(1)} (skill + availability + cost + overtime risk)`,
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
			offset_printer: 'Offset Printers',
			guillotine: 'Guillotine Cutters',
			die_cutter: 'Die Cutters',
			workshop: 'Workshop Stations',
		};
		return labels[type] || type.replace('_', ' ');
	};

	return (
		<div className='space-y-6'>
			{/* Enhanced Instructions */}
			<Alert className='bg-card/80 border-2 border-border backdrop-blur-sm shadow-lg'>
				<Hand className='h-5 w-5 text-primary' />
				<AlertDescription className='text-foreground'>
					<strong className='text-primary text-lg'>🎯 Quick Guide:</strong>
					<ol className='mt-2 space-y-1 text-sm'>
						<li>
							1️⃣ <strong>Grab</strong> a worker card from the &quot;Available
							Workers&quot; section below
						</li>
						<li>
							2️⃣ <strong>Drag</strong> the worker over any workstation (the box
							will glow when ready)
						</li>
						<li>
							3️⃣ <strong>Drop</strong> to assign! You can also move assigned
							workers between workstations
						</li>
					</ol>
				</AlertDescription>
			</Alert>

			{/* Workshop Floor - Grouped by Machine Type - MOVED BEFORE WORKERS */}
			<div className='space-y-6'>
				<div className='flex items-center gap-3'>
					<h2 className='text-3xl font-bold text-foreground'>
						🏭 Workshop Floor
					</h2>
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
						OT workers this shift: {currentShiftOvertimeWorkerCount}
					</button>
					{showOnlyOvertime && (
						<Badge className='bg-primary/15 text-foreground border-primary/30 text-sm'>
							Showing only overtime workers
						</Badge>
					)}
				</div>
				<div className='flex flex-wrap gap-2'>
					<Badge variant='outline' className='text-[11px]'>Conflict badges:</Badge>
					<Badge variant='destructive' className='text-[11px]'>Leave conflict</Badge>
					<Badge variant='destructive' className='text-[11px]'>Legal hour conflict</Badge>
					<Badge variant='destructive' className='text-[11px]'>Missing skill</Badge>
					<Badge variant='destructive' className='text-[11px]'>Contract restriction</Badge>
				</div>

				{Object.entries(groupedWorkstations).map(
					([type, stations]: [string, any]) => {
						const theme = getDepartmentTheme(type);

						return (
						<Card
							key={type}
							className={`${theme.sectionCard} backdrop-blur-sm p-6`}
						>
							<div className='flex items-center gap-3 mb-4'>
								{getWorkstationIcon(type)}
								<h3 className={`text-xl font-bold ${theme.title}`}>
									{getTypeLabel(type)}
								</h3>
								<Badge className={theme.countBadge}>
									{(stations as any[]).length}{' '}
									{(stations as any[]).length === 1 ? 'Station' : 'Stations'}
								</Badge>
							</div>

							<div className='grid grid-cols-1 xl:grid-cols-4 gap-4'>
								<div className='xl:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-4'>
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
											/>
										);
									})}
								</div>

								<Card className={`${theme.poolCard} p-4`}>
									<div className='mb-3'>
										<h4 className='text-sm font-semibold text-foreground'>
											Available {getTypeLabel(type)} Workers
										</h4>
										<p className='text-xs text-muted-foreground'>
											Drag to station to assign, or drag assigned workers back here to unassign.
										</p>
									</div>
									<DroppableAvailablePool
										id={`available-${type}`}
										type={type}
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
													No available workers in this department.
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
								Other Available Workers
							</h3>
							<p className='text-sm text-muted-foreground'>
								These workers have no direct machine-department match.
							</p>
						</div>
						<Badge className='ml-auto bg-primary/15 text-foreground border-primary/30'>
							{visibleUncategorizedWorkers.length}
						</Badge>
					</div>
					<DroppableAvailablePool id='available-other' type='other' className='p-3'>
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
