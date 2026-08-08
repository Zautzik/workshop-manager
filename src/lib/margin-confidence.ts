/**
 * ¿Se puede afirmar un margen, o todavía no?
 *
 * `ot_cost_summary` calcula `gross_margin = revenue − actual_cost`. Con el costo
 * real en cero —que es el estado de la base hoy— el margen queda igual al
 * ingreso y la pantalla informa 100%, en verde, con dos decimales.
 *
 * Una pantalla vacía dice «no sé». Ésa decía «te lo llevaste todo». De los dos
 * errores posibles es el que un dueño no puede detectar mirando, porque
 * confirma lo que le gustaría creer.
 *
 * Esto vive aparte y con pruebas porque la regla la necesitan al menos tres
 * superficies —el ledger, el resumen de rentabilidad y las alarmas— y ya se
 * demostró en esta base de código lo que pasa cuando el mismo cálculo se
 * reescribe en cada pantalla.
 */

export type MarginConfidence =
	/** Hay ingreso y costo real: el margen es una afirmación. */
	| 'medido'
	/** Hay ingreso pero ningún costo cargado: el margen NO es 100%, es desconocido. */
	| 'sin_costo'
	/** Sólo hay costo estimado, no real: sirve para orientar, no para cerrar. */
	| 'estimado'
	/** Ni ingreso ni costo. */
	| 'sin_datos';

export interface MarginInput {
	revenue: number | null | undefined;
	actual_cost: number | null | undefined;
	estimated_cost?: number | null | undefined;
}

export interface MarginVerdict {
	confidence: MarginConfidence;
	/** Porcentaje sólo cuando se puede afirmar. `null` cuando no. */
	pct: number | null;
	/** Monto sólo cuando se puede afirmar. */
	amount: number | null;
	/** Qué mostrar en la celda cuando no hay porcentaje. */
	label: string;
	/** Qué falta, en el idioma del taller. */
	hint: string | null;
}

const num = (v: number | null | undefined): number =>
	typeof v === 'number' && Number.isFinite(v) ? v : 0;

export function marginConfidence(row: MarginInput): MarginVerdict {
	const revenue = num(row.revenue);
	const actual = num(row.actual_cost);
	const estimated = num(row.estimated_cost);

	if (revenue <= 0 && actual <= 0) {
		return { confidence: 'sin_datos', pct: null, amount: null, label: '—', hint: null };
	}

	if (actual > 0) {
		const amount = revenue - actual;
		return {
			confidence: 'medido',
			// Sin ingreso no hay porcentaje que calcular, aunque haya costo: dividir
			// por cero daría Infinity y la celda mostraría basura.
			pct: revenue > 0 ? Math.round((amount / revenue) * 100) : null,
			amount,
			label: '',
			hint: null,
		};
	}

	// Hay ingreso y ningún costo real. Aquí es donde se informaba 100%.
	if (estimated > 0) {
		return {
			confidence: 'estimado',
			pct: null,
			amount: null,
			label: 'Sólo estimado',
			hint: 'Todavía no se carga costo real. El margen que se ve es contra la estimación, no contra lo que costó.',
		};
	}

	return {
		confidence: 'sin_costo',
		pct: null,
		amount: null,
		label: 'Sin costo',
		hint: 'No hay costo real cargado para esta OT: el margen es desconocido, no 100%.',
	};
}

/** Igual, pero sobre un conjunto: el total sólo se afirma si TODAS aportan costo. */
export function aggregateMarginConfidence(rows: readonly MarginInput[]): MarginVerdict {
	if (rows.length === 0) {
		return { confidence: 'sin_datos', pct: null, amount: null, label: '—', hint: null };
	}

	const revenue = rows.reduce((s, r) => s + num(r.revenue), 0);
	const actual = rows.reduce((s, r) => s + num(r.actual_cost), 0);
	const sinCosto = rows.filter((r) => num(r.actual_cost) <= 0).length;

	if (actual <= 0) {
		return marginConfidence({ revenue, actual_cost: 0, estimated_cost: rows.reduce((s, r) => s + num(r.estimated_cost), 0) });
	}

	const amount = revenue - actual;
	const pct = revenue > 0 ? Math.round((amount / revenue) * 100) : null;

	// Parcial: hay costo en algunas OT y en otras no. El total existe pero está
	// inflado, porque las que no tienen costo aportan ingreso sin restar nada.
	if (sinCosto > 0) {
		return {
			confidence: 'estimado',
			pct,
			amount,
			label: 'Parcial',
			hint: `${sinCosto} de ${rows.length} OT no tienen costo real cargado: el margen total está sobreestimado.`,
		};
	}

	return { confidence: 'medido', pct, amount, label: '', hint: null };
}
