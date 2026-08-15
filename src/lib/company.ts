/**
 * La identidad de la empresa, en un solo lugar.
 *
 * Todo lo que sale impreso hacia afuera —cotizaciones, órdenes, guías— tiene que
 * decir lo mismo. Repetir el nombre y el RUT en cada plantilla garantiza que
 * algún día uno diga una dirección vieja, y el que la lee es el cliente.
 *
 * ── Para reemplazar por lo real ─────────────────────────────────────────────
 *
 * Estos valores son de relleno y hay que cambiarlos ANTES de mandar un solo
 * documento a un cliente. El logo es una marca tipográfica hecha acá; si hay un
 * archivo de la imprenta, se reemplaza `LogoEmpresa` por un <img> y el resto de
 * la aplicación no se entera.
 */

export const EMPRESA = {
	nombre: 'Imprenta Gons',
	razonSocial: 'Imprenta Gons SpA',
	rut: '76.543.210-K',
	giro: 'Impresión offset y digital · Envases y etiquetas',
	direccion: 'Av. Los Talleres 1450, Quilicura',
	ciudad: 'Santiago, Chile',
	telefono: '+56 2 2345 6789',
	email: 'ventas@imprentagons.cl',
	web: 'imprentagons.cl',
} as const;

/** Cuántos días vale un precio cotizado. El papel se mueve; una cotización sin
 *  vencimiento es una promesa que el taller no puede sostener. */
export const VIGENCIA_DIAS = 15;

/**
 * Las condiciones que van al pie de toda cotización.
 *
 * No son adorno legal: cada una corresponde a una discusión real que ocurre en
 * la entrega, y escribirlas antes es más barato que discutirlas después.
 */
export const CONDICIONES: readonly string[] = [
	`Precio válido por ${VIGENCIA_DIAS} días corridos desde la fecha de emisión.`,
	'Los valores no incluyen IVA.',
	'La producción comienza una vez aprobada la prueba de color por escrito.',
	'Variación de tiraje aceptada: ±5% sobre la cantidad solicitada, facturable.',
	'El plazo de entrega se cuenta desde la aprobación de la prueba, no desde la cotización.',
	'Los troqueles, clichés y matrices nuevos quedan en poder de la imprenta salvo acuerdo distinto.',
];
