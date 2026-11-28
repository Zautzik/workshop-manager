/**
 * Lo que un fragmento hereda de la OT de la que salió.
 *
 * ── El callejón que esto cierra ─────────────────────────────────────────────
 *
 * `split_ot` parte una OT en dos filas de `ots`: el padre se achica y nace un
 * fragmento con id propio. Copia una lista fija de columnas y NINGUNA fila
 * hija: el programa de máquina, las operaciones, el arte, el visto bueno del
 * cliente, los requisitos de Compras y los costos reales siguen colgando del
 * id del padre.
 *
 * Las compuertas de `validateTransition` se alimentan justo de esas filas, y
 * `moveOT` las buscaba sólo por el id de la OT que se mueve. Para un fragmento
 * la respuesta era siempre «no hay nada»:
 *
 *   visto_bueno → paper_purchase   APPROVAL_REQUIRED — el cliente ya firmó la
 *                                  prueba, pero la firma está en el padre;
 *   pre_press → cualquiera         SPEC_INCOMPLETE — un fragmento devuelto a
 *                                  Pre-Prensa perdió montaje, operaciones, arte
 *                                  y herramental, y había que rehacer la ficha
 *                                  de un trabajo que ya estaba en máquina;
 *   → in_delivery / completed      COSTS_REQUIRED — los costos del trabajo se
 *                                  cargan una vez, en el padre.
 *
 * Y al revés, una compuerta que se abría sola: los requisitos de Compras no se
 * copian, así que el fragmento entraba a bodega con el pantone del padre sin
 * pedir.
 *
 * Un fragmento es el mismo trabajo partido en cantidades (es la regla que ya
 * siguen el papel, las pasadas y la ruta). Lo que se decidió una vez para el
 * trabajo vale para todas sus partes.
 *
 * ── Lo que NO se hereda ─────────────────────────────────────────────────────
 *
 * La revisión de calidad antes de `ready_for_delivery`: se revisa lo que sale
 * por la puerta, y cada fragmento sale en su propio despacho. Que la mitad de
 * ayer estuviera bien no dice nada de la de hoy.
 *
 * Y `vb_id`: el visto bueno guarda el precio del trabajo ENTERO, y el
 * fragmento lleva su parte proporcional. Compararlos haría que la compuerta de
 * precio mida el reparto y no un desvío.
 *
 * Módulo puro: quién es el dueño y qué cuenta se decide acá, sin base de
 * datos, para poder probarlo. Las lecturas viven en `moveOT`.
 */

import type { OTWorkflowStatus } from '@/lib/ot-state-machine';
import { cuentaParaCalidadInterna, type ApprovalOrigin } from '@/lib/ot-approval-origin';

type Row = Record<string, any>;

/**
 * Columnas de la ficha que `split_ot` no copia y que las compuertas leen.
 *
 * Se resuelven al leer y no sólo en la función SQL para que también valgan
 * para los fragmentos que ya existen.
 */
export const FRAGMENT_INHERITED_COLUMNS = [
	'ink_coverage',
	'die_source',
	'die_code',
	'die_id',
	'cliche_code',
	'relieve_matrix_code',
	'lamination_type',
] as const;

/** Lo que hay que traer de cada miembro del grupo para resolver la herencia. */
export const SPLIT_GROUP_SELECT = `id, ot_number, sin_arte, ${FRAGMENT_INHERITED_COLUMNS.join(', ')}`;

export interface SplitMember {
	id: string;
	ot_number: string;
}

/**
 * La OT dueña de un grupo partido: la que conserva el número sin sufijo.
 *
 * `split_ot` numera los fragmentos `<base>-B`, `<base>-C`…, y partir un
 * fragmento sigue colgando del mismo `<base>`. Es la misma regla que usan la
 * salida de papel y la siembra de costos; si el dueño no está en el grupo
 * (borrado, o un número fuera de norma), la OT responde por sí misma.
 */
export function splitOwner<T extends SplitMember>(ot: T, group: readonly T[]): T {
	const base = String(ot.ot_number).split('-')[0];
	return group.find((g) => g.ot_number === base) ?? ot;
}

/** Los ids cuya evidencia vale para esta OT: ella misma y, si es un fragmento, su dueña. */
export function lineageIds(ot: SplitMember, owner: SplitMember): string[] {
	return owner.id === ot.id ? [ot.id] : [ot.id, owner.id];
}

const sinDato = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * La fila del fragmento, con los huecos de la ficha completados desde la dueña.
 *
 * Lo que el fragmento tenga escrito manda: sólo se rellena lo vacío.
 * `sin_arte` es NOT NULL con default `false`, así que un fragmento nunca lo
 * trae vacío — se hereda como «alguna de las dos lo declaró».
 */
export function inheritSpecColumns<T extends Row>(ot: T, owner: Row | null | undefined): T {
	if (!owner || owner.id === ot.id) return ot;
	const filled: Row = { ...ot };
	for (const col of FRAGMENT_INHERITED_COLUMNS) {
		if (sinDato(filled[col]) && !sinDato(owner[col])) filled[col] = owner[col];
	}
	filled.sin_arte = Boolean(ot.sin_arte) || Boolean(owner.sin_arte);
	return filled as T;
}

export interface LineageApproval extends ApprovalOrigin {
	ot_id?: string | null;
	status?: string | null;
}

/**
 * ¿Esta aprobación abre la compuerta hacia `toStatus` para la OT que se mueve?
 *
 * `ot_approvals` guarda dos cosas con la misma forma (ver
 * `ot-approval-origin.ts`) y cada compuerta pide una distinta:
 *
 *   `paper_purchase`      el visto bueno del CLIENTE sobre la prueba. Vale de
 *                         cualquier origen —el portal es justamente el cliente
 *                         firmando— y de cualquier miembro del linaje: la
 *                         prueba es del trabajo, no de una de sus mitades.
 *   cualquier otro        la revisión INTERNA de calidad: sólo la propia, y
 *                         nunca la que escribió el portal público.
 */
export function approvalOpensGate(
	toStatus: OTWorkflowStatus,
	approval: LineageApproval,
	movingOtId: string,
): boolean {
	if (approval.status !== 'approved') return false;
	if (toStatus === 'paper_purchase') return true;
	return approval.ot_id === movingOtId && cuentaParaCalidadInterna(approval);
}
