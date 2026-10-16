import { redirect } from 'next/navigation';

// Nómina es ahora la pestaña "retribucion" de /personas/consola.
//
// Renderizaba el mismo MonthlyPayrollCalculator que la pestaña.
//
// Se deja un redirect y no un 404, igual que /operaciones/lotes,
// /operaciones/proveedores, /supply y /supervisor: la ruta estuvo enlazada y los
// marcadores viejos siguen apuntando acá.
export default function NominaRedirectPage() {
  redirect('/personas/consola?tab=retribucion');
}
