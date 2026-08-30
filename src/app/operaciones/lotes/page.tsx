import { redirect } from 'next/navigation';

// Absorbido por la pestaña "Lotes" de /operaciones/inventario — dos pantallas
// mostraban los mismos lotes con capacidades distintas (ésta imprimía
// etiquetas, la otra no). Se deja el redirect, no un 404, porque el enlace
// del menú y cualquier marcador viejo apuntan acá (auditoría 2026-08).
export default function LotesPage() {
  redirect('/operaciones/inventario?tab=lots');
}
