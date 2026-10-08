'use client';

import { memo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wrench, GaugeCircle, MapPin, Zap } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { getWorkstationIcon, getWorkstationColor } from './workstation-visuals';
import { DraggableWorker } from './DraggableWorker';

export const DroppableWorkstation = memo(function DroppableWorkstation({
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
