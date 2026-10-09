import { naturalNextStatuses, type OTWorkflowStatus } from '@/lib/ot-state-machine';
import { PRODUCTION_PHASES } from '@/lib/production-phases';

export const STATUS_FLOW = [
  { key: 'pre_press',           label: 'Pre-Press',      labelEs: 'Pre-Prensa',   color: 'bg-violet-500',  rgb: '139 92 246',  description: 'Diseño y modelado' },
  { key: 'visto_bueno',         label: 'Approval',       labelEs: 'Visto Bueno',  color: 'bg-amber-500',   rgb: '245 158 11',  description: 'Confirmación del cliente' },
  { key: 'paper_purchase',      label: 'Procurement',    labelEs: 'Compras',      color: 'bg-slate-500',   rgb: '100 116 139', description: 'Todo lo que la OT necesita: comprar, sacar de bodega o tercerizar' },
  { key: 'in_storage',          label: 'In Storage',     labelEs: 'En Bodega',    color: 'bg-cyan-500',    rgb: '6 182 212',   description: 'Listo para producción' },
  { key: 'guillotine_first_cut',label: 'First Cut',       labelEs: 'Primer Corte',     color: 'bg-orange-500',  rgb: '249 115 22',  description: 'Corte inicial guillotina' },
  { key: 'offset_printing',     label: 'Offset Print',    labelEs: 'Offset', color: 'bg-purple-500',  rgb: '168 85 247',  description: 'Impresión offset' },
  { key: 'digital_printing',    label: 'Digital Print',   labelEs: 'Impresión Digital',color: 'bg-fuchsia-500', rgb: '217 70 239',  description: 'Impresión digital' },
  { key: 'die_cutting',         label: 'Die Cutting',    labelEs: 'Troquelado',   color: 'bg-pink-500',    rgb: '236 72 153',  description: 'Proceso de troquelado' },
  { key: 'guillotine_final_cut',label: 'Final Cut',      labelEs: 'Corte Final',  color: 'bg-red-500',     rgb: '239 68 68',   description: 'Corte guillotina final' },
  { key: 'workshop',            label: 'Workshop',       labelEs: 'Taller',       color: 'bg-indigo-500',  rgb: '99 102 241',  description: 'Taller interno', optional: true },
  { key: 'outsourced',          label: 'Outsourced',     labelEs: 'Tercerizado',  color: 'bg-yellow-500',  rgb: '234 179 8',   description: 'Procesado externo', optional: true },
  { key: 'workshop_revision',   label: 'Revision',       labelEs: 'Revisión',     color: 'bg-emerald-500', rgb: '16 185 129',  description: 'Control de calidad' },
  { key: 'ready_for_delivery',  label: 'Ready',          labelEs: 'Listo',        color: 'bg-green-500',   rgb: '34 197 94',   description: 'Listo para despacho' },
  { key: 'in_delivery',         label: 'In Delivery',    labelEs: 'En Entrega',   color: 'bg-teal-500',    rgb: '20 184 166',  description: 'En camino' },
  { key: 'completed',           label: 'Completed',      labelEs: 'Completado',   color: 'bg-gray-500',    rgb: '107 114 128', description: 'Orden finalizada' },
] satisfies { key: string; label: string; labelEs: string; color: string; rgb: string; description: string; optional?: boolean }[];

// Las fases viven en `@/lib/production-phases` para que Equipos pueda agrupar
// la flota con los mismos nombres sin copiarlos. Definirlas aquí dentro hacía
// que cualquier otra pantalla que quisiera decir "Terminación" tuviera que
// duplicar la lista, y las dos se separaran al primer cambio.
export const KANBAN_GROUPS = PRODUCTION_PHASES;

// -- Honeycomb board geometry (flat-top hexes; beehive of the 6 process stages) --
// The beehive is sized to FILL its frame: hex WIDTH comes from the free width (the
// cluster spans 3.25 hex-widths) and hex HEIGHT from the free height (two
// interlocked rows). There is no uniform zoom, so labels keep a true, fixed
// on-screen size (>= 16px) while the hexes grow to use every pixel — width and
// height — with no dead space below. Geometry is derived per-render from the
// measured frame inside the component.
export const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
export const BOARD_PAD = 6;       // gutter around the beehive inside its frame
export const LANE_RESERVE = 60;   // height kept below the board for the urgent lane
export const WIDTH_UNITS = 3.25;  // beehive width, measured in hex-widths
export const HEIGHT_UNITS = 2;    // beehive height, measured in hex-heights
export const MOBILE_MAX_W = 768;  // below this the board switches to a vertical column
export const MOBILE_GAP = 12;     // vertical gap between stacked stage hexes on mobile

export function getPriorityColor(p: number) {
  if (p >= 8) return 'bg-red-500/20 text-red-400 border-red-500/40';
  if (p >= 5) return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
  return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
}
export function getPriorityRing(p: number) {
  if (p >= 8) return 'ring-red-500/50';
  if (p >= 5) return 'ring-amber-500/50';
  return 'ring-blue-500/30';
}
export function getStatusInfo(key: string) { return STATUS_FLOW.find(s => s.key === key) ?? STATUS_FLOW[0]; }
export function getAllNextStatuses(currentStatus: string) {
  return naturalNextStatuses(currentStatus as OTWorkflowStatus)
    .map(getStatusInfo);
}
