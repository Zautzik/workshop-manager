/**
 * Traer TODAS las filas, o decir que no se pudo.
 *
 * ── El error que este archivo existe para impedir ───────────────────────────
 *
 * PostgREST devuelve como máximo 1.000 filas por consulta y **no avisa**. No hay
 * error, no hay bandera, no hay nada: llega un arreglo de mil elementos que se
 * ve igual que un arreglo completo. Una consulta sin paginar sobre una tabla que
 * crece funciona en desarrollo, funciona el primer mes, y empieza a mentir
 * cuando el taller lleva suficiente historia.
 *
 * Se descubrió con la base sembrada: `/api/ots/cost-summary` sumaba 4.256 líneas
 * de costo y recibía 1.000. La pantalla de Rentabilidad mostraba
 *
 *     COSTO REAL  $809.388.087        cuando lo real era ~$3.283.000.000
 *     MARGEN      82%                 cuando lo real era 22%
 *
 * y decía «59 de 258 OT no tienen costo real cargado» — un aviso que sonaba a
 * dato faltante y era una consulta truncada.
 *
 * Lo peor no es el tamaño del error sino su DIRECCIÓN: al perder líneas de
 * costo, el margen sube. Un número que se equivoca hacia el lado agradable no
 * genera preguntas.
 *
 * ── La regla ────────────────────────────────────────────────────────────────
 *
 * Se pagina hasta agotar, y si se llega al tope se DICE. `truncated` no es un
 * detalle de implementación: es la diferencia entre «tu taller ganó 22%» y
 * «esto que ves es una parte y no sé cuál».
 */

export interface FetchAllResult<T> {
	rows: T[];
	/** Se alcanzó el tope sin agotar la tabla: lo devuelto es incompleto. */
	truncated: boolean;
	/** Cuántas consultas hicieron falta. Útil para ver si un tope quedó chico. */
	pages: number;
}

export interface FetchAllOptions {
	/** Filas por consulta. PostgREST no entrega más de 1.000 por vuelta. */
	pageSize?: number;
	/**
	 * Techo duro de filas. Existe para que una tabla desbocada no tumbe la ruta,
	 * no para recortar en silencio: si se alcanza, `truncated` queda en `true` y
	 * el que llama tiene que decirlo en pantalla.
	 */
	max?: number;
}

/** Lo que devuelve una consulta de Supabase, sin arrastrar sus tipos. */
type Page<T> = { data: T[] | null; error: { message: string } | null };

const PAGE_SIZE = 1000;
const MAX_ROWS = 100_000;

/**
 * @param build recibe el rango y devuelve la consulta ya acotada.
 *
 * Es una función y no una consulta porque un `PostgrestBuilder` se consume al
 * esperarlo: para pedir la página siguiente hay que armarla de nuevo.
 *
 * ```ts
 * const { rows, truncated } = await fetchAll<Linea>((desde, hasta) =>
 *   supabaseAdmin.from('ot_cost_lines').select('ot_id, total').in('ot_id', ids).range(desde, hasta),
 * );
 * ```
 */
export async function fetchAll<T>(
	build: (from: number, to: number) => PromiseLike<Page<T>>,
	options: FetchAllOptions = {},
): Promise<FetchAllResult<T>> {
	const pageSize = Math.max(1, Math.min(options.pageSize ?? PAGE_SIZE, PAGE_SIZE));
	const max = Math.max(pageSize, options.max ?? MAX_ROWS);

	const rows: T[] = [];
	let pages = 0;

	for (let desde = 0; desde < max; desde += pageSize) {
		const hasta = Math.min(desde + pageSize, max) - 1;
		const { data, error } = await build(desde, hasta);
		pages += 1;

		// Un error se propaga entero. Devolver las páginas que sí llegaron sería
		// exactamente el problema que este archivo evita, con otro disfraz.
		if (error) throw new Error(error.message);

		const lote = data ?? [];
		rows.push(...lote);

		// Página incompleta = se acabó la tabla. Es la única señal fiable: pedir
		// una página más para confirmar cuesta una consulta por cada llamada.
		if (lote.length < hasta - desde + 1) {
			return { rows, truncated: false, pages };
		}
	}

	// Se salió por el techo, no por haber agotado la tabla.
	return { rows, truncated: true, pages };
}

/**
 * El aviso, en el idioma del que lo va a leer.
 *
 * Una pantalla que recibe datos truncados tiene que decirlo. «Mostrando los
 * primeros N» es honesto; mostrar un margen calculado sobre una parte y no
 * mencionarlo es lo que hacía la pantalla de Rentabilidad.
 */
export function truncationNote(result: FetchAllResult<unknown>, qué: string): string | null {
	if (!result.truncated) return null;
	return (
		`Se alcanzó el tope de ${result.rows.length.toLocaleString('es-CL')} ${qué} y hay más en la base. ` +
		`Los totales de esta pantalla están calculados sobre una parte, así que quedan por debajo de lo real.`
	);
}
