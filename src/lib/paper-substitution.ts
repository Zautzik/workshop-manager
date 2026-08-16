/**
 * Ofrecer el papel que ya está en bodega.
 *
 * Un taller siempre tiene papel parado: sobrantes de tirajes anteriores,
 * compras que se hicieron de más, trabajos que se cayeron después de comprar.
 * Ese papel ya se pagó, ocupa lugar, y cada mes que pasa vale un poco menos —
 * el couché amarillea, la cartulina toma humedad, y el cliente para el que se
 * compró no vuelve.
 *
 * Mientras tanto el vendedor cotiza un couché 120 y el sistema manda a comprar
 * couché 120, con sus dos semanas de espera, teniendo cuatro mil pliegos de
 * couché 130 hace tres meses a veinte metros.
 *
 * Nadie lo hace por descuido: no hay forma de saberlo sin caminar hasta bodega
 * y revisar. Un dato que cuesta una caminata es un dato que no se consulta.
 *
 * ── Las dos direcciones no son la misma oferta ──────────────────────────────
 *
 * HACIA ARRIBA es regalar: el cliente pidió 120, se le entrega 130, recibe algo
 * mejor de lo que pagó. Nadie reclama y el vendedor lo ofrece sin incomodidad.
 *
 * HACIA ABAJO es recortar, y también es legítimo: muchísimas piezas rinden
 * igual en un gramaje menor, sale más barato, y el cliente rara vez lo nota.
 * Un taller que nunca lo propone deja plata sobre la mesa y papel parado.
 *
 * Pero no se pueden mostrar como si fueran lo mismo. Bajar es una decisión
 * TÉCNICA que alguien tiene que sostener, y lo que decide si se puede sostener
 * es el PRODUCTO: una etiqueta no le pide nada al gramaje —va pegada a un
 * envase que hace la fuerza— mientras que un estuche que se arma solo depende
 * del gramaje para no colapsar apilado.
 *
 * Por eso la bajada se propone con menos margen, con el producto mirado, y
 * dicha como lo que es: una oferta de ahorro, no un calce silencioso.
 */

/** Hasta cuánto más pesado se puede ofrecer sin que deje de ser lo mismo.
 *
 *  25% sobre lo pedido: un 120 admite hasta 150, un 300 hasta 375. Más que eso
 *  cambia el producto —y el costo— lo suficiente como para que ya no sea una
 *  sustitución sino otra cotización. */
export const MAX_SUBIDA_GRAMAJE = 0.25;

/** Hasta cuánto más liviano se puede proponer.
 *
 *  Más ajustado que la subida —15% contra 25%— porque el error tiene signo: si
 *  la subida se pasa, el cliente recibe algo mejor; si la bajada se pasa, la
 *  pieza no rinde y se reimprime. Un 120 admite bajar a 102, un 300 a 255. */
export const MAX_BAJADA_GRAMAJE = 0.15;

/** Productos cuya rigidez ES la función.
 *
 *  Un estuche se arma solo, se apila y aguanta el peso de los de arriba; una
 *  carpeta se dobla y vuelve. Bajarles el gramaje cambia si el producto sirve,
 *  no cómo se siente — y eso no lo decide el vendedor por teléfono. */
export const PRODUCTOS_ESTRUCTURALES: readonly string[] = [
	'caja_plegadiza',
	'caja_display',
	'carpeta',
	'bolsa',
	'sobre',
];

/** Si bajar el gramaje de este producto es una conversación técnica o comercial. */
export function bajarEsRiesgoso(productType: string | null | undefined): boolean {
	return PRODUCTOS_ESTRUCTURALES.includes((productType ?? '').toLowerCase());
}

/** Desde cuándo un lote empieza a ser «viejo» y conviene moverlo. */
export const DIAS_PARA_SER_VIEJO = 60;

export interface PaperNeed {
	/** Familia: couché, cartulina, bond, kraft. */
	substrateType: string;
	grammageGsm: number;
	/** Pliegos que hacen falta. */
	sheetsNeeded: number;
	/** El pliego de prensa que hay que poder cortar. */
	widthCm?: number | null;
	heightCm?: number | null;
	/** Decide si bajar el gramaje es proponible o hay que consultarlo. */
	productType?: string | null;
}

export interface StockPaper {
	itemId: string;
	/** Del ítem: si este material exige certificado para producirse. */
	requiresCert?: boolean;
	certificationExpiresOn?: string | null;
	itemName: string;
	grammageGsm: number | null;
	sheetWidthCm?: number | null;
	sheetHeightCm?: number | null;
	lotId: string;
	lotNumber: string;
	quantityAvailable: number;
	receivedDate: string | null;
	unitCost?: number | null;
}

export interface Suggestion {
	stock: StockPaper;
	score: number;
	/** Alcanza para todo el trabajo. Si no, igual sirve: se completa comprando. */
	fitsFully: boolean;
	/** Cuánto del trabajo cubre, 0–1. */
	coverage: number;
	grammageDelta: number;
	/** Vence dentro del plazo del trabajo: se puede ofrecer, pero avisando. */
	certWarning: string | null;
	/** `arriba` regala, `abajo` ahorra, `igual` es el papel cotizado. */
	direction: 'arriba' | 'igual' | 'abajo';
	/** Bajar en un producto estructural: se puede, pero lo firma producción. */
	needsTechnicalOk: boolean;
	ageDays: number;
	/** Por qué se propone, en el idioma del taller. */
	reasons: string[];
	/** Lo que el vendedor le puede decir al cliente, tal cual. */
	pitch: string;
	/** Cuántos lotes distintos del mismo material se sumaron acá. */
	lotCount: number;
}

/**
 * La familia del papel, normalizada.
 *
 * Se saca del nombre porque es donde vive: el catálogo no tiene una columna de
 * familia y agregarla obligaría a reclasificar veinte materiales a mano. El
 * nombre ya lo dice —«Couche sheet 115gsm», «Cartulina C1S 300gsm»— y basta
 * con leerlo bien.
 */
export function familia(nombre: string): string {
	const n = nombre
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');

	// El adhesivo primero: «couche adhesivo» es adhesivo, no couché. Sustituir
	// uno por otro sería cambiar el producto entero.
	if (n.includes('adhesiv')) return 'adhesivo';
	if (n.includes('couche') || n.includes('couch')) return 'couche';
	if (n.includes('cartulina')) return 'cartulina';
	if (n.includes('kraft')) return 'kraft';
	if (n.includes('bond')) return 'bond';
	if (n.includes('opalina')) return 'opalina';
	return n.split(/\s+/)[0] ?? 'otro';
}

/**
 * Si este lote puede llegar a producción.
 *
 * `bloquea` — vencido o sin certificado exigido: producción lo va a rechazar.
 * `avisa`   — vence pronto: sirve hoy y puede no servir cuando se imprima.
 * `ok`      — sin problema.
 *
 * El aviso importa porque entre cotizar y consumir pasan semanas: un
 * certificado que vence en diez días está vigente cuando el vendedor lo ofrece
 * y vencido cuando la máquina lo pide.
 */
const DIAS_DE_AVISO = 45;

function certificadoAlUsarlo(s: StockPaper, hoy: Date): 'ok' | 'avisa' | 'bloquea' {
	if (!s.requiresCert) return 'ok';
	if (!s.certificationExpiresOn) return 'bloquea';

	const d = diasHasta(s.certificationExpiresOn, hoy);
	if (d < 0) return 'bloquea';
	return d <= DIAS_DE_AVISO ? 'avisa' : 'ok';
}

function avisoDeVencimiento(s: StockPaper): string {
	const f = new Date(
		(s.certificationExpiresOn ?? '').length <= 10
			? `${s.certificationExpiresOn}T00:00:00`
			: (s.certificationExpiresOn as string),
	);
	return `El certificado vence el ${f.toLocaleDateString('es-CL')}: si el trabajo se demora, hay que renovarlo antes de imprimir.`;
}

const diasHasta = (fecha: string, hoy: Date): number => {
	const d = new Date(fecha.length <= 10 ? `${fecha}T00:00:00` : fecha);
	const aMedianoche = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
	return Math.round((aMedianoche(d).getTime() - aMedianoche(hoy).getTime()) / 86_400_000);
};

const dias = (desde: string | null, hoy: Date): number => {
	if (!desde) return 0;
	const d = new Date(desde.length <= 10 ? `${desde}T00:00:00` : desde);
	if (!Number.isFinite(d.getTime())) return 0;
	return Math.max(0, Math.floor((hoy.getTime() - d.getTime()) / 86_400_000));
};

/** «hace 3 meses» dice más que «hace 94 días» cuando el punto es que está parado. */
export function antiguedadLegible(d: number): string {
	if (d < 14) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
	if (d < 60) return `hace ${Math.round(d / 7)} semanas`;
	const meses = Math.round(d / 30);
	return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}

/**
 * ¿Qué tenemos en bodega que sirva para esto?
 *
 * Devuelve sólo lo ofrecible, ordenado por conveniencia. Una lista que mezcla
 * lo que sirve con lo que no obliga a leerla entera, y el vendedor está al
 * teléfono con el cliente.
 */
export function substitutionCandidates(
	stock: readonly StockPaper[],
	need: PaperNeed,
	hoy = new Date(),
): Suggestion[] {
	const fam = familia(need.substrateType);
	const techo = need.grammageGsm * (1 + MAX_SUBIDA_GRAMAJE);
	const piso = need.grammageGsm * (1 - MAX_BAJADA_GRAMAJE);
	const estructural = bajarEsRiesgoso(need.productType);

	return stock
		.map((s): Suggestion | null => {
			if (s.grammageGsm == null || s.quantityAvailable <= 0) return null;
			if (familia(s.itemName) !== fam) return null;

			// ── El certificado, ANTES de ofrecerlo ────────────────────────────
			//
			// Producción rechaza un lote con el certificado vencido. Ofrecerlo acá
			// haría que el vendedor prometa «sale sin esperar la compra de papel»
			// con un papel que en planta no va a poder salir — y el que queda mal
			// es él, delante del cliente.
			//
			// Se descarta en vez de advertir: una sugerencia que no se puede
			// cumplir no es una sugerencia.
			const cert = certificadoAlUsarlo(s, hoy);
			if (cert === 'bloquea') return null;

			// Las dos direcciones, con margen distinto: el error de bajarse de más
			// se paga reimprimiendo, el de subirse de más sólo cuesta un poco.
			if (s.grammageGsm > techo) return null;
			if (s.grammageGsm < piso) return null;

			// El pliego tiene que poder dar la pieza. Si no se conocen las medidas
			// no se descarta —muchos materiales del catálogo no las tienen— pero
			// tampoco se premia.
			if (need.widthCm && need.heightCm && s.sheetWidthCm && s.sheetHeightCm) {
				const entra =
					(s.sheetWidthCm >= need.widthCm && s.sheetHeightCm >= need.heightCm) ||
					(s.sheetWidthCm >= need.heightCm && s.sheetHeightCm >= need.widthCm);
				if (!entra) return null;
			}

			const edad = dias(s.receivedDate, hoy);
			const cobertura = Math.min(1, s.quantityAvailable / Math.max(need.sheetsNeeded, 1));
			const delta = s.grammageGsm - need.grammageGsm;

			const direction: Suggestion['direction'] =
				delta === 0 ? 'igual' : delta > 0 ? 'arriba' : 'abajo';
			const needsTechnicalOk = direction === 'abajo' && estructural;

			const razones: string[] = [];
			if (direction === 'igual') {
				razones.push('Es exactamente el papel cotizado.');
			} else if (direction === 'arriba') {
				razones.push(`Es ${delta} g más grueso: el cliente recibe algo mejor de lo que pidió.`);
			} else {
				razones.push(
					`Es ${Math.abs(delta)} g más liviano: si la pieza rinde igual, sale más barato.`,
				);
				razones.push(
					needsTechnicalOk
						? 'Ojo: es un producto que se sostiene solo. Que lo confirme producción antes de ofrecerlo.'
						: 'Va pegado o plano, así que el gramaje no hace la función: se puede ofrecer.',
				);
			}

			if (edad >= DIAS_PARA_SER_VIEJO) {
				razones.push(`Está en bodega ${antiguedadLegible(edad)}: moverlo libera lugar y plata parada.`);
			}

			if (cobertura >= 1) razones.push('Alcanza para todo el trabajo.');
			else razones.push(`Cubre el ${Math.round(cobertura * 100)}%: el resto hay que comprarlo.`);

			// El puntaje ordena por lo que más conviene mover, no por lo que mejor
			// calza. Un papel idéntico recién llegado importa menos que uno un poco
			// más grueso que lleva tres meses parado — el primero se va a usar solo.
			let score = 0;
			// Cuanto más cerca del gramaje pedido, mejor — en cualquier dirección.
			const margen = delta >= 0
				? need.grammageGsm * MAX_SUBIDA_GRAMAJE
				: need.grammageGsm * MAX_BAJADA_GRAMAJE;
			score += (1 - Math.abs(delta) / Math.max(margen, 1)) * 30;
			score += cobertura * 40;
			score += Math.min(edad / DIAS_PARA_SER_VIEJO, 3) * 25;
			// La bajada que necesita visto bueno técnico baja en la lista: sigue
			// siendo ofrecible, pero no es lo primero que uno propone al teléfono.
			if (needsTechnicalOk) score -= 20;

			return {
				stock: s,
				score,
				fitsFully: cobertura >= 1,
				coverage: cobertura,
				grammageDelta: delta,
				certWarning: cert === 'avisa' ? avisoDeVencimiento(s) : null,
				direction,
				needsTechnicalOk,
				ageDays: edad,
				reasons: razones,
				pitch: armarPitch(s, need, delta, cobertura, needsTechnicalOk),
				lotCount: 1,
			};
		})
		.filter((x): x is Suggestion => x !== null)
		.sort((a, b) => b.score - a.score);
}

/**
 * Lo mismo, pero agrupado por MATERIAL.
 *
 * Un couché 150 repartido en cuatro lotes son cuatro filas idénticas para el
 * vendedor, y él no elige lotes: elige papel. Qué lote sale es una decisión de
 * bodega que se toma después, en Compras, con la trazabilidad puesta.
 *
 * Se suma el saldo de todos los lotes —porque para cubrir el trabajo sirven
 * todos— y se conserva el MÁS VIEJO como representante, que es el que conviene
 * mover y el que da el argumento.
 */
export function groupedCandidates(
	stock: readonly StockPaper[],
	need: PaperNeed,
	hoy = new Date(),
): Suggestion[] {
	const todos = substitutionCandidates(stock, need, hoy);
	const porMaterial = new Map<string, Suggestion[]>();

	for (const s of todos) {
		const k = s.stock.itemId;
		porMaterial.set(k, [...(porMaterial.get(k) ?? []), s]);
	}

	return Array.from(porMaterial.values())
		.map((grupo) => {
			// El más viejo manda: es el que hay que sacar de encima.
			const rep = grupo.reduce((a, b) => (b.ageDays > a.ageDays ? b : a));
			const total = grupo.reduce((acc, g) => acc + g.stock.quantityAvailable, 0);
			const cobertura = Math.min(1, total / Math.max(need.sheetsNeeded, 1));

			return {
				...rep,
				stock: { ...rep.stock, quantityAvailable: total },
				coverage: cobertura,
				fitsFully: cobertura >= 1,
				lotCount: grupo.length,
				// Se recalcula con el total: un material que en un lote sólo cubría
				// el 40% puede cubrir todo sumando los cuatro.
				pitch: armarPitch(rep.stock, need, rep.grammageDelta, cobertura, rep.needsTechnicalOk),
				reasons: rep.reasons.map((r) =>
					r.startsWith('Cubre el')
						? cobertura >= 1
							? 'Alcanza para todo el trabajo.'
							: `Cubre el ${Math.round(cobertura * 100)}%: el resto hay que comprarlo.`
						: r,
				),
			};
		})
		.sort((a, b) => b.score - a.score);
}

/**
 * La frase que el vendedor le dice al cliente.
 *
 * Se escribe acá y no en la pantalla porque es la parte que se repite mal: un
 * vendedor apurado dice «tenemos un papel parecido», que suena a que le están
 * dando un descarte. Dicho como corresponde —más grueso, disponible hoy— es
 * una mejora, y encima es cierta.
 */
function armarPitch(
	s: StockPaper,
	need: PaperNeed,
	delta: number,
	cobertura: number,
	needsTechnicalOk: boolean,
): string {
	const entrega = cobertura >= 1 ? ', y sale sin esperar la compra de papel' : '';

	if (delta === 0) {
		return `Tenemos el ${s.itemName} en bodega${entrega}.`;
	}

	if (delta > 0) {
		return `Tenemos ${s.itemName} —${delta} g más grueso que el ${need.grammageGsm} cotizado—${entrega}.`;
	}

	// La bajada se ofrece como lo que es: un ahorro, con el precio dicho de
	// frente. Disfrazarla de «papel equivalente» es lo que produce el reclamo.
	const base = `Podemos hacerlo en ${s.grammageGsm} g en vez de ${need.grammageGsm}: baja el costo del papel${entrega}`;
	return needsTechnicalOk ? `${base} — confirmá con producción que la pieza aguanta.` : `${base}.`;
}

/**
 * Lo que se gana usándolo, dicho en las dos monedas que importan.
 *
 * Los días pesan más que los pesos: el papel ya está pagado, así que el ahorro
 * real no es de caja — es que el trabajo puede salir esta semana en vez de la
 * próxima. Y en una venta eso decide más que un descuento.
 */
export function beneficio(s: Suggestion, diasDeCompra = 14): { dias: number; pliegos: number } {
	return {
		dias: s.fitsFully ? diasDeCompra : 0,
		pliegos: Math.min(s.stock.quantityAvailable, Math.round(s.coverage * 100000)),
	};
}
