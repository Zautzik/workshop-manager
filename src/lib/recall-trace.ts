/**
 * El simulacro de retiro, en las dos direcciones.
 *
 * Lo que existía va HACIA ADELANTE: dado un lote sospechoso, qué OT lo usaron y
 * a qué clientes se despachó. Es la mitad que un auditor pide primero.
 *
 * La otra mitad es la que aparece en la vida real, y no estaba: llama un cliente
 * con una caja que se abre sola, o con una etiqueta que se despegó. Lo que hay
 * es un número de guía, o el nombre del cliente, o una fecha. De ahí hay que
 * llegar al papel — y después volver hacia adelante, porque el mismo lote está
 * en otros trabajos que todavía nadie reclamó.
 *
 *   reclamo → guía → OT → consumos → LOTE → OC → proveedor → certificado
 *                                       ↓
 *                            todo lo demás que salió de ese lote
 *
 * Esa vuelta completa es el hallazgo: el reclamo es de una caja, el problema es
 * del lote, y el alcance son todos los clientes que recibieron algo hecho con
 * él. Contestar sólo la primera pregunta deja el resto en la calle.
 *
 * ── Por qué el tiempo importa ───────────────────────────────────────────────
 *
 * El criterio de FSSC 22000 no es que la información exista: es reconstruirla en
 * menos de cuatro horas. Por eso esto devuelve la cadena armada y no los datos
 * para que alguien la arme.
 */

export interface Consumo {
	lotId: string;
	lotNumber: string;
	material: string | null;
	quantity: number;
	consumedAt: string;
	/** Entró con el certificado vencido o sin certificado. */
	authorizedDeviation: boolean;
	deviationReason?: string | null;
}

export interface OTAfectada {
	otId: string;
	otNumber: string;
	clientName: string | null;
	status: string;
	/** Guías con las que salió, si ya se despachó. */
	guides: { guideNumber: string; dispatchDate: string | null; quantity: number | null }[];
}

export interface LoteEnLaCadena {
	lotId: string;
	lotNumber: string;
	material: string | null;
	supplier: string | null;
	ocNumber: string | null;
	certificationCode: string | null;
	certificationExpiresOn: string | null;
	receivedDate: string | null;
	/** Cuánto de este lote entró en el trabajo por el que se preguntó. */
	quantityInSubject: number;
	deviationAtUse: boolean;
}

export interface TraceBackward {
	/** Por dónde se entró: una OT, una guía o un cliente. */
	subject: { kind: 'ot' | 'guia' | 'cliente'; label: string };
	/** Las OT alcanzadas por la consulta inicial. */
	ots: OTAfectada[];
	/** Los lotes que esas OT consumieron. La respuesta a «de qué está hecho». */
	lots: LoteEnLaCadena[];
	/** Hacia adelante otra vez: qué MÁS salió de esos lotes. */
	blastRadius: OTAfectada[];
	/** Clientes distintos alcanzados, contando el reclamo y el resto. */
	clientsReached: string[];
	warnings: string[];
}

/**
 * Los lotes que un conjunto de consumos representa, sin repetir.
 *
 * Un lote consumido tres veces por la misma OT es UN lote con la suma. Listarlo
 * tres veces obliga a sumar a mano durante un simulacro, que es justo cuando no
 * hay tiempo.
 */
export function agruparLotes(
	consumos: readonly Consumo[],
	detalles: ReadonlyMap<string, Omit<LoteEnLaCadena, 'quantityInSubject' | 'deviationAtUse'>>,
): LoteEnLaCadena[] {
	const porLote = new Map<string, { qty: number; desvio: boolean }>();

	for (const c of consumos) {
		const previo = porLote.get(c.lotId) ?? { qty: 0, desvio: false };
		porLote.set(c.lotId, {
			qty: previo.qty + c.quantity,
			desvio: previo.desvio || c.authorizedDeviation,
		});
	}

	return Array.from(porLote.entries())
		.map(([lotId, v]) => {
			const d = detalles.get(lotId);
			return {
				lotId,
				lotNumber: d?.lotNumber ?? '(desconocido)',
				material: d?.material ?? null,
				supplier: d?.supplier ?? null,
				ocNumber: d?.ocNumber ?? null,
				certificationCode: d?.certificationCode ?? null,
				certificationExpiresOn: d?.certificationExpiresOn ?? null,
				receivedDate: d?.receivedDate ?? null,
				quantityInSubject: v.qty,
				deviationAtUse: v.desvio,
			};
		})
		.sort((a, b) => b.quantityInSubject - a.quantityInSubject);
}

/**
 * Lo que hay que mirar antes de contestar.
 *
 * Un simulacro no se aprueba mostrando la cadena: se aprueba mostrando que la
 * cadena está COMPLETA. Un eslabón faltante es el hallazgo, y decirlo primero
 * es más honesto que dejar que el auditor lo encuentre.
 */
export function revisarCadena(t: {
	ots: readonly OTAfectada[];
	lots: readonly LoteEnLaCadena[];
}): string[] {
	const avisos: string[] = [];

	if (t.ots.length === 0) {
		avisos.push('No se encontró ninguna orden. Revisá el número o la fecha.');
		return avisos;
	}

	if (t.lots.length === 0) {
		// El caso más grave y el más fácil de pasar por alto: la OT existe, se
		// fabricó, y nadie registró de qué papel. La cadena está cortada en el
		// eslabón que importa.
		avisos.push(
			'Ninguna de estas órdenes tiene consumo de material registrado: no se puede saber de qué lote salieron.',
		);
	}

	const sinCert = t.lots.filter((l) => !l.certificationCode);
	if (sinCert.length > 0) {
		avisos.push(
			`${sinCert.length} ${sinCert.length === 1 ? 'lote' : 'lotes'} sin certificado registrado: ${sinCert
				.map((l) => l.lotNumber)
				.join(', ')}.`,
		);
	}

	const conDesvio = t.lots.filter((l) => l.deviationAtUse);
	if (conDesvio.length > 0) {
		avisos.push(
			`${conDesvio.length} ${conDesvio.length === 1 ? 'lote entró' : 'lotes entraron'} con desviación autorizada. Hay que adjuntar la autorización al expediente.`,
		);
	}

	const sinOC = t.lots.filter((l) => !l.ocNumber);
	if (sinOC.length > 0) {
		avisos.push(
			`${sinOC.length} ${sinOC.length === 1 ? 'lote no cuelga' : 'lotes no cuelgan'} de ninguna orden de compra: falta el eslabón hacia el proveedor.`,
		);
	}

	const sinDespacho = t.ots.filter((o) => o.guides.length === 0);
	if (sinDespacho.length > 0 && sinDespacho.length < t.ots.length) {
		avisos.push(
			`${sinDespacho.length} de ${t.ots.length} órdenes todavía no se despacharon: ese producto se puede retener antes de que salga.`,
		);
	}

	return avisos;
}

/**
 * El alcance, en una frase.
 *
 * Es lo primero que pregunta quien decide si se retira o no: cuánto abarca. Un
 * número de lotes no alcanza — lo que define la decisión es cuántos CLIENTES
 * recibieron producto.
 */
export function alcance(t: TraceBackward): string {
	if (t.lots.length === 0) return 'Sin material trazado.';

	const otras = t.blastRadius.length;
	const clientes = t.clientsReached.length;

	const base =
		`${t.lots.length} ${t.lots.length === 1 ? 'lote' : 'lotes'} de material` +
		` en ${t.ots.length} ${t.ots.length === 1 ? 'orden' : 'órdenes'}`;

	if (otras === 0) {
		return `${base}. Ese material no se usó en ningún otro trabajo.`;
	}

	return (
		`${base}. El mismo material salió en ${otras} ${otras === 1 ? 'orden más' : 'órdenes más'}, ` +
		`alcanzando ${clientes} ${clientes === 1 ? 'cliente' : 'clientes'} en total.`
	);
}
