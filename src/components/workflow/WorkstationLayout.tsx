'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Hand, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getWorkerPrimaryStationType, getWorkerQualificationScore } from '@/lib/workstation-skills';
import { useStationsUnderMaintenance } from '@/hooks/use-maintenance-queries';
import { formatCLP } from '@/lib/format';
import { machinePhase } from '@/lib/machine-groups';
import { phaseLabel, phaseRank } from '@/lib/production-phases';
import {
	getWorkstationIcon, getDepartmentTheme, typesInPhase, bestTypeForWorker, PLANNING_WEIGHTS,
} from './workstation-visuals';
import { DraggableWorker } from './DraggableWorker';
import { DroppableAvailablePool } from './DroppableAvailablePool';
import { DroppableWorkstation } from './DroppableWorkstation';

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
