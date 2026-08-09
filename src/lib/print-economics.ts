/**
 * Las dos cifras con que se dirige una imprenta, y que ninguna pantalla daba.
 *
 * COSTO POR MILLAR es la unidad en que la industria cotiza. Un costo total no
 * se puede comparar entre un tiraje de 5.000 y uno de 150.000 — el segundo
 * siempre será mayor y eso no dice nada. Dividido por millar, los dos trabajos
 * quedan en la misma escala y se pueden juzgar uno contra otro.
 *
 * MARGEN POR HORA DE PRENSA es la que decide qué se programa el lunes, y es la
 * menos obvia. Cuando la prensa es el cuello de botella —y en una imprenta lo
 * es— el trabajo que conviene no es el de mayor margen sino el que deja más
 * por hora de máquina ocupada:
 *
 *     $400.000 en 8 horas  =  $50.000/hora
 *     $200.000 en 2 horas  = $100.000/hora   ← este conviene, aunque deje menos
 *
 * Elegir por margen absoluto llena la prensa de trabajos grandes y lentos, y
 * deja fuera los que pagan mejor el recurso escaso. Es el error de programación
 * más caro de un taller y no se ve mirando el margen.
 */

/** Un millar es mil pliegos. La unidad del oficio, no un parámetro. */
export const SHEETS_PER_THOUSAND = 1000;

const pos = (v: number | null | undefined): number | null =>
	typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

const fin = (v: number | null | undefined): number | null =>
	typeof v === 'number' && Number.isFinite(v) ? v : null;

// ── Costo por millar ────────────────────────────────────────────────────────

export interface PerThousandInput {
	/** Costo total del trabajo. */
	cost: number | null | undefined;
	/** Pliegos producidos — el denominador. */
	sheets: number | null | undefined;
}

/**
 * `null` cuando falta el denominador: sin pliegos no hay millar, y devolver
 * cero haría parecer gratis un trabajo del que no se sabe el tamaño.
 */
export function costPerThousand(input: PerThousandInput): number | null {
	const cost = fin(input.cost);
	const sheets = pos(input.sheets);
	if (cost === null || sheets === null) return null;
	return cost / (sheets / SHEETS_PER_THOUSAND);
}

/** Lo mismo para el precio, que es con lo que el cliente compara. */
export function pricePerThousand(revenue: number | null | undefined, sheets: number | null | undefined): number | null {
	return costPerThousand({ cost: revenue, sheets });
}

// ── Arreglo contra tiraje ───────────────────────────────────────────────────

export interface RunSplitInput {
	/** Horas de arreglo: montar planchas, entrar en registro, cuadrar color. */
	makeReadyHours: number | null | undefined;
	/** Horas de máquina corriendo. */
	runHours: number | null | undefined;
}

export interface RunSplit {
	makeReady: number;
	run: number;
	total: number;
	/** Proporción del tiempo que se fue en arreglo. `null` si no hay horas. */
	makeReadyShare: number | null;
	/**
	 * Un tiraje donde el arreglo pesa más que la corrida es un trabajo que
	 * probablemente se cotizó como si fuera grande.
	 */
	dominatedByMakeReady: boolean;
}

/**
 * El arreglo cuesta casi lo mismo en un tiraje corto que en uno largo. Separar
 * las dos horas explica de golpe por qué un cliente de tirajes cortos factura
 * mucho y deja poco.
 */
export function splitRunTime(input: RunSplitInput): RunSplit {
	const makeReady = fin(input.makeReadyHours) ?? 0;
	const run = fin(input.runHours) ?? 0;
	const total = makeReady + run;

	if (total <= 0) {
		return { makeReady: 0, run: 0, total: 0, makeReadyShare: null, dominatedByMakeReady: false };
	}

	const share = makeReady / total;
	return { makeReady, run, total, makeReadyShare: share, dominatedByMakeReady: share > 0.5 };
}

// ── Margen por hora de prensa ───────────────────────────────────────────────

export interface PressHourInput {
	revenue: number | null | undefined;
	cost: number | null | undefined;
	/** Horas de máquina que el trabajo ocupa — arreglo incluido. */
	pressHours: number | null | undefined;
}

export interface PressHourVerdict {
	margin: number | null;
	pressHours: number | null;
	/** Margen por hora de prensa ocupada. La cifra que decide la programación. */
	marginPerHour: number | null;
	/** Por qué no se puede afirmar, cuando no se puede. */
	reason: string | null;
}

export function marginPerPressHour(input: PressHourInput): PressHourVerdict {
	const revenue = fin(input.revenue);
	const cost = fin(input.cost);
	const hours = pos(input.pressHours);

	if (revenue === null || cost === null || cost === 0) {
		return {
			margin: null, pressHours: hours, marginPerHour: null,
			reason: 'Sin costo real cargado no hay margen que repartir por hora.',
		};
	}
	if (hours === null) {
		return {
			margin: revenue - cost, pressHours: null, marginPerHour: null,
			reason: 'No se sabe cuántas horas de máquina ocupó el trabajo.',
		};
	}

	const margin = revenue - cost;
	return { margin, pressHours: hours, marginPerHour: margin / hours, reason: null };
}

/**
 * Ordena trabajos por lo que dejan POR HORA DE PRENSA, no por margen absoluto.
 * Es el orden en que conviene programarlos cuando la prensa es el cuello de
 * botella. Los que no se pueden juzgar quedan al final, nunca intercalados como
 * si valieran cero.
 */
export function rankByPressHour<T extends PressHourInput>(rows: readonly T[]): (T & { verdict: PressHourVerdict })[] {
	return rows
		.map((r) => ({ ...r, verdict: marginPerPressHour(r) }))
		.sort((a, b) => {
			const av = a.verdict.marginPerHour;
			const bv = b.verdict.marginPerHour;
			if (av === null && bv === null) return 0;
			if (av === null) return 1;
			if (bv === null) return -1;
			return bv - av;
		});
}
