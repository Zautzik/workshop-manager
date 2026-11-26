import { redirect } from 'next/navigation';

/**
 * Rendimiento Personal is retired until something writes its metrics (audit
 * M13, 2026-11-25). It read quality/speed/attendance scores that nothing
 * computes — after the C4 migration most people have none — so it showed 0 %
 * everywhere. Old links land on the Resumen; hours worked per person live in
 * Personas › Consola, from the ledger.
 */
export default function AnaliticaRendimientoPage() {
  redirect('/analitica/dashboard');
}
