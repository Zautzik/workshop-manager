'use client';

import { memo } from 'react';
import { X } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';

export const DraggableWorker = memo(function DraggableWorker({
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
