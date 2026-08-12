/**
 * La maqueta: lo que cuesta convencer al cliente antes de imprimir nada.
 *
 * En Pre-Prensa se arma a mano un ejemplar del producto —cortado con bisturí o
 * en mesa de muestras, doblado y pegado— para que el cliente lo tenga en la
 * mano antes de aprobar. En envase es casi obligatorio: nadie firma un estuche
 * mirando un PDF.
 *
 * ── Por qué merece su propio módulo ─────────────────────────────────────────
 *
 * Porque es el costo que todos los sistemas pierden, y por tres razones a la vez:
 *
 * 1. **Ocurre antes de que el trabajo exista.** No hay tiraje al que cargarlo,
 *    no hay pliegos que contar. Se paga y se disuelve en «gastos generales».
 *
 * 2. **Se repite.** Un cliente exigente pide tres vueltas. Cada vuelta es
 *    material nuevo, impresión nueva y horas nuevas de alguien.
 *
 * 3. **Se paga aunque el trabajo no salga.** Si el cliente no aprueba, la
 *    maqueta ya se hizo. Ese es el costo de una cotización perdida, y hoy no
 *    aparece en ninguna parte — así que nadie sabe cuánto cuesta perder.
 *
 * La consecuencia práctica: un cliente que pide tres maquetas y aprueba a la
 * tercera puede dejar menos que uno que paga menos y aprueba a la primera, y
 * mirando sólo el margen del tiraje los dos se ven iguales.
 *
 * ── Lo que este archivo decide ──────────────────────────────────────────────
 *
 * Cómo se descompone el costo, qué se repite entre vueltas y qué no, y cómo se
 * atribuye cuando el trabajo nunca llegó a correr.
 */

/** Una vuelta de maqueta: lo que se consumió para hacerla. */
export interface MaquetaRound {
	/** Pliegos del sustrato REAL. La maqueta existe para que se toque el material. */
	sheets: number;
	/** Costo del pliego, el mismo que resuelve el motor para el tiraje. */
	costPerSheet: number;
	/**
	 * Impresión digital por pliego. Las planchas todavía no existen, así que la
	 * maqueta se imprime en la digital o en plotter — se paga por clic, no por
	 * hora de prensa.
	 */
	digitalPerSheet?: number;
	/** Horas de alguien: cortar, hendir, doblar, pegar. */
	handHours: number;
	/** Lo que cuesta esa hora, de `compensation_rates`. */
	hourlyRate: number;
	/** Fecha, para poder mirar cuánto tardó cada vuelta. */
	on?: string;
}

export interface MaquetaInput {
	rounds: readonly MaquetaRound[];
	/**
	 * Troquel de muestra, si hubo que hacer uno.
	 *
	 * Va aparte de las vueltas porque NO se repite: se corta una vez y la
	 * segunda maqueta lo reutiliza. Multiplicarlo por vuelta sería inventar un
	 * costo que el taller no pagó.
	 */
	sampleDieCost?: number;
}

export interface MaquetaCost {
	rounds: number;
	material: number;
	printing: number;
	labor: number;
	/** El troquel de muestra, una sola vez. */
	tooling: number;
	total: number;
	hours: number;
	sheets: number;
	/** Lo que costó cada vuelta, para ver si se encarecieron o se abarataron. */
	perRound: number[];
}

const n = (v: unknown): number => {
	const x = Number(v);
	return Number.isFinite(x) && x > 0 ? x : 0;
};

export function maquetaCost(input: MaquetaInput): MaquetaCost {
	let material = 0;
	let printing = 0;
	let labor = 0;
	let hours = 0;
	let sheets = 0;
	const perRound: number[] = [];

	for (const r of input.rounds) {
		const s = n(r.sheets);
		const m = s * n(r.costPerSheet);
		const p = s * n(r.digitalPerSheet);
		const h = n(r.handHours);
		const l = h * n(r.hourlyRate);

		material += m;
		printing += p;
		labor += l;
		hours += h;
		sheets += s;
		perRound.push(Math.round(m + p + l));
	}

	const tooling = n(input.sampleDieCost);

	return {
		rounds: input.rounds.length,
		material: Math.round(material),
		printing: Math.round(printing),
		labor: Math.round(labor),
		tooling: Math.round(tooling),
		total: Math.round(material + printing + labor + tooling),
		hours: Math.round(hours * 100) / 100,
		sheets,
		perRound,
	};
}

/* ─── Cómo entra al costo real de la OT ──────────────────────── */

export type MaquetaLineCategory = 'material' | 'machine' | 'labor' | 'other';

export interface MaquetaCostLine {
	category: MaquetaLineCategory;
	description: string;
	quantity: number;
	unit: string;
	unitCost: number;
	total: number;
}

/**
 * Las líneas que se escriben en el ledger, con `kind: 'actual'`.
 *
 * Se descompone igual que todo lo demás —material, máquina, mano de obra— en vez
 * de entrar como un bulto llamado «maqueta». Si entra como bulto, la pantalla de
 * «Estimado vs Real» muestra una diferencia sin explicación; descompuesta, se ve
 * que fueron cuatro pliegos de cartulina y tres horas de alguien.
 *
 * La descripción dice el número de vuelta a propósito: «Maqueta — 2ª vuelta» es
 * información, «Maqueta» no.
 */
export function maquetaCostLines(input: MaquetaInput): MaquetaCostLine[] {
	const out: MaquetaCostLine[] = [];
	const ordinal = (i: number) => `${i + 1}ª vuelta`;

	input.rounds.forEach((r, i) => {
		const s = n(r.sheets);
		const material = Math.round(s * n(r.costPerSheet));
		const printing = Math.round(s * n(r.digitalPerSheet));
		const hours = n(r.handHours);
		const labor = Math.round(hours * n(r.hourlyRate));

		if (material > 0) {
			out.push({
				category: 'material',
				description: `Maqueta — ${ordinal(i)}: sustrato`,
				quantity: s, unit: 'pliego', unitCost: n(r.costPerSheet), total: material,
			});
		}
		if (printing > 0) {
			out.push({
				category: 'machine',
				description: `Maqueta — ${ordinal(i)}: impresión digital`,
				quantity: s, unit: 'pliego', unitCost: n(r.digitalPerSheet), total: printing,
			});
		}
		if (labor > 0) {
			out.push({
				category: 'labor',
				description: `Maqueta — ${ordinal(i)}: armado a mano`,
				quantity: hours, unit: 'hrs', unitCost: n(r.hourlyRate), total: labor,
			});
		}
	});

	const tooling = n(input.sampleDieCost);
	if (tooling > 0) {
		out.push({
			category: 'other',
			description: 'Maqueta — troquel de muestra (no se repite entre vueltas)',
			quantity: 1, unit: 'global', unitCost: tooling, total: tooling,
		});
	}

	return out;
}

/* ─── Lo que cuesta perder ───────────────────────────────────── */

export interface LostQuoteInput {
	otNumber: string;
	clientName: string;
	/** `true` cuando la OT murió antes de correr: el cliente no aprobó. */
	abandoned: boolean;
	maqueta: MaquetaCost;
	/** Lo que se habría facturado, para dimensionar lo que se dejó de ganar. */
	quotedPrice?: number | null;
}

export interface MaquetaVerdict {
	/** Maquetas que se pagaron y nunca se cobraron. */
	sunkCost: number;
	lostJobs: number;
	/** Todas las maquetas del período, salgan o no. */
	totalCost: number;
	/** Proporción del gasto en maquetas que se fue en trabajos que no salieron. */
	sunkShare: number | null;
	note: string | null;
}

/**
 * Cuánto del gasto en maquetas se fue en trabajos que nunca corrieron.
 *
 * No es para castigar a nadie: hacer maquetas que no se convierten es parte del
 * oficio, igual que cotizar. Es para poder decidir con un número cuándo empezar
 * a cobrarlas — que es lo que hace un taller cuando la proporción se le va de
 * las manos.
 */
export function maquetaLoss(rows: readonly LostQuoteInput[]): MaquetaVerdict {
	if (rows.length === 0) {
		return { sunkCost: 0, lostJobs: 0, totalCost: 0, sunkShare: null, note: null };
	}

	const totalCost = rows.reduce((s, r) => s + r.maqueta.total, 0);
	const perdidas = rows.filter((r) => r.abandoned);
	const sunkCost = perdidas.reduce((s, r) => s + r.maqueta.total, 0);

	if (totalCost <= 0) {
		return { sunkCost: 0, lostJobs: perdidas.length, totalCost: 0, sunkShare: null, note: null };
	}

	const sunkShare = sunkCost / totalCost;
	const pct = `${Math.round(sunkShare * 1000) / 10}%`;

	return {
		sunkCost,
		lostJobs: perdidas.length,
		totalCost,
		sunkShare,
		note:
			perdidas.length === 0
				? null
				: `${perdidas.length} trabajo${perdidas.length > 1 ? 's' : ''} con maqueta no llegaron a correr: ` +
					`$${sunkCost.toLocaleString('es-CL')}, el ${pct} de lo gastado en maquetas.`,
	};
}

/**
 * Cuánto cuesta cada cliente en maquetas antes de aprobar.
 *
 * Es la cifra que corrige la lectura de rentabilidad por cliente: uno que pide
 * tres vueltas y aprueba a la tercera puede dejar menos que uno que paga menos y
 * aprueba a la primera, y mirando sólo el margen del tiraje los dos se ven
 * iguales.
 */
export interface ClientMaquetaLoad {
	clientName: string;
	jobs: number;
	rounds: number;
	cost: number;
	/** Vueltas por trabajo. Arriba de 2 es un cliente que cuesta convencer. */
	roundsPerJob: number;
}

export function maquetaLoadByClient(rows: readonly LostQuoteInput[]): ClientMaquetaLoad[] {
	const porCliente = new Map<string, { jobs: number; rounds: number; cost: number }>();

	for (const r of rows) {
		const a = porCliente.get(r.clientName) ?? { jobs: 0, rounds: 0, cost: 0 };
		a.jobs += 1;
		a.rounds += r.maqueta.rounds;
		a.cost += r.maqueta.total;
		porCliente.set(r.clientName, a);
	}

	return [...porCliente]
		.map(([clientName, a]) => ({
			clientName,
			jobs: a.jobs,
			rounds: a.rounds,
			cost: a.cost,
			roundsPerJob: a.jobs > 0 ? Math.round((a.rounds / a.jobs) * 100) / 100 : 0,
		}))
		.sort((a, b) => b.cost - a.cost);
}
