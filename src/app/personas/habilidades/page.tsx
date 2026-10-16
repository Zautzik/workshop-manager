import { redirect } from 'next/navigation';

// Habilidades es ahora la pestaña "habilidades" de /personas/talento.
//
// Renderizaba CraftSkillTree y HorasReales; los dos están ahora en la pestaña,
// en el mismo orden.
//
// Se deja un redirect y no un 404, igual que /operaciones/lotes,
// /operaciones/proveedores, /supply y /supervisor: la ruta estuvo enlazada y los
// marcadores viejos siguen apuntando acá.
export default function HabilidadesRedirectPage() {
  redirect('/personas/talento?tab=habilidades');
}
