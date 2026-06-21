'use client';
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search, FileCheck, ShieldCheck, ShieldAlert, Package, Image as ImageIcon,
  ClipboardCheck, Printer, AlertTriangle, CheckCircle2, Upload, Check, X, FileText,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useOTs } from '@/hooks/use-operations-queries';
import { useOTDossier, type CertStatus } from '@/hooks/use-ot-dossier';
import { otStatusLabel, otStatusColor } from '@/lib/status-labels';

interface OtLite { id: string; ot_number: string | null; client_name: string | null; status: string | null; }

const CERT_META: Record<CertStatus, { label: string; cls: string }> = {
  ok:           { label: 'Vigente',         cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  expired:      { label: 'Vencido',         cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  missing:      { label: 'Sin certificado', cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  unverified:   { label: 'Sin vencimiento', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  not_required: { label: 'No requerido',    cls: 'bg-muted text-muted-foreground' },
};

const APPROVAL_META: Record<string, string> = {
  approved: 'Aprobado', rejected: 'Rechazado', pending: 'Pendiente', revision_requested: 'Revisión solicitada',
};

const fmtDate = (s: string | null | undefined) =>
  s && isValid(parseISO(s)) ? format(parseISO(s), 'PP', { locale: es }) : '—';

export default function ExpedienteReport() {
  const { data: otsData } = useOTs();
  const ots = (otsData ?? []) as OtLite[];
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: dossier, isLoading } = useOTDossier(selectedId);
  const { role } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const canApprove = role === 'admin' || role === 'supervisor';
  const refetch = () => qc.invalidateQueries({ queryKey: ['ot-dossier', selectedId] });

  // Industry 6.0 output gate: attach the deliverable photo, supervisor signs off.
  const uploadEvidence = async (file: File) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('ot_id', selectedId);
      const res = await fetch('/api/attachments/upload', { method: 'POST', body: fd, credentials: 'include' });
      if (!res.ok) throw new Error();
      toast.success('Evidencia adjuntada');
      refetch();
    } catch { toast.error('No se pudo adjuntar la evidencia'); }
    finally { setBusy(false); }
  };

  const review = async (action: 'approve' | 'reject', comments?: string) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ots/${selectedId}/approval`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comments: comments ?? null }),
      });
      if (!res.ok) throw new Error();
      toast.success(action === 'approve' ? 'Entregable aprobado' : 'Entregable rechazado');
      refetch();
    } catch { toast.error('No se pudo registrar la revisión'); }
    finally { setBusy(false); }
  };

  const viewAttachment = async (attId: string) => {
    try {
      const res = await fetch(`/api/attachments/${attId}/download`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const { download_url } = await res.json();
      window.open(download_url, '_blank', 'noopener');
    } catch { toast.error('No se pudo abrir el archivo'); }
  };

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return ots.filter((o) =>
      o.ot_number?.toLowerCase().includes(q) || o.client_name?.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [ots, search]);

  return (
    <div className="space-y-6">
      {/* Search */}
      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar OT por número o cliente para abrir su expediente…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {suggestions.length > 0 && selectedId === null && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
                {suggestions.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => { setSelectedId(o.id); setSearch(o.ot_number ?? ''); }}
                    className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center gap-2 text-sm"
                  >
                    <span className={cn('h-2 w-2 rounded-full', otStatusColor(o.status))} />
                    <span className="font-mono">{o.ot_number}</span>
                    <span className="text-muted-foreground truncate">{o.client_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedId && isLoading && (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      )}

      {!selectedId && (
        <div className="text-center py-16 text-muted-foreground">
          <FileCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Busca una OT para generar su expediente de trazabilidad FSSC 22000.</p>
        </div>
      )}

      {selectedId && dossier && (
        <div className="space-y-5">
          {/* Header + compliance verdict */}
          <Card className={cn('border-l-4', dossier.compliance.compliant ? 'border-l-emerald-500' : 'border-l-rose-500')}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-lg font-bold">{dossier.ot.ot_number}</span>
                    <Badge className={cn('text-white text-xs', otStatusColor(dossier.ot.status))}>{otStatusLabel(dossier.ot.status)}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{dossier.ot.client_name}</p>
                  <div className="flex gap-4 text-xs text-muted-foreground mt-2 flex-wrap">
                    {dossier.ot.quantity != null && <span>{dossier.ot.quantity.toLocaleString()} un.</span>}
                    <span>Creada {fmtDate(dossier.ot.created_at)}</span>
                    {dossier.ot.deadline && <span>Entrega {fmtDate(dossier.ot.deadline)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {dossier.compliance.compliant ? (
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="h-6 w-6" />
                      <span className="font-semibold">Conforme</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                      <ShieldAlert className="h-6 w-6" />
                      <span className="font-semibold">No conforme</span>
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="gap-1.5 print:hidden" onClick={() => window.print()}>
                    <Printer className="h-3.5 w-3.5" /> Exportar
                  </Button>
                </div>
              </div>
              {!dossier.compliance.compliant && dossier.compliance.reasons.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {dossier.compliance.reasons.map((r, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{r}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Materials + cert validity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />Insumos consumidos y certificación
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dossier.materials.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Sin insumos trazados a esta OT.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b">
                        <th className="py-2 pr-3">Insumo</th>
                        <th className="py-2 pr-3">Lote</th>
                        <th className="py-2 pr-3">Proveedor</th>
                        <th className="py-2 pr-3">Cert.</th>
                        <th className="py-2 pr-3">Vence</th>
                        <th className="py-2 pr-3 text-right">Cant.</th>
                        <th className="py-2 pr-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dossier.materials.map((m) => (
                        <tr key={m.tx_id} className="border-b border-border/50">
                          <td className="py-2 pr-3">
                            <div className="font-medium">{m.item_name ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">{m.item_sku}</div>
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">{m.lot_number ?? '—'}</td>
                          <td className="py-2 pr-3 text-xs">
                            {m.supplier_name ?? '—'}
                            {m.supplier_rut && <div className="text-muted-foreground">RUT {m.supplier_rut}</div>}
                            {m.oc_date && <div className="text-muted-foreground">OC {fmtDate(m.oc_date)}</div>}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">{m.certification_code ?? '—'}</td>
                          <td className="py-2 pr-3 text-xs">{fmtDate(m.certification_expires_on)}</td>
                          <td className="py-2 pr-3 text-right">{m.quantity.toLocaleString()} {m.unit ?? ''}</td>
                          <td className="py-2 pr-3">
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', CERT_META[m.cert_status].cls)}>
                              {CERT_META[m.cert_status].label}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Deliverable evidence */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />Evidencia del entregable ({dossier.attachments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <label className={cn('mb-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/60 print:hidden', busy && 'opacity-50 pointer-events-none')}>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadEvidence(f); e.currentTarget.value = ''; }}
                  />
                  <Upload className="h-3.5 w-3.5" /> Adjuntar evidencia
                </label>
                {dossier.attachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Sin fotos del entregable.</p>
                ) : (
                  <div className="space-y-3">
                    {dossier.attachments.some((a) => (a.mime_type ?? '').startsWith('image/')) && (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {dossier.attachments
                          .filter((a) => (a.mime_type ?? '').startsWith('image/'))
                          .map((a) => (
                            <button
                              key={a.id}
                              onClick={() => viewAttachment(a.id)}
                              title={a.filename}
                              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted/30"
                            >
                              {a.url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={a.url} alt={a.filename} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                              ) : (
                                <div className="flex h-full items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>
                              )}
                            </button>
                          ))}
                      </div>
                    )}
                    {dossier.attachments.filter((a) => !(a.mime_type ?? '').startsWith('image/')).length > 0 && (
                      <ul className="space-y-1.5">
                        {dossier.attachments
                          .filter((a) => !(a.mime_type ?? '').startsWith('image/'))
                          .map((a) => (
                            <li key={a.id} className="flex items-center gap-2 text-sm">
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="truncate flex-1">{a.filename}</span>
                              <button onClick={() => viewAttachment(a.id)} className="text-xs text-primary hover:underline print:hidden">Ver</button>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Approvals / sign-off */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4" />Revisión y aprobación
                </CardTitle>
              </CardHeader>
              <CardContent>
                {canApprove && (
                  <div className="flex flex-wrap gap-2 mb-3 print:hidden">
                    <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => review('approve')}>
                      <Check className="h-3.5 w-3.5" /> Aprobar
                    </Button>
                    <Button
                      size="sm" variant="outline" className="gap-1.5" disabled={busy}
                      onClick={() => { const c = window.prompt('Motivo del rechazo (opcional):') ?? undefined; review('reject', c); }}
                    >
                      <X className="h-3.5 w-3.5" /> Rechazar
                    </Button>
                  </div>
                )}
                {dossier.approvals.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Sin revisiones registradas.</p>
                ) : (
                  <ul className="space-y-2">
                    {dossier.approvals.map((a) => (
                      <li key={a.id} className="flex items-start gap-2 text-sm">
                        {a.status === 'approved'
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                          : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{APPROVAL_META[a.status] ?? a.status}</span>
                          {a.comments && <p className="text-xs text-muted-foreground">{a.comments}</p>}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{fmtDate(a.resolved_at ?? a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
