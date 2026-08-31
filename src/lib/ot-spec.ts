/**
 * Una OT no está completa o incompleta. Está completa PARA ALGO.
 *
 * ── El problema que resuelve ────────────────────────────────────────────────
 *
 * El vendedor necesita dar un precio por teléfono en dos minutos. La orden que
 * ese precio origina pide cuarenta campos. Obligar al vendedor a llenarlos todos
 * mata la venta; dejar que la OT nazca a medias mata el costeo.
 *
 * La salida es reconocer que hay tres momentos distintos y que cada uno tiene su
 * propia idea de «completo»:
 *
 *   NIVEL 1 · COTIZABLE   lo que se junta con el cliente al teléfono.
 *                          Produce un precio CON BANDA, nunca uno firme.
 *
 *   NIVEL 2 · PRODUCIBLE  lo que Pre-Prensa agrega antes de comprar un solo
 *                          pliego. Produce el precio firme, y es lo que el
 *                          cliente firma sobre la prueba.
 *
 *   NIVEL 3 · CERRABLE    costos reales, guía y factura. Ya existía; lo mide
 *                          `margin-confidence.ts`.
 *
 * ── La banda, y por qué no se puede omitir ──────────────────────────────────
 *
 * Un precio en dos tiempos sin banda declarada es una trampa con pasos extra: el
 * vendedor promete $976.811, Pre-Prensa descubre $1.426.613, y alguien come la
 * diferencia. Con la banda el vendedor puede decir «entre novecientos ochenta mil
 * y un millón cuatrocientos, y esto es lo que falta para cerrarlo» sin vergüenza.
 *
 * Los anchos no son inventados: salen de medir el mismo trabajo con y sin cada
 * dato. Sin saber la prensa, el motor elige el pliego que mejor aprovecha el
 * papel —un 77×110 que ninguna Ryobi puede agarrar— y subestima 46%.
 */

/** Los tres momentos. */
export type SpecLevel = 1 | 2 | 3;

/**
 * La ficha, en términos neutrales.
 *
 * No es `UnifiedOTForm` ni el estado del diálogo del vendedor: es lo que ambos
 * tienen en común. Acoplarlo a uno de los dos formularios haría que el otro
 * tenga que traducir, y una traducción entre dos modelos es por donde se escapan
 * los campos.
 */
export interface OTSpec {
	/* ── Nivel 1 ───────────────────────────────────────────── */
	clientId?: string | null;
	productName?: string | null;
	productType?: string | null;
	quantity?: number | null;
	widthCm?: number | null;
	heightCm?: number | null;
	substrateType?: string | null;
	grammageGsm?: number | null;
	colorFront?: string | null;
	colorBack?: string | null;
	inkCoverage?: string | null;
	/** Cuáles se hacen. Un objeto vacío es «ninguna», que es una respuesta. */
	finishes?: Record<string, boolean> | null;
	deadline?: string | null;
	/** La prensa objetivo. Sin ella el pliego se elige solo, y mal. */
	pressId?: string | null;

	/* ── Nivel 2 ───────────────────────────────────────────── */
	substrateBrand?: string | null;
	substrateSupplier?: string | null;
	/** El montaje real, confirmado por Pre-Prensa. */
	impositionConfirmed?: boolean | null;
	machineId?: string | null;
	pantoneColors?: readonly string[] | null;
	/** Diseño adjunto. */
	artAttached?: boolean | null;
	/** O declarado explícitamente sin diseño, que también es una respuesta. */
	sinArte?: boolean | null;

	/* ── Herramental ───────────────────────────────────────────
	 *
	 * Sólo se piden cuando la terminación que los necesita está marcada. Un
	 * trabajo sin troquelado no tiene un hueco de troquel: tiene una respuesta,
	 * que es «no lleva». */
	/** `nuevo` | `existente`. La pregunta cara: nuevo son ~$320.000 y dos semanas. */
	dieSource?: string | null;
	/** Cuál troquel, físicamente. «El del año pasado» no lo encuentra nadie. */
	dieCode?: string | null;
	clicheCode?: string | null;
	relieveMatrixCode?: string | null;
	laminationType?: string | null;
	operationsReviewed?: boolean | null;
}

/**
 * De quién depende destrabar el pendiente.
 *
 * Es la distinción que convierte la pantalla en dos listas de trabajo distintas:
 * lo `interno` se resuelve caminando diez metros, lo `del cliente` con un
 * llamado. Mezclarlos hace que las dos cosas se vean igual de urgentes y ninguna
 * se haga.
 */
export type GapOwner = 'interno' | 'cliente';

/** Lo que falta, dicho como lo diría el jefe de taller. */
export interface Gap {
	field: keyof OTSpec;
	/** Qué falta. */
	label: string;
	/** Por qué importa. Sin esto, pedir el dato parece burocracia. */
	why: string;
	level: SpecLevel;
	owner: GapOwner;
}

/**
 * Un requisito es un hueco POTENCIAL más la condición que lo hace aplicar.
 *
 * Separado de `Gap` a propósito: la condición es cómo se decide si falta, y no
 * significa nada para quien tiene que resolverlo. Lo que sale hacia la pantalla
 * es un `Gap` sin condición.
 */
interface Requisito extends Gap {
	/** Cuándo aplica. Ausente = siempre. */
	when?: (spec: OTSpec) => boolean;
}

const vacio = (v: unknown): boolean =>
	v === null ||
	v === undefined ||
	(typeof v === 'string' && v.trim() === '') ||
	(typeof v === 'number' && !(v > 0)) ||
	(Array.isArray(v) && v.length === 0);

/**
 * Los requisitos de cada nivel, con su motivo.
 *
 * El orden importa: se muestran en este orden, y los primeros son los que más
 * mueven el precio.
 */
const REQUISITOS: Requisito[] = [
	// ── Nivel 1 ──
	{ field: 'pressId', level: 1, owner: 'interno', label: 'Prensa objetivo',
	  why: 'Decide qué pliego se puede montar, y el pliego decide los pliegos, los kilos y las horas. Es el dato que más mueve el precio.' },
	{ field: 'clientId', level: 1, owner: 'cliente', label: 'Cliente',
	  why: 'Sin cliente la orden no se puede facturar ni atribuir.' },
	{ field: 'quantity', level: 1, owner: 'cliente', label: 'Cantidad',
	  why: 'El tiraje reparte el alistamiento: mil unidades y cien mil no cuestan diez veces distinto, cuestan otra cosa.' },
	{ field: 'widthCm', level: 1, owner: 'interno', label: 'Ancho de la pieza',
	  why: 'Sin medidas no hay imposición, y sin imposición no hay pliegos que contar.' },
	{ field: 'heightCm', level: 1, owner: 'interno', label: 'Alto de la pieza', why: 'Ídem: sin medidas no hay imposición.' },
	{ field: 'substrateType', level: 1, owner: 'interno', label: 'Sustrato',
	  why: 'El papel es la línea más cara de casi todo trabajo.' },
	{ field: 'grammageGsm', level: 1, owner: 'interno', label: 'Gramaje',
	  why: 'El peso del pliego es su superficie por el gramaje: sin él no se sabe cuántos kilos se compran.' },
	{ field: 'colorFront', level: 1, owner: 'interno', label: 'Colores del frente',
	  why: 'Cada color es una plancha, y las pasadas por prensa salen de acá.' },
	{ field: 'deadline', level: 1, owner: 'cliente', label: 'Fecha de entrega',
	  why: 'Es la segunda pregunta del cliente, siempre. Y decide si el trabajo entra en la máquina o hay que pagar turno de noche.' },
	{ field: 'productType', level: 1, owner: 'cliente', label: 'Tipo de producto',
	  why: 'Precarga las terminaciones y los valores por defecto del oficio.' },

	// ── Nivel 2 ──
	// La marca y el proveedor NO son requisito para mandar la prueba.
	//
	// Se deciden al comprar, en la etapa siguiente, y con razón: dependen de qué
	// hay en plaza esa semana y a qué precio. No están en la cabeza del vendedor
	// ni en la de Pre-Prensa, y pedirlos acá frenaba la prueba por un dato que
	// nadie tenía todavía.
	//
	// El precio no queda al aire: el motor cotiza con el costo PONDERADO de las
	// compras reales del taller (`material_cost_v`), que es el promedio histórico
	// de lo que efectivamente se pagó por ese papel. Mejor estimación que una
	// marca elegida a las apuradas para poder avanzar.
	{ field: 'impositionConfirmed', level: 2, owner: 'interno', label: 'Montaje confirmado',
	  why: 'La mejor imposición teórica rara vez es la que se monta. Hasta que Pre-Prensa la confirme, los pliegos son una estimación.' },
	{ field: 'machineId', level: 2, owner: 'interno', label: 'Máquina asignada',
	  why: 'Sin máquina asignada el trabajo no se puede programar ni cargarle horas.' },
	{ field: 'artAttached', level: 2, owner: 'cliente', label: 'Diseño',
	  why: 'Sin diseño no hay planchas, y sin planchas no hay tiraje. Si el trabajo va sin diseño a propósito, hay que declararlo.' },
	{ field: 'operationsReviewed', level: 2, owner: 'interno', label: 'Operaciones revisadas',
	  why: 'El motor propone; el jefe de taller corrige. Lo que él revisó es lo que se va a cobrar.' },

	/* ── Herramental: sólo cuando la terminación lo pide ───────────────────── */
	{ field: 'dieSource', level: 2, owner: 'interno', label: 'Troquel: ¿nuevo o existente?',
	  when: (s: OTSpec) => lleva(s, 'troquelado'),
	  why: 'Un troquel nuevo son ~$320.000 y dos semanas de espera. Descubrirlo en Compras es tarde: la fecha ya se prometió.' },
	{ field: 'dieCode', level: 2, owner: 'interno', label: 'Cuál troquel',
	  // Sólo si es existente: uno nuevo todavía no tiene número.
	  when: (s: OTSpec) => lleva(s, 'troquelado') && s.dieSource === 'existente',
	  why: 'Hay que poder encontrarlo en la estantería. «El del año pasado» no es una identificación.' },
	{ field: 'clicheCode', level: 2, owner: 'interno', label: 'Cliché de hot stamping',
	  when: (s: OTSpec) => lleva(s, 'hot_stamping'),
	  why: 'El cliché se manda a grabar aparte y llega cuando llega. Sin él la máquina espera con el trabajo montado.' },
	{ field: 'relieveMatrixCode', level: 2, owner: 'interno', label: 'Matriz de relieve',
	  when: (s: OTSpec) => lleva(s, 'relieve'),
	  why: 'El relieve necesita matriz y contramatriz. Es herramienta física: o está o hay que hacerla.' },
	{ field: 'laminationType', level: 2, owner: 'interno', label: 'Tipo de laminado',
	  when: (s: OTSpec) => lleva(s, 'laminado'),
	  why: 'Brillante, mate y soft touch tienen precio y proveedor distintos. Cotizar «laminado» a secas es cotizar el más barato y comprar el que pida el cliente.' },
];

/** ¿El trabajo lleva esta terminación? Las banderas viajan con o sin prefijo
 *  `finish_` según de qué formulario vengan, y esa diferencia ya costó una
 *  pantalla que no preguntaba nada. */
function lleva(spec: OTSpec, terminacion: string): boolean {
	const f = spec.finishes;
	if (!f) return false;
	return f[terminacion] === true || f[`finish_${terminacion}`] === true;
}

/**
 * Qué falta para alcanzar un nivel.
 *
 * Acumulativo: pedir el nivel 2 devuelve también lo que falte del 1. Una ficha
 * no puede ser producible sin ser cotizable.
 */
export function missingFor(level: SpecLevel, spec: OTSpec): Gap[] {
	return REQUISITOS.filter((r) => r.level <= level)
		// Un requisito puede aplicar sólo a algunos trabajos. Sin esto, pedir el
		// troquel a todos sería ruido y no pedirlo a nadie —que es lo que pasaba—
		// deja salir a producción trabajos sin herramienta.
		.filter((r) => (r.when ? r.when(spec) : true))
		.filter((r) => {
		// El diseño tiene dos respuestas válidas: adjuntarlo, o decir que no lleva.
		if (r.field === 'artAttached') return !spec.artAttached && !spec.sinArte;
		// Las terminaciones vacías son una respuesta —«ninguna»— no un hueco.
		if (r.field === 'finishes') return spec.finishes === null || spec.finishes === undefined;
		// impositionConfirmed y operationsReviewed son booleanos, y `vacio()` sólo
		// reconoce como "falta" null/undefined/string vacío/número <= 0/array
		// vacío. `vacio(false)` da `false` -- no falta -- asi que estos dos
		// requisitos nunca se reportaban como gap sin importar el estado real de
		// la OT: el motor de precio los revisa bien (`priceBand` los niega
		// explicitamente) pero la compuerta que si bloquea nunca los veia.
		// Confirmado en vivo: una OT sin ot_machine_schedule ni ot_operations
		// paso de pre_press a visto_bueno sin objecion (auditoria 2026-08-30).
		if (r.field === 'impositionConfirmed') return !spec.impositionConfirmed;
		if (r.field === 'operationsReviewed') return !spec.operationsReviewed;
		return vacio(spec[r.field]);
	});
}

/** El nivel que la ficha alcanza hoy. `0` = ni siquiera cotizable. */
export function specLevel(spec: OTSpec): 0 | SpecLevel {
	if (missingFor(1, spec).length > 0) return 0;
	if (missingFor(2, spec).length > 0) return 1;
	return 2;
}

/* ─── La banda de precio ─────────────────────────────────────── */

export interface BandDriver {
	field: keyof OTSpec;
	label: string;
	/** Cuánto puede subir el precio real sobre el estimado, como fracción. */
	up: number;
	/** Cuánto puede bajar. */
	down: number;
	why: string;
}

/**
 * Lo que ensancha la banda, y cuánto.
 *
 * Las cifras salen de medir, no de suponer. El caso de la prensa se midió sobre
 * 100.000 etiquetas de 9×12: sin ella el motor eligió un pliego 77×110 y dio
 * $976.811; con la Ryobi real —35×50, cortado de un 70×100— dio $1.426.613.
 * Cuarenta y seis por ciento arriba.
 *
 * Y son ASIMÉTRICAS a propósito. Los datos que faltan casi siempre empujan el
 * costo hacia arriba: el pliego que la prensa acepta es más chico que el óptimo,
 * el montaje real desperdicia más que el teórico, y las terminaciones que no se
 * listaron sólo pueden sumar. Una banda simétrica prometería un ahorro que no
 * existe.
 */
export const BAND_DRIVERS: readonly BandDriver[] = [
	{ field: 'pressId', label: 'la prensa', up: 0.46, down: 0.05,
	  why: 'Sin prensa el motor elige el pliego que mejor aprovecha el papel, que suele ser más grande que el que la máquina acepta. Medido: 46% de diferencia.' },
	{ field: 'impositionConfirmed', label: 'el montaje real', up: 0.20, down: 0.05,
	  why: 'La imposición automática es la mejor posible; la que se monta pierde algo.' },
	{ field: 'substrateBrand', label: 'a cuánto se compre el papel', up: 0.10, down: 0.10,
	  why: 'Se cotiza con el promedio de lo que el taller viene pagando por ese papel. El precio firme sale en Compras, cuando se sabe a quién se le compró.' },
	{ field: 'operationsReviewed', label: 'las terminaciones exactas', up: 0.25, down: 0,
	  why: 'Una terminación que no se listó sólo puede sumar. Nunca aparece una de menos.' },
];

export interface PriceBand {
	low: number;
	high: number;
	/** Lo que falta saber, en orden de cuánto ensancha. */
	drivers: BandDriver[];
	/** `true` cuando no falta nada: el precio es firme. */
	firm: boolean;
	/** Para leer por teléfono. */
	note: string | null;
}

/**
 * La banda alrededor de un precio estimado.
 *
 * Los anchos se combinan en cuadratura —la raíz de la suma de los cuadrados— y
 * no sumándolos. Sumarlos supondría que todas las incertidumbres se equivocan
 * hacia el mismo lado a la vez, que es el caso peor y no el probable: con cuatro
 * datos faltantes la suma daría 106% y la cuadratura da 57%. Un rango que va del
 * cero al doble no ayuda a nadie a vender.
 */
export function priceBand(spec: OTSpec, base: number): PriceBand {
	const faltan = BAND_DRIVERS.filter((d) => {
		if (d.field === 'operationsReviewed') return !spec.operationsReviewed;
		if (d.field === 'impositionConfirmed') return !spec.impositionConfirmed;
		return vacio(spec[d.field]);
	});

	if (!(base > 0)) {
		return { low: 0, high: 0, drivers: faltan, firm: false, note: 'Todavía no hay precio que acotar.' };
	}

	if (faltan.length === 0) {
		return { low: base, high: base, drivers: [], firm: true, note: null };
	}

	const cuadratura = (lado: 'up' | 'down') =>
		Math.sqrt(faltan.reduce((s, d) => s + d[lado] * d[lado], 0));

	const arriba = cuadratura('up');
	const abajo = cuadratura('down');

	const low = Math.round(base * (1 - abajo));
	const high = Math.round(base * (1 + arriba));

	const nombres = faltan.map((d) => d.label);
	const lista =
		nombres.length === 1
			? nombres[0]
			: `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;

	return {
		low, high, drivers: faltan, firm: false,
		note: `Estimación: falta saber ${lista}. El precio firme sale en Pre-Prensa.`,
	};
}

/* ─── Cotizado contra firme ──────────────────────────────────── */

export interface QuoteDrift {
	pct: number | null;
	direction: 'sube' | 'baja' | 'igual' | 'sin_datos';
	/** El precio firme cayó fuera de la banda que se le dio al cliente. */
	outsideBand: boolean;
	note: string | null;
}

/** Cuánto se puede alejar el precio firme antes de que haya que volver al cliente. */
export const DRIFT_TOLERANCE = 0.10;

/**
 * Compara lo cotizado con el precio firme que salió de Pre-Prensa.
 *
 * No bloquea nada: el vendedor decide si absorbe, renegocia o explica. Lo que no
 * puede pasar es que se entere después de que el cliente firmó la prueba.
 */
export function quoteDrift(args: {
	quoted: number | null | undefined;
	firm: number | null | undefined;
	band?: { low: number; high: number } | null;
}): QuoteDrift {
	const q = Number(args.quoted);
	const f = Number(args.firm);

	if (!(q > 0) || !(f > 0)) {
		return { pct: null, direction: 'sin_datos', outsideBand: false, note: null };
	}

	const pct = (f - q) / q;
	const outsideBand = args.band ? f > args.band.high || f < args.band.low : false;

	if (Math.abs(pct) < DRIFT_TOLERANCE) {
		return { pct, direction: 'igual', outsideBand, note: null };
	}

	const magnitud = `${Math.abs(Math.round(pct * 1000) / 10)}%`;
	const fuera = outsideBand ? ' Quedó fuera de la banda que se le dio al cliente.' : '';

	return {
		pct,
		direction: pct > 0 ? 'sube' : 'baja',
		outsideBand,
		note:
			pct > 0
				? `El precio firme quedó ${magnitud} sobre lo cotizado.${fuera} Conviene reconfirmar antes de mandar la prueba.`
				: `El precio firme quedó ${magnitud} bajo lo cotizado.${fuera}`,
	};
}
