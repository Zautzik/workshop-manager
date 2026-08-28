'use client';

/**
 * Cerrar una etapa de taller: cuánto tomó y qué pasó.
 *
 * Aparece dentro del diálogo con el que se avanza una OT en el tablero, y sólo
 * cuando la etapa que termina la corre este taller. Es el único momento en que
 * el dato existe: quien mueve la tarjeta es quien acaba de ver el trabajo salir
 * de la máquina. Una pantalla aparte «para cargar horas» se llena el viernes,
 * de memoria y redondeando, que es como no tenerla.
 *
 * Por eso pide poco y en el orden en que se sabe: las horas primero —el único
 * campo obligatorio—, los pliegos perdidos después, y los textos al final. Y
 * muestra lo que la OT ya lleva registrado, porque un número se piensa mejor
 * al lado de los anteriores que solo en una caja vacía.
 */

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Clock, Info, Scissors } from 'lucide-react';
import { evaluateMerma } from '@/lib/merma';
import { validateStageReport, type StageReportInput } from '@/lib/stage-report';
import { otStatusLabel } from '@/lib/status-labels';

export interface CierreEtapa {
	hours: number | null;
	mermaSheets: number | null;
	wasteNotes: string;
	issues: string;
	observations: string;
}

export const CIERRE_VACIO: CierreEtapa = {
	hours: null,
	mermaSheets: null,
	wasteNotes: '',
	issues: '',
	observations: '',
};

/** Lo que viaja al servidor. `null` cuando la etapa no pide cierre. */
export function cierreToPayload(c: CierreEtapa) {
	return {
		hours: c.hours ?? 0,
		merma_sheets: c.mermaSheets,
		waste_notes: c.wasteNotes.trim() || null,
		issues: c.issues.trim() || null,
		observations: c.observations.trim() || null,
	};
}

/** Lo que el servidor recibe en `stage_report`. */
export type StageReportPayload = ReturnType<typeof cierreToPayload>;

export function cierreToInput(c: CierreEtapa): StageReportInput {
	return {
		hours: c.hours ?? 0,
		mermaSheets: c.mermaSheets,
		wasteNotes: c.wasteNotes,
		issues: c.issues,
		observations: c.observations,
	};
}

interface CierrePrevio {
	id: string;
	workflow_step: string;
	hours: number;
	merma_sheets: number | null;
	created_at: string;
}

interface CierreDeEtapaProps {
	otId: string;
	/** La etapa que TERMINA. */
	stage: string;
	/** Pliegos del trabajo entero, para juzgar la merma. */
	enteredSheets?: number | null;
	/** Lo que el motor estimó para el bloque al que pertenece la etapa. */
	estimatedHours?: number | null;
	value: CierreEtapa;
	onChange: (next: CierreEtapa) => void;
	/** Se enciende al intentar avanzar: hasta entonces no se marca nada en rojo. */
	showErrors?: boolean;
}

const hoursFormat = (h: number) =>
	`${h.toLocaleString('es-CL', { maximumFractionDigits: 1 })} h`;

export function CierreDeEtapa({
	otId,
	stage,
	enteredSheets,
	estimatedHours,
	value,
	onChange,
	showErrors = false,
}: CierreDeEtapaProps) {
	const [previos, setPrevios] = useState<CierrePrevio[]>([]);

	// Lo que la OT ya lleva. Si falla no se dice nada: es contexto, no un dato
	// del que dependa poder cerrar la etapa.
	useEffect(() => {
		let cancelled = false;
		fetch(`/api/ots/${otId}/stage-reports`, { credentials: 'include' })
			.then((r) => (r.ok ? r.json() : []))
			.then((rows) => { if (!cancelled) setPrevios(Array.isArray(rows) ? rows : []); })
			.catch(() => { /* contexto opcional */ });
		return () => { cancelled = true; };
	}, [otId]);

	const set = (patch: Partial<CierreEtapa>) => onChange({ ...value, ...patch });

	const check = useMemo(
		() => validateStageReport(cierreToInput(value), { enteredSheets, estimatedHours }),
		[value, enteredSheets, estimatedHours],
	);
	const problemFor = (field: 'hours' | 'mermaSheets' | 'wasteNotes') =>
		showErrors ? check.problems.find((p) => p.field === field)?.message ?? null : null;

	// El veredicto de merma se muestra en vivo mientras se escribe: ver «12% —
	// más del doble de lo tolerable» mientras todavía se puede corregir el
	// número es lo que evita el cero de relleno.
	const veredicto = useMemo(() => {
		if (!value.mermaSheets || !enteredSheets || enteredSheets <= 0) return null;
		return evaluateMerma({ merma: value.mermaSheets, pliegos: enteredSheets });
	}, [value.mermaSheets, enteredSheets]);

	const acumulado = previos.reduce((s, p) => s + Number(p.hours ?? 0), 0);
	const desvio =
		value.hours && estimatedHours && estimatedHours > 0
			? Math.round(((value.hours - estimatedHours) / estimatedHours) * 100)
			: null;

	return (
		<div className="rounded-md border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-3">
			<div className="flex items-center gap-2">
				<Clock className="h-4 w-4 text-indigo-400" />
				<p className="text-sm font-semibold text-foreground">
					Cierre de {otStatusLabel(stage)}
				</p>
				<span className="text-xs text-muted-foreground">
					· lo que tomó y lo que pasó en esta pasada
				</span>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				{/* Horas — el único campo obligatorio. */}
				<div>
					<Label htmlFor="cierre-horas" className="text-xs">
						Horas que tomó <span className="text-red-400">*</span>
					</Label>
					<Input
						id="cierre-horas"
						type="number"
						inputMode="decimal"
						min={0}
						step="0.25"
						placeholder="Ej: 4.5"
						value={value.hours ?? ''}
						onChange={(e) => {
							const raw = e.target.value;
							set({ hours: raw === '' ? null : Number(raw) });
						}}
						className={`h-9 text-sm ${problemFor('hours') ? 'border-red-500/60' : ''}`}
						aria-invalid={!!problemFor('hours')}
					/>
					<p className="text-[11px] mt-1 min-h-[15px]">
						{problemFor('hours') ? (
							<span className="text-red-400">{problemFor('hours')}</span>
						) : estimatedHours ? (
							<span className="text-muted-foreground">
								Estimado del bloque: {hoursFormat(estimatedHours)}
								{desvio !== null && Math.abs(desvio) >= 10 && (
									<span className={desvio > 0 ? ' text-amber-400' : ' text-green-400'}>
										{' '}({desvio > 0 ? '+' : ''}{desvio}%)
									</span>
								)}
							</span>
						) : (
							<span className="text-muted-foreground">Reales, no las del turno.</span>
						)}
					</p>
				</div>

				{/* Merma — opcional, pero con veredicto en vivo. */}
				<div>
					<Label htmlFor="cierre-merma" className="text-xs flex items-center gap-1">
						<Scissors className="h-3 w-3" /> Merma (pliegos perdidos)
					</Label>
					<Input
						id="cierre-merma"
						type="number"
						inputMode="numeric"
						min={0}
						step="1"
						placeholder="0"
						value={value.mermaSheets ?? ''}
						onChange={(e) => {
							const raw = e.target.value;
							set({ mermaSheets: raw === '' ? null : Math.trunc(Number(raw)) });
						}}
						className={`h-9 text-sm ${problemFor('mermaSheets') ? 'border-red-500/60' : ''}`}
						aria-invalid={!!problemFor('mermaSheets')}
					/>
					<p className="text-[11px] mt-1 min-h-[15px]">
						{problemFor('mermaSheets') ? (
							<span className="text-red-400">{problemFor('mermaSheets')}</span>
						) : veredicto?.rate != null ? (
							<span
								className={
									veredicto.level === 'critica'
										? 'text-red-400'
										: veredicto.level === 'alta'
											? 'text-amber-400'
											: 'text-muted-foreground'
								}
							>
								{(veredicto.rate * 100).toFixed(1)}% de {veredicto.entered.toLocaleString('es-CL')} pliegos
								{veredicto.level === 'normal' ? ' · dentro de lo normal' : ` · merma ${veredicto.level}`}
							</span>
						) : enteredSheets ? (
							<span className="text-muted-foreground">
								El trabajo lleva {enteredSheets.toLocaleString('es-CL')} pliegos.
							</span>
						) : (
							<span className="text-muted-foreground">Dejalo vacío si no hubo.</span>
						)}
					</p>
				</div>
			</div>

			{/* El texto de la merma sólo aparece cuando hay merma que explicar. */}
			{!!value.mermaSheets && value.mermaSheets > 0 && (
				<div>
					<Label htmlFor="cierre-merma-nota" className="text-xs">
						Qué pasó con el material
						{problemFor('wasteNotes') && <span className="text-red-400"> *</span>}
					</Label>
					<Textarea
						id="cierre-merma-nota"
						rows={2}
						placeholder="Papel ondulado, se movió el registro, se rompió en la salida..."
						value={value.wasteNotes}
						onChange={(e) => set({ wasteNotes: e.target.value })}
						className={`text-sm ${problemFor('wasteNotes') ? 'border-red-500/60' : ''}`}
						aria-invalid={!!problemFor('wasteNotes')}
					/>
					{problemFor('wasteNotes') && (
						<p className="text-[11px] mt-1 text-red-400">{problemFor('wasteNotes')}</p>
					)}
				</div>
			)}

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<div>
					<Label htmlFor="cierre-problemas" className="text-xs">Problemas durante el proceso</Label>
					<Textarea
						id="cierre-problemas"
						rows={2}
						placeholder="Paradas, atascos, ajustes, algo que se tuvo que rehacer..."
						value={value.issues}
						onChange={(e) => set({ issues: e.target.value })}
						className="text-sm"
					/>
				</div>
				<div>
					<Label htmlFor="cierre-observaciones" className="text-xs">Observaciones</Label>
					<Textarea
						id="cierre-observaciones"
						rows={2}
						placeholder="Cualquier cosa que le sirva al que sigue."
						value={value.observations}
						onChange={(e) => set({ observations: e.target.value })}
						className="text-sm"
					/>
				</div>
			</div>

			{/* Avisos: se muestran, no bloquean. Uno que bloquea deja de leerse. */}
			{check.warnings.map((w) => (
				<div key={w} className="flex items-start gap-2 text-[11px] text-amber-400">
					<AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
					<span>{w}</span>
				</div>
			))}

			{previos.length > 0 && (
				<div className="flex items-start gap-2 text-[11px] text-muted-foreground border-t border-border pt-2">
					<Info className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
					<span>
						Esta OT ya lleva <strong className="text-foreground">{hoursFormat(acumulado)}</strong>
						{' '}en {previos.length} {previos.length === 1 ? 'pasada' : 'pasadas'}:{' '}
						{previos
							.map((p) => `${otStatusLabel(p.workflow_step)} ${hoursFormat(Number(p.hours))}`)
							.join(' · ')}
					</span>
				</div>
			)}
		</div>
	);
}
