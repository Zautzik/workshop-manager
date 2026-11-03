/**
 * El ajuste de prensa: cuánto toma montar planchas y entonar, por pasada.
 *
 * No es una constante. Depende de la prensa —cuántos cuerpos, en qué estado
 * está— y de quién la ajusta. Por eso hay tres fuentes y una precedencia:
 *
 *   1. `ots.ajuste_minutes`       El supervisor corrigió ESTE trabajo.
 *   2. `machines.ajuste_minutes`  El supervisor fijó el de la prensa.
 *   3. Lo medido                  Mediana de lo que los operarios declararon al
 *                                 cerrar offset (`ot_stage_reports`), con
 *                                 `MIN_MEASURED_SAMPLES` como mínimo.
 *   4. El presupuesto             `CALIBRATION.MAKEREADY_HOURS_PER_PASS`.
 *
 * Lo fijado a mano manda sobre lo medido a propósito: el supervisor sabe que
 * la Roland quedó mal después de la mantención de ayer, y la mediana todavía no.
 * Pero lo medido se muestra SIEMPRE al lado, para que un número fijado hace
 * meses y ya desmentido por el taller salte a la vista.
 *
 * ── Quién ajustó ────────────────────────────────────────────────────────────
 *
 * Primero el dato de primera mano: el parte de WhatsApp deja en la pasada a
 * quien lo mandó (`operator_employee_id`). Los partes llegan casi siempre
 * después del trabajo —son retroactivos— y por eso no mueven el programa de
 * hoy: entran a esta medición y afinan el ajuste de las OT que vienen.
 *
 * Sin ese dato, el cierre del tablero no pregunta el operario: sale de `worker_assignments`
 * (máquina + día de la planta, y la OT si la asignación la nombra). Si ese día
 * hubo más de una persona en la prensa y ninguna asignación nombra la OT, el
 * ajuste cuenta para la prensa pero no se le atribuye a nadie — adivinar sería
 * medir la habilidad equivocada.
 */

import { CALIBRATION } from '@/lib/ot-calculations';
import { plantParts } from '@/lib/plant-calendar';

export const MIN_MEASURED_SAMPLES = 3;

export interface AjusteReport {
	ot_id: string;
	machine_id: string | null;
	ajuste_minutes: number | null;
	created_at: string;
	/** Dato de primera mano (el que mandó el parte de WhatsApp). Manda sobre la asignación. */
	operator_employee_id?: string | null;
}

export interface AjusteAssignment {
	employee_id: string;
	machine_id: string;
	/** YYYY-MM-DD. */
	date: string;
	ot_id: string | null;
}

export interface AjusteStat {
	medianMinutes: number;
	samples: number;
}

export interface OperatorAjuste extends AjusteStat {
	employeeId: string;
	name: string;
}

export interface MachineAjuste {
	measured: AjusteStat | null;
	byOperator: OperatorAjuste[];
}

function median(values: number[]): number {
	const s = [...values].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** La fecha de la planta (no la UTC) en que se cerró el reporte. */
export function plantDate(iso: string): string {
	const p = plantParts(Date.parse(iso));
	return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Quién operaba la máquina ese día para esa OT, si se puede saber sin adivinar. */
export function operatorFor(report: AjusteReport, assignments: AjusteAssignment[]): string | null {
	if (report.operator_employee_id) return report.operator_employee_id;
	if (!report.machine_id) return null;
	const day = plantDate(report.created_at);
	const sameDay = assignments.filter((a) => a.machine_id === report.machine_id && a.date === day);
	const forThisOt = sameDay.filter((a) => a.ot_id === report.ot_id);
	const pool = forThisOt.length > 0 ? forThisOt : sameDay;
	const people = [...new Set(pool.map((a) => a.employee_id))];
	return people.length === 1 ? people[0] : null;
}

export function measureAjuste(
	reports: AjusteReport[],
	assignments: AjusteAssignment[],
	names: Map<string, string> = new Map(),
): Record<string, MachineAjuste> {
	const byMachine = new Map<string, number[]>();
	const byMachineOperator = new Map<string, number[]>();

	for (const r of reports) {
		if (!r.machine_id || !r.ajuste_minutes || r.ajuste_minutes <= 0) continue;
		byMachine.set(r.machine_id, [...(byMachine.get(r.machine_id) ?? []), r.ajuste_minutes]);
		const who = operatorFor(r, assignments);
		if (who) {
			const k = `${r.machine_id}|${who}`;
			byMachineOperator.set(k, [...(byMachineOperator.get(k) ?? []), r.ajuste_minutes]);
		}
	}

	const out: Record<string, MachineAjuste> = {};
	for (const [machineId, values] of byMachine) {
		out[machineId] = { measured: { medianMinutes: Math.round(median(values)), samples: values.length }, byOperator: [] };
	}
	for (const [k, values] of byMachineOperator) {
		const [machineId, employeeId] = k.split('|');
		out[machineId].byOperator.push({
			employeeId,
			name: names.get(employeeId) ?? 'Operario sin nombre',
			medianMinutes: Math.round(median(values)),
			samples: values.length,
		});
	}
	for (const m of Object.values(out)) m.byOperator.sort((a, b) => a.medianMinutes - b.medianMinutes);
	return out;
}

export type AjusteSource = 'trabajo' | 'maquina' | 'medido' | 'presupuesto';

export const AJUSTE_SOURCE_LABEL: Record<AjusteSource, string> = {
	trabajo: 'corregido para este trabajo',
	maquina: 'fijado en la prensa',
	medido: 'medido en la prensa',
	presupuesto: 'del presupuesto',
};

/** El ajuste por pasada que vale, y de dónde salió. */
export function resolveAjuste(input: {
	otOverride?: number | null;
	machineManual?: number | null;
	measured?: AjusteStat | null;
}): { minutes: number; source: AjusteSource } {
	if (input.otOverride != null && input.otOverride >= 0) return { minutes: input.otOverride, source: 'trabajo' };
	if (input.machineManual != null && input.machineManual >= 0) return { minutes: input.machineManual, source: 'maquina' };
	if (input.measured && input.measured.samples >= MIN_MEASURED_SAMPLES) {
		return { minutes: input.measured.medianMinutes, source: 'medido' };
	}
	return { minutes: CALIBRATION.MAKEREADY_HOURS_PER_PASS * 60, source: 'presupuesto' };
}
