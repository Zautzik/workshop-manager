'use client';

import { useSearchParams } from 'next/navigation';

/**
 * Qué pestaña abrir, según `?tab=` en la URL.
 *
 * Existe porque las pantallas que absorbieron rutas sueltas necesitan poder
 * recibir un enlace a una pestaña concreta. El patrón de la casa para una ruta
 * que se consolidó es dejar un redirect en vez de un 404 —lo hacen
 * `/operaciones/lotes`, `/operaciones/proveedores`, `/supply` y `/supervisor`—
 * y ese redirect apunta a `?tab=…`. Pero `Tabs` se usaba sin controlar
 * (`defaultValue` fijo) y nadie leía el parámetro, así que el redirect habría
 * caído siempre en la primera pestaña. Esto lo hace cierto.
 *
 * El valor se valida contra la lista de pestañas que la pantalla realmente
 * tiene: un `?tab=cualquier-cosa` —de un enlace viejo, de un typo o de alguien
 * probando— abre la pestaña por defecto en vez de dejar la pantalla sin
 * ninguna seleccionada, que es lo que hace `Tabs` con un valor que no existe.
 *
 * Sólo decide la pestaña INICIAL. No reescribe la URL al cambiar de pestaña:
 * eso agregaría entradas al historial del navegador y haría que «atrás» no
 * saque de la pantalla, que es lo que la gente espera que haga.
 *
 * Quien lo use tiene que estar dentro de un `<Suspense>`: `useSearchParams`
 * lo exige en el App Router.
 */
export function useTabFromUrl<T extends string>(allowed: readonly T[], fallback: T): T {
	const requested = useSearchParams().get('tab');
	return allowed.includes(requested as T) ? (requested as T) : fallback;
}
