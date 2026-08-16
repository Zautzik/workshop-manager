/**
 * Cuando una OT avanza a medias, el material también.
 *
 * El Kanban ya permite mover parte de un trabajo al proceso siguiente: se
 * cortan tres mil de los seis mil y el resto queda para mañana. Pero preguntaba
 * sólo por las UNIDADES y el material se quedaba quieto — el inventario seguía
 * mostrando los seis mil pliegos disponibles después de que la mitad ya estaba
 * en la guillotina.
 *
 * La consecuencia no es de prolijidad: es que el papel que físicamente se movió
 * no queda descontado ni atado a la OT, así que la trazabilidad de ese
 * fragmento no existe. Y en un retiro, «la mitad de este trabajo» no es una
 * respuesta.
 *
 * ── El arreglo no se divide ─────────────────────────────────────────────────
 *
 * Es el detalle que hace que la cuenta simple esté mal. Los pliegos de puesta a
 * punto —registro, color, corte de prueba— se gastan UNA vez, al empezar. Si un
 * trabajo de 6.000 unidades lleva 300 pliegos de arreglo y se mueve la mitad,
 * el primer fragmento no se lleva 150: se lleva los 300 enteros más su mitad de
 * tiraje. El segundo fragmento no vuelve a arreglar la máquina.
 *
 * Repartir el arreglo proporcionalmente deja el primer fragmento corto, y
 * quedarse corto de papel a mitad de tiraje para la máquina.
 */

export interface PartialInput {
	/** Unidades que avanzan al proceso siguiente. */
	movedUnits: number;
	/** Unidades totales de la OT. */
	totalUnits: number;
	/** Pliegos totales que el motor calculó para el trabajo entero. */
	totalSheets: number;
	/** De esos, cuántos son de puesta a punto. No se dividen. */
	makeReadySheets?: number;
	/** Si este es el primer fragmento que sale (el que arregla la máquina). */
	isFirstFragment?: boolean;
}

export interface PartialMaterial {
	/** Pliegos que hay que sacar de bodega para este fragmento. */
	sheets: number;
	/** Qué porción de las unidades representa, 0–1. */
	fraction: number;
	/** Pliegos de tiraje, sin el arreglo. */
	runSheets: number;
	/** Arreglo incluido en este fragmento. */
	makeReadySheets: number;
	/** Lo que hay que decirle a quien está por sacar el papel. */
	note: string;
}

/**
 * Cuánto papel se mueve con este fragmento.
 *
 * Redondea hacia ARRIBA. No se puede cortar medio pliego, y el error tiene
 * signo: sobrar uno se devuelve a bodega, faltar uno para la máquina con el
 * trabajo montado.
 */
export function materialForPartial(input: PartialInput): PartialMaterial {
	const total = Math.max(input.totalUnits, 1);
	const movidas = Math.max(0, Math.min(input.movedUnits, total));
	const fraccion = movidas / total;

	const arreglo = Math.max(0, input.makeReadySheets ?? 0);
	const tirajeTotal = Math.max(0, input.totalSheets - arreglo);

	const tiraje = Math.ceil(tirajeTotal * fraccion);
	// El arreglo va entero con el primer fragmento y no vuelve a aparecer.
	const arregloAcá = input.isFirstFragment === false ? 0 : arreglo;

	const pliegos = tiraje + arregloAcá;
	const pct = Math.round(fraccion * 100);

	let nota: string;
	if (fraccion >= 1) {
		nota = `El trabajo completo: ${pliegos.toLocaleString('es-CL')} pliegos.`;
	} else if (arregloAcá > 0) {
		nota =
			`${pct}% de las unidades, pero ${pliegos.toLocaleString('es-CL')} pliegos: ` +
			`${tiraje.toLocaleString('es-CL')} de tiraje más los ${arregloAcá.toLocaleString('es-CL')} ` +
			`del arreglo, que se gastan una sola vez.`;
	} else {
		nota =
			`${pct}% de las unidades: ${pliegos.toLocaleString('es-CL')} pliegos. ` +
			`El arreglo ya se gastó en el fragmento anterior.`;
	}

	return {
		sheets: pliegos,
		fraction: fraccion,
		runSheets: tiraje,
		makeReadySheets: arregloAcá,
		note: nota,
	};
}

/**
 * Las etapas donde avanzar significa CONSUMIR papel.
 *
 * Salir de bodega hacia el primer corte o hacia una prensa es el momento en que
 * el papel deja de ser inventario. Las etapas posteriores mueven producto
 * semiterminado, no pliegos: volver a descontar ahí sería contar dos veces el
 * mismo papel.
 */
export const ETAPAS_QUE_CONSUMEN: readonly string[] = [
	'guillotine_first_cut',
	'offset_printing',
	'digital_printing',
];

/** ¿Este salto saca papel de bodega? */
export function consumeMaterial(fromStatus: string, toStatus: string): boolean {
	return fromStatus === 'in_storage' && ETAPAS_QUE_CONSUMEN.includes(toStatus);
}
