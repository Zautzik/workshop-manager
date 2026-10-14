import { redirect } from 'next/navigation';

// Incentivos es ahora la pestaña "incentivos" de /personas/talento.
//
// Esta ruta salió del menú cuando las cuatro pantallas de Personas se
// consolidaron en dos, pero el archivo siguió existiendo por una razón que no
// era la ruta: exportaba el componente que la consola importaba cruzando el
// límite de la ruta (`from '@/app/personas/incentivos/page'`). Ese componente se
// movió a `@/components/hr/`, así que acá ya no queda pantalla — sólo la URL.
//
// Se deja un redirect y no un 404, igual que /operaciones/lotes,
// /operaciones/proveedores, /supply y /supervisor: la ruta estuvo en el menú y
// los marcadores viejos siguen apuntando acá.
export default function IncentivosRedirectPage() {
  redirect('/personas/talento?tab=incentivos');
}
