import { Printer, Scissors, Layers, Wrench } from 'lucide-react';
import { machineGroupRank } from '@/lib/machine-groups';
import { getWorkerQualificationScore } from '@/lib/workstation-skills';

// Puras — no leen props ni estado del componente, sólo su propio argumento —
// así que viven a nivel de módulo en vez de recrearse (y volver a pasarse
// como prop con una identidad distinta) en cada render (auditoría de
// performance 2026-09).
export const getWorkstationIcon = (type: string) => {
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

export const getWorkstationColor = (type: string) => {
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

export const getDepartmentTheme = (type: string) => {
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
export const typesInPhase = (stations: any[]): string[] =>
	[...new Set(stations.map((s: any) => s.type).filter(Boolean))].sort(
		(a, b) => machineGroupRank(a) - machineGroupRank(b),
	);

/** El tipo de la fase en el que este operario puntúa mejor. Pura. */
export const bestTypeForWorker = (worker: any, types: string[]): string =>
	types.reduce((best, t) =>
		(getWorkerQualificationScore(worker, t) ?? -1) > (getWorkerQualificationScore(worker, best) ?? -1) ? t : best,
	types[0]);

export const PLANNING_WEIGHTS = {
	skill: 0.4,
	availability: 0.2,
	cost: 0.3,
	overtimeRisk: 0.1,
};
