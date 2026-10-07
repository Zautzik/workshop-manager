export const OC_STATUS: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Borrador',  cls: 'bg-slate-500/15 text-slate-500' },
  sent:      { label: 'Enviada',   cls: 'bg-sky-500/15 text-sky-600' },
  received:  { label: 'Recibida',  cls: 'bg-indigo-500/15 text-indigo-600' },
  invoiced:  { label: 'Facturada', cls: 'bg-amber-500/15 text-amber-600' },
  closed:    { label: 'Cerrada',   cls: 'bg-green-500/15 text-green-600' },
  cancelled: { label: 'Anulada',   cls: 'bg-red-500/15 text-red-600' },
};

export const FACTURA_STATUS: Record<string, { label: string; cls: string }> = {
  received: { label: 'Recibida',   cls: 'bg-slate-500/15 text-slate-500' },
  matched:  { label: 'Conciliada', cls: 'bg-green-500/15 text-green-600' },
  disputed: { label: 'En disputa', cls: 'bg-red-500/15 text-red-600' },
  paid:     { label: 'Pagada',     cls: 'bg-emerald-500/15 text-emerald-600' },
};
