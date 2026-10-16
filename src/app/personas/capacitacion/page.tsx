import { redirect } from 'next/navigation';

// Capacitación es ahora la pestaña "capacitacion" de /personas/talento.
//
// Renderizaba el mismo TrainingKnowledgeBase que la pestaña.
//
// Se deja un redirect y no un 404, igual que /operaciones/lotes,
// /operaciones/proveedores, /supply y /supervisor: la ruta estuvo enlazada y los
// marcadores viejos siguen apuntando acá.
export default function CapacitacionRedirectPage() {
  redirect('/personas/talento?tab=capacitacion');
}
