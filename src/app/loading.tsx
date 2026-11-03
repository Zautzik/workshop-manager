/**
 * Lo que se ve mientras llega la página siguiente.
 *
 * Todas las páginas son dinámicas (el layout raíz lee el nonce de la CSP con
 * `headers()`), así que cada navegación espera una respuesta del servidor. Sin
 * este archivo no había nada que mostrar mientras tanto: la página anterior se
 * quedaba congelada hasta que llegaba la nueva, y un clic en el menú parecía no
 * haber hecho nada. Además, es lo que le permite a Next precargar una ruta
 * dinámica hasta este punto cuando un <Link> entra en pantalla.
 *
 * Vive dentro del shell (sidebar y barra superior quedan quietos): sólo el
 * área de contenido muestra el esqueleto.
 */
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
	return (
		<div className="space-y-4 p-6" aria-busy="true" aria-label="Cargando">
			<Skeleton className="h-4 w-48" />
			<Skeleton className="h-8 w-72" />
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<Skeleton className="h-28" />
				<Skeleton className="h-28" />
				<Skeleton className="h-28" />
			</div>
			<Skeleton className="h-64" />
		</div>
	);
}
