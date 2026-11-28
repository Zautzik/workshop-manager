'use client';

/**
 * Cotizaciones › Historial (audit M8).
 *
 * The screen used to list only the orders waiting for the client's sign-off —
 * two rows — with no way to find an older quote or see how many close.
 *
 * Two parts, both on existing owners:
 *  - Conversion per month: GET /api/reads/quote-conversion (counts of
 *    `vistos_buenos` by outcome, scoped to the vendedor's own).
 *  - Search: every OT by number, client or product (useOTSearch, the same
 *    search as Expediente). Quoting creates the OT, so the OT IS the quote —
 *    a separate list of quotes would be a second truth about the same job.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useOTSearch } from '@/hooks/use-operations-queries';
import { readApi } from '@/lib/read-api';
import { winRate, type QuoteMonth } from '@/lib/quote-conversion';
import { formatCalendarDate, formatCLP } from '@/lib/format';
import { otStatusBadgeClass, otStatusLabel } from '@/lib/status-labels';
import { MobileCardList, MobileCard } from '@/components/layout/MobileCardList';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthLabel = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

function Conversion() {
  const { data: months = [], isLoading, error } = useQuery<QuoteMonth[]>({
    queryKey: ['quote-conversion', 6],
    queryFn: () => readApi<QuoteMonth[]>('quote-conversion', { months: '6' }),
    staleTime: 5 * 60_000,
  });
  if (isLoading) return <div className="h-20 animate-pulse rounded-lg bg-muted/40" />;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (months.length === 0) return <p className="text-sm text-muted-foreground">Sin cotizaciones en los últimos 6 meses.</p>;
  const max = Math.max(1, ...months.map((m) => m.quoted));
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {months.map((m) => {
        const rate = winRate(m);
        return (
          <div key={m.month} className="rounded-lg border bg-card/60 p-2.5">
            <p className="text-xs capitalize text-muted-foreground">{monthLabel(m.month)}</p>
            <p className="text-lg font-bold tabular-nums leading-tight">{m.quoted}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" title={`${m.won} ganadas · ${m.lost} perdidas · ${m.open} abiertas`}>
              <div className="flex h-full" style={{ width: `${(m.quoted / max) * 100}%` }}>
                <span className="h-full bg-emerald-500" style={{ width: `${(m.won / m.quoted) * 100}%` }} />
                <span className="h-full bg-rose-500" style={{ width: `${(m.lost / m.quoted) * 100}%` }} />
                <span className="h-full bg-slate-400" style={{ width: `${(m.open / m.quoted) * 100}%` }} />
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{rate == null ? 'sin decidir' : `${rate}% ganadas`}</p>
          </div>
        );
      })}
    </div>
  );
}

export function CotizacionesHistorial() {
  const [q, setQ] = useState('');
  const { data: rows = [], isFetching } = useOTSearch(q, { limit: 30 });

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div>
          <CardTitle className="text-base">Historial</CardTitle>
          <p className="text-xs text-muted-foreground">
            Cotizaciones por mes y qué pasó con ellas: <span className="text-emerald-600">ganadas</span> (firmadas o en producción),{' '}
            <span className="text-rose-600">perdidas</span> (rechazadas o vencidas) y abiertas.
          </p>
        </div>
        <Conversion />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cualquier trabajo por N° de OT, cliente o producto…"
            className="pl-9"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {q.trim() ? (isFetching ? 'Buscando…' : `${rows.length} resultado${rows.length === 1 ? '' : 's'}`) : 'Los 30 más recientes. Escribe para buscar en todos.'}
        </p>

        <MobileCardList>
          {(rows as any[]).map((o) => (
            <MobileCard
              key={o.id}
              leading={<FileText className="h-4 w-4" />}
              title={`${o.ot_number} · ${o.client_name ?? '—'}`}
              meta={[o.product_name, o.total_price != null ? formatCLP(Number(o.total_price)) : null, otStatusLabel(o.status)]}
              actions={
                <Link href={`/documentos/cotizacion/${o.id}`} className="inline-flex h-9 items-center px-2 text-xs text-primary hover:underline">
                  Ver
                </Link>
              }
            />
          ))}
        </MobileCardList>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-2 py-2 font-medium">OT</th>
                <th className="px-2 py-2 font-medium">Cliente</th>
                <th className="px-2 py-2 font-medium">Trabajo</th>
                <th className="px-2 py-2 text-right font-medium">Total</th>
                <th className="px-2 py-2 font-medium">Estado</th>
                <th className="px-2 py-2 font-medium">Creada</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">{q.trim() ? 'Ningún trabajo coincide.' : 'Sin trabajos todavía.'}</td></tr>
              )}
              {(rows as any[]).map((o) => (
                <tr key={o.id} className="border-b hover:bg-muted/40">
                  <td className="px-2 py-2 font-mono text-xs">{o.ot_number}</td>
                  <td className="max-w-[180px] truncate px-2 py-2">{o.client_name ?? '—'}</td>
                  <td className="max-w-[220px] truncate px-2 py-2 text-muted-foreground">{o.product_name ?? '—'}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{o.total_price != null ? formatCLP(Number(o.total_price)) : '—'}</td>
                  <td className="px-2 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${otStatusBadgeClass(o.status)}`}>{otStatusLabel(o.status)}</span>
                  </td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{formatCalendarDate(o.created_at)}</td>
                  <td className="px-2 py-2 text-right">
                    <Link href={`/documentos/cotizacion/${o.id}`} className="text-xs text-primary hover:underline">Ver cotización</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
