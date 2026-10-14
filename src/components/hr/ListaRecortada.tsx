'use client';

import { AlertTriangle } from 'lucide-react';

/**
 * Avisa cuando la lista que se está mostrando no es toda la lista.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Las rutas de lectura de RRHH devuelven `total` (el `count` exacto del
 * servidor) además de las filas, y las pantallas lo ignoraban: mostraban
 * `filtered.length` y nada más. Mientras el total cabe en el límite eso da el
 * mismo número, así que no se nota — hasta que no cabe, y entonces la pantalla
 * muestra 500 de 700 con la misma cara de certeza con la que antes mostraba 0
 * de 38.
 *
 * Es el mismo error que esta sesión estuvo persiguiendo todo el tiempo: un
 * conteo incompleto presentado como un hecho del taller. Ya pasó tres veces en
 * este proyecto por tres causas distintas —RLS filtrando todo
 * (`200 []`), un `42703` en una columna muerta, y un script que leía 206 como
 * error— y las tres veces la pantalla dijo «no hay nada» o un número menor sin
 * que nada fallara.
 *
 * El arreglo no es subir el límite: es que un recorte no pueda pasar
 * desapercibido. Si esto aparece, hay que paginar, no agrandar el número.
 */
export function ListaRecortada({
	cargadas,
	total,
	sustantivo,
}: {
	/** Filas que el servidor efectivamente devolvió. */
	cargadas: number;
	/** `total` del servidor: cuántas hay en realidad. */
	total: number;
	/** Cómo se llaman las filas, en plural. Ej. "contratos". */
	sustantivo: string;
}) {
	if (total <= cargadas) return null;

	return (
		<div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
			<AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
			<p className="text-muted-foreground">
				Mostrando <span className="font-medium text-foreground">{cargadas}</span> de{' '}
				<span className="font-medium text-foreground">{total}</span> {sustantivo}. La lista
				está recortada por el límite de la consulta — lo que no se ve acá no está filtrado,
				está ausente.
			</p>
		</div>
	);
}
