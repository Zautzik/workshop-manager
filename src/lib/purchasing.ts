/**
 * Órdenes de compra y facturas.
 *
 * Estos dos no son formularios: son documentos con valor legal y con valor de
 * certificación. La diferencia práctica está en cuatro propiedades —inmutable,
 * correlativa, atribuida y conciliada— y las tres primeras se defienden en la
 * base. Acá vive la cuarta, que es la única que necesita aritmética.
 *
 * ── El calce a tres bandas ──────────────────────────────────────────────────
 *
 * La vista anterior comparaba lo PEDIDO contra lo FACTURADO y nunca miraba lo
 * que efectivamente llegó. Entre esas dos cifras se pierde plata en silencio:
 * llegan 480 pliegos de 500 y facturan 500.
 *
 *        pedido  ──┐
 *                  ├─ brecha de recepción   → problema de BODEGA
 *      recibido  ──┤
 *                  ├─ brecha de facturación → problema de CUENTAS POR PAGAR
 *     facturado  ──┘
 *
 * Las dos brechas se reportan separadas a propósito. Sumarlas da un número que
 * puede ser cero teniendo los dos problemas, y manda a la persona equivocada a
 * resolverlo.
 */

/** Chile. Vive acá y no repartido por la aplicación. */
export const IVA_RATE = 0.19;

/**
 * Cuánto puede diferir lo recibido de lo pedido sin que alguien lo explique.
 *
 * PENDIENTE DE DEFINIR con el taller: es una política comercial, no un dato
 * técnico. 2% es un punto de partida conservador para papel, donde el proveedor
 * despacha por resmas completas.
 */
export const TOLERANCIA_RECEPCION = 0.02;

/** Lo que el emisor puede redondear sin que sea un error de tipeo. */
export const TOLERANCIA_REDONDEO_CLP = 1;

export type MatchStatus = 'ok' | 'en_revision' | 'con_diferencia';

export interface ThreeWayInput {
	/** Lo que dice la OC. */
	ordered: number;
	/** Lo que entró a bodega, valorizado. */
	received: number;
	/** Lo que el proveedor cobra. */
	invoiced: number;
}

export interface ThreeWayResult {
	status: MatchStatus;
	/** Pedido − recibido. Positivo = llegó de menos. */
	receiptGap: number;
	/** Recibido − facturado. Negativo = cobran más de lo que llegó. */
	billingGap: number;
	/** Qué mirar, en el idioma de quien lo tiene que resolver. */
	findings: string[];
	/** Si se puede pagar sin que alguien más lo revise. */
	payable: boolean;
}

const casiIgual = (a: number, b: number, tolerancia = TOLERANCIA_REDONDEO_CLP) =>
	Math.abs(a - b) <= tolerancia;

/**
 * El calce.
 *
 * Devuelve hallazgos y no un booleano porque «no cuadra» no es accionable: hay
 * que decir cuál de las dos brechas es, y las dos van a personas distintas.
 */
export function threeWayMatch(input: ThreeWayInput): ThreeWayResult {
	const { ordered, received, invoiced } = input;
	const receiptGap = ordered - received;
	const billingGap = received - invoiced;
	const findings: string[] = [];

	// Todavía no llegó nada: no es una diferencia, es una OC pendiente.
	if (received === 0 && invoiced > 0) {
		return {
			status: 'en_revision',
			receiptGap,
			billingGap,
			findings: ['Están facturando una OC de la que todavía no se recibió nada.'],
			payable: false,
		};
	}

	const margenRecepcion = Math.max(ordered * TOLERANCIA_RECEPCION, TOLERANCIA_REDONDEO_CLP);

	if (received > 0 && Math.abs(receiptGap) > margenRecepcion) {
		findings.push(
			receiptGap > 0
				? `Llegó ${formatoBreve(receiptGap)} menos de lo pedido. Lo ve bodega.`
				: `Llegó ${formatoBreve(-receiptGap)} más de lo pedido. Lo ve bodega.`,
		);
	}

	if (invoiced > 0 && !casiIgual(received, invoiced)) {
		findings.push(
			billingGap < 0
				? `Cobran ${formatoBreve(-billingGap)} más de lo que llegó. No se paga hasta aclararlo.`
				: `Facturaron ${formatoBreve(billingGap)} menos de lo recibido. Falta una factura o viene una nota.`,
		);
	}

	// Cobrar de más es lo único que bloquea el pago. Que falte facturar no es un
	// problema de quien paga, y que llegue distinto lo resuelve bodega — frenar
	// el pago por eso sólo consigue que nadie registre las diferencias.
	const cobranDeMas = invoiced > 0 && billingGap < -TOLERANCIA_REDONDEO_CLP;

	const status: MatchStatus =
		findings.length === 0 ? 'ok' : cobranDeMas ? 'con_diferencia' : 'en_revision';

	return { status, receiptGap, billingGap, findings, payable: status === 'ok' };
}

function formatoBreve(n: number): string {
	return `$${Math.round(Math.abs(n)).toLocaleString('es-CL')}`;
}

/**
 * ¿La factura cuadra consigo misma?
 *
 * Neto + IVA = total. Se atrapa en la puerta y no cuadrando a fin de mes: un
 * dígito de más en el neto pasa desapercibido durante semanas y desordena el
 * costo de todas las OT que tocaron ese papel.
 */
export function invoiceArithmetic(
	net: number,
	vat: number,
	total: number,
): { ok: boolean; message: string | null; expectedVat: number } {
	const ivaEsperado = Math.round(net * IVA_RATE);

	if (!casiIgual(net + vat, total)) {
		return {
			ok: false,
			expectedVat: ivaEsperado,
			message: `Neto más IVA da ${formatoBreve(net + vat)} y el total dice ${formatoBreve(total)}.`,
		};
	}

	// El IVA se avisa pero no se rechaza: hay facturas exentas y hay notas con
	// otra tasa. Bloquear por esto frenaría documentos legítimos.
	if (vat > 0 && Math.abs(vat - ivaEsperado) > Math.max(net * 0.005, 2)) {
		return {
			ok: true,
			expectedVat: ivaEsperado,
			message: `El IVA declarado (${formatoBreve(vat)}) no es el 19% del neto (${formatoBreve(ivaEsperado)}). Revisalo si no es exenta.`,
		};
	}

	return { ok: true, expectedVat: ivaEsperado, message: null };
}

export type CertStatus = 'vigente' | 'por_vencer' | 'vencido' | 'sin_certificado';

/** Cuántos días antes empieza a preocupar. Un certificado que vence la semana
 *  que viene ya es un problema de planificación, no una sorpresa. */
export const CERT_AVISO_DIAS = 30;

/**
 * El estado de un certificado de aptitud alimentaria.
 *
 * Para FSSC 22000 esto no es informativo: material sin certificado vigente no
 * entra a producción. La función distingue «vencido» de «sin certificado»
 * porque son fallas distintas — una es del proveedor y la otra es nuestra, por
 * no habérselo pedido.
 */
export function certStatus(expiresOn: string | null | undefined, today = new Date()): CertStatus {
	if (!expiresOn) return 'sin_certificado';
	const vence = new Date(expiresOn.length <= 10 ? `${expiresOn}T00:00:00` : expiresOn);
	if (!Number.isFinite(vence.getTime())) return 'sin_certificado';

	const dias = Math.floor((vence.getTime() - today.getTime()) / 86_400_000);
	if (dias < 0) return 'vencido';
	if (dias <= CERT_AVISO_DIAS) return 'por_vencer';
	return 'vigente';
}

export const CERT_LABELS: Record<CertStatus, string> = {
	vigente: 'Certificado vigente',
	por_vencer: 'Certificado por vencer',
	vencido: 'Certificado vencido',
	sin_certificado: 'Sin certificado',
};

/** Si el material puede entrar a producción sin autorización escrita. */
export function certPermiteRecibir(estado: CertStatus): boolean {
	return estado === 'vigente' || estado === 'por_vencer';
}

/* ─── El estado del documento ────────────────────────────────────────────── */

export type OCStatus = 'draft' | 'sent' | 'received' | 'invoiced' | 'closed' | 'cancelled';

export const OC_STATUS_LABELS: Record<OCStatus, string> = {
	draft: 'Borrador',
	sent: 'Emitida',
	received: 'Recibida',
	invoiced: 'Facturada',
	closed: 'Cerrada',
	cancelled: 'Anulada',
};

/** Sólo un borrador se edita. Después es un documento. */
export function canEdit(status: OCStatus): boolean {
	return status === 'draft';
}

/** Se anula lo que ya se emitió; un borrador se descarta y no deja rastro
 *  porque nunca fue nada. Lo cerrado y lo ya anulado no se tocan. */
export function canVoid(status: OCStatus): boolean {
	return status === 'sent' || status === 'received' || status === 'invoiced';
}

export function canReceive(status: OCStatus): boolean {
	return status === 'sent' || status === 'received';
}

export function canInvoice(status: OCStatus): boolean {
	return status === 'received' || status === 'invoiced' || status === 'sent';
}

/**
 * Qué se puede hacer con esta OC, dicho de una vez.
 *
 * Una sola función y no cuatro llamadas sueltas en la pantalla: así los botones
 * que se ven y las acciones que el servidor acepta no pueden divergir.
 */
export function ocActions(status: OCStatus) {
	return {
		editar: canEdit(status),
		emitir: status === 'draft',
		recibir: canReceive(status),
		facturar: canInvoice(status),
		anular: canVoid(status),
	};
}
