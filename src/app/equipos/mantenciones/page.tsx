import { redirect } from 'next/navigation';

/**
 * `/equipos/mantenciones` sin id no es una pantalla real -- se llega siempre
 * por QR con el id de una máquina. Existe sólo para que la miga de pan
 * genérica (Breadcrumbs.tsx arma un link por cada segmento de la URL sin
 * saber si resuelve) no deje un 404 cuando alguien toca el crumb intermedio
 * "Mantenciones" desde /equipos/mantenciones/[id].
 */
export default function MantencionesIndexPage() {
  redirect('/equipos');
}
