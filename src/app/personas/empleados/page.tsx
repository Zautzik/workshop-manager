import { redirect } from 'next/navigation';

// Empleados es ahora la pestaña "equipo" de /personas/consola.
//
// La consola ya lo decía en su encabezado: «Empleados en particular added
// nothing the consolidated roster didn’t already show, so it is gone: the
// roster IS the employee directory». El padrón de la pestaña Equipo es el
// directorio.
//
// Queda un cabo: WorkersManagement, el componente que esta ruta renderizaba, no
// lo usa nadie más. Se deja en su lugar en vez de borrarlo de pasada — es una
// decisión aparte de plegar la ruta.
//
// Se deja un redirect y no un 404, igual que /operaciones/lotes,
// /operaciones/proveedores, /supply y /supervisor: la ruta estuvo enlazada y los
// marcadores viejos siguen apuntando acá.
export default function EmpleadosRedirectPage() {
  redirect('/personas/consola?tab=equipo');
}
