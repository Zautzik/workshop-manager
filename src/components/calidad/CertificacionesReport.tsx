'use client';
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ShieldCheck, ShieldAlert, Clock, AlertTriangle, Boxes } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useCertifications, type CertState } from '@/hooks/use-certifications';

const fmtDate = (s: string | null | undefined) =>
  s && isValid(parseISO(s)) ? format(parseISO(s), 'PP', { locale: es }) : '—';

const STATE_META: Record<CertState, { label: string; cls: string }> = {
  vigente:         { label: 'Vigente',         cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  por_vencer:      { label: 'Por vencer',      cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  vencido:         { label: 'Vencido',         cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  faltante:        { label: 'Sin certificado', cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  sin_vencimiento: { label: 'Sin vencimiento', cls: 'bg-muted text-muted-foreground' },
};

function Stat({ icon: Icon, label, value, tone, active, onClick }: {
  icon: React.ElementType; label: string; value: number; tone?: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn('text-left rounded-lg border p-3 transition-colors', active ? 'border-primary bg-primary/5' : 'hover:bg-muted/40')}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', tone)} />{label}
      </div>
      <div className={cn('mt-0.5 text-xl font-bold', tone ?? 'text-foreground')}>{value}</div>
    </button>
  );
}

export default function CertificacionesReport() {
  const { data, isLoading } = useCertifications();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CertState | null>(null);

  const rows = useMemo(() => {
    const all = data?.lots ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((l) => {
      if (filter && l.state !== filter) return false;
      if (!q) return true;
      return (
        l.lot_number?.toLowerCase().includes(q) ||
        l.item_name?.toLowerCase().includes(q) ||
        l.supplier_name?.toLowerCase().includes(q) ||
        l.certification_code?.toLowerCase().includes(q)
      );
    });
  }, [data, search, filter]);

  if (isLoading || !data) {
    return <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-72 w-full" /></div>;
  }

  const s = data.summary;
  const toggle = (state: CertState) => setFilter((f) => (f === state ? null : state));

  return (
    <div className="space-y-5">
      {/* At-risk banner */}
      {s.at_risk > 0 && (
        <Card className="border-rose-500/40 bg-rose-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-rose-500 shrink-0" />
            <p className="text-sm">
              <span className="font-semibold text-rose-600 dark:text-rose-400">{s.at_risk} lote(s) en riesgo</span>{' '}
              <span className="text-muted-foreground">en stock con certificado vencido o faltante — no deben consumirse.</span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary / quick filters */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        <Stat icon={Boxes} label="Total" value={s.total} active={filter === null} onClick={() => setFilter(null)} />
        <Stat icon={ShieldCheck} label="Vigentes" value={s.vigente} tone="text-emerald-500" active={filter === 'vigente'} onClick={() => toggle('vigente')} />
        <Stat icon={Clock} label="Por vencer" value={s.por_vencer} tone="text-amber-500" active={filter === 'por_vencer'} onClick={() => toggle('por_vencer')} />
        <Stat icon={AlertTriangle} label="Vencidos" value={s.vencido} tone="text-rose-500" active={filter === 'vencido'} onClick={() => toggle('vencido')} />
        <Stat icon={ShieldAlert} label="Sin cert." value={s.faltante} tone="text-rose-500" active={filter === 'faltante'} onClick={() => toggle('faltante')} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por lote, insumo, proveedor o certificado…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Register */}
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Sin lotes que coincidan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2.5 px-4">Insumo</th>
                    <th className="py-2.5 px-3">Lote</th>
                    <th className="py-2.5 px-3">Proveedor</th>
                    <th className="py-2.5 px-3">Cert.</th>
                    <th className="py-2.5 px-3">Vence</th>
                    <th className="py-2.5 px-3 text-right">Stock</th>
                    <th className="py-2.5 px-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.lot_id} className="border-b border-border/50">
                      <td className="py-2.5 px-4">
                        <div className="font-medium">{l.item_name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{l.item_sku}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs">{l.lot_number}</td>
                      <td className="py-2.5 px-3 text-xs">{l.supplier_name ?? '—'}</td>
                      <td className="py-2.5 px-3 font-mono text-xs">{l.certification_code ?? '—'}</td>
                      <td className="py-2.5 px-3 text-xs">{fmtDate(l.certification_expires_on)}</td>
                      <td className="py-2.5 px-3 text-right">{l.quantity_available.toLocaleString()}</td>
                      <td className="py-2.5 px-3">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATE_META[l.state].cls)}>
                          {STATE_META[l.state].label}
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
    </div>
  );
}
