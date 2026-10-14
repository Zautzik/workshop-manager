/**
 * La identidad de la empresa, en un solo lugar.
 *
 * Todo lo que sale impreso hacia afuera —cotizaciones, órdenes, guías— tiene que
 * decir lo mismo. Repetir el nombre y el RUT en cada plantilla garantiza que
 * algún día uno diga una dirección vieja, y el que la lee es el cliente.
 *
 * ── Qué es real y qué falta ─────────────────────────────────────────────────
 *
 * Reales desde 2026-10-14: `razonSocial`, `nombre`, `direccion`, `comuna`,
 * `ciudad` y `email`. Los dos que siguen siendo de relleno están enumerados en
 * `EMPRESA_PENDIENTE`, más abajo, y hay que cambiarlos ANTES de mandar un solo
 * documento a un cliente: **RUT y teléfono**.
 *
 * No hay `web`: la imprenta no tiene sitio, y el campo se quitó en vez de
 * dejarlo vacío — un string vacío se cuela en un pie de página como un
 * separador suelto.
 *
 * `email` es real, pero es una casilla personal: en la cotización sale como el
 * contacto comercial de la imprenta. Si existe una casilla de la empresa, va
 * en el mismo campo.
 *
 * `giro` quedó fuera de esa lista porque describe a la imprenta y no identifica
 * a la sociedad; si no es exacto, corregirlo es cosmético, no legal.
 *
 * El logo es una marca tipográfica hecha acá; si hay un archivo de la imprenta,
 * se reemplaza `LogoEmpresa` por un <img> y el resto de la aplicación no se
 * entera.
 */

export const EMPRESA = {
	nombre: 'Gonsa',
	razonSocial: 'Inversiones Gonsa S.A.',
	rut: '76.543.210-K',
	giro: 'Impresión offset y digital · Envases y etiquetas',
	// Dirección legal en tres partes, como se escribe en Chile: calle y número,
	// comuna, ciudad. Juntarlas en un solo string obliga a cada plantilla a
	// cortarlo si necesita sólo la comuna, y es lo que hace que una termine
	// diciendo «Santiago, Chile» y otra «Quinta Normal».
	direccion: 'Apóstol Santiago 470',
	comuna: 'Quinta Normal',
	ciudad: 'Santiago',
	telefono: '+56 2 2345 6789',
	email: 'rzautzikg@gmail.com',
} as const;

/**
 * Qué campos de `EMPRESA` siguen siendo de relleno.
 *
 * La razón social ya es la real (confirmada por el dueño, 2026-10-14). El resto
 * no, y esa mezcla es más peligrosa que el relleno completo: un nombre legal
 * verdadero junto a un RUT inventado se lee como un dato verificado. Donde más
 * importa es en la política de privacidad, que es el documento que identifica
 * al responsable del tratamiento, y en la cotización, que sale al cliente.
 *
 * Mientras un campo esté acá, quien lo muestra tiene que OMITIRLO o marcarlo —
 * nunca imprimirlo como si fuera cierto. Sacar una clave de esta lista es la
 * señal de que el dato se verificó.
 */
export const EMPRESA_PENDIENTE = new Set<keyof typeof EMPRESA>([
	'rut',
	'telefono',
]);

/** ¿Este campo sigue siendo de relleno? */
export function datoPendiente(campo: keyof typeof EMPRESA): boolean {
	return EMPRESA_PENDIENTE.has(campo);
}

/**
 * El dato si es real, o `null` si sigue siendo relleno.
 *
 * Devuelve `null` y no el string vacío para que quien lo use tenga que decidir
 * qué hacer con la ausencia, en vez de dejar un hueco silencioso en medio de
 * una frase legal.
 */
export function datoEmpresa(campo: keyof typeof EMPRESA): string | null {
	return datoPendiente(campo) ? null : EMPRESA[campo];
}

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
