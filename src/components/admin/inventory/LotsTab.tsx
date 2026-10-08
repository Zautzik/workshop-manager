'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Lock, Plus, Printer, ShieldAlert } from 'lucide-react';
import { certStatus } from '@/lib/purchasing';
import { EtiquetaLote } from '@/components/bodega/EtiquetaLote';
import { formatCLP } from '@/lib/format';

export function LotsTab({
  lots,
  lotsLoading,
  lotsError,
  refetchLots,
  onAddLot,
}: {
  lots: any[];
  lotsLoading: boolean;
  lotsError: boolean;
  refetchLots: () => void;
  onAddLot: () => void;
}) {
  const [selectedLots, setSelectedLots] = useState<Set<string>>(new Set());
  const [lotSearch, setLotSearch] = useState('');
  const [lotOnlyProblem, setLotOnlyProblem] = useState(false);

  // Lo que no se puede usar arriba: es trabajo, no información — mismo
  // criterio que la pantalla de impresión que se fusiona acá.
  const lotsConProblema = useMemo(() => {
    return lots.filter((lot: any) => {
      const estado = certStatus(lot.certification_expires_on);
      return estado === 'vencido' || estado === 'sin_certificado' || !!lot.blocked_reason;
    });
  }, [lots]);
  const idsConProblema = useMemo(() => new Set(lotsConProblema.map((l: any) => l.id)), [lotsConProblema]);

  // Hasta 500 lotes en una sola tabla: sin buscador esto es puro scroll.
  const lotsVisibles = useMemo(() => {
    const query = lotSearch.trim().toLowerCase();
    return lots.filter((lot: any) => {
      if (lotOnlyProblem && !idsConProblema.has(lot.id)) return false;
      if (!query) return true;
      const numero = String(lot.lot_number ?? '').toLowerCase();
      const nombre = String(lot.inventory_items?.name ?? '').toLowerCase();
      const proveedor = String(lot.supplier_name ?? '').toLowerCase();
      return numero.includes(query) || nombre.includes(query) || proveedor.includes(query);
    });
  }, [lots, lotSearch, lotOnlyProblem, idsConProblema]);

  const toggleLotSelection = (id: string) =>
    setSelectedLots((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const allVisibleLotsSelected = lotsVisibles.length > 0 && lotsVisibles.every((l: any) => selectedLots.has(l.id));
  const toggleSelectAllVisibleLots = () =>
    setSelectedLots((s) => {
      const n = new Set(s);
      if (allVisibleLotsSelected) {
        for (const l of lotsVisibles) n.delete(l.id);
      } else {
        for (const l of lotsVisibles) n.add(l.id);
      }
      return n;
    });

  const lotsParaImprimir = useMemo(() => lots.filter((l: any) => selectedLots.has(l.id)), [lots, selectedLots]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Input
          value={lotSearch}
          onChange={(e) => setLotSearch(e.target.value)}
          className="w-80"
          placeholder="Buscar por número de lote, ítem o proveedor…"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={selectedLots.size === 0}
            onClick={() => window.print()}
          >
            <Printer className="mr-2 h-4 w-4" />
            Imprimir {selectedLots.size > 0 ? `${selectedLots.size} ` : ''}
            {selectedLots.size === 1 ? 'etiqueta' : 'etiquetas'}
          </Button>
          <Button onClick={onAddLot} className="bg-primary hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" />
            Agregar lote
          </Button>
        </div>
      </div>

      {lotsConProblema.length > 0 && (
        <Card className="border-red-500/40 bg-red-500/5 print:hidden">
          <CardContent className="flex items-start gap-2 py-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm text-red-700 dark:text-red-400">
              <span className="font-semibold">{lotsConProblema.length}</span>{' '}
              {lotsConProblema.length === 1 ? 'lote no puede' : 'lotes no pueden'} entrar a producción
              sin autorización escrita.{' '}
              <button
                type="button"
                onClick={() => setLotOnlyProblem((v) => !v)}
                className="font-semibold underline underline-offset-2"
              >
                {lotOnlyProblem ? 'Ver todos' : 'Ver sólo éstos'}
              </button>
            </p>
          </CardContent>
        </Card>
      )}

      <div className="print:hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allVisibleLotsSelected}
                  onCheckedChange={toggleSelectAllVisibleLots}
                  disabled={lotsVisibles.length === 0}
                  aria-label="Seleccionar todos los lotes visibles"
                />
              </TableHead>
              <TableHead>Ítem</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Certificado</TableHead>
              <TableHead>Vence</TableHead>
              {/* Recibido y disponible por separado — un lote a medio
                  consumir se veía tan lleno como uno intacto cuando sólo
                  se mostraba quantity_available (auditoría 2026-08). */}
              <TableHead className="text-right">Recibido</TableHead>
              <TableHead className="text-right">Disponible</TableHead>
              <TableHead className="text-right">Costo unitario</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotsLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Cargando lotes…</TableCell></TableRow>
            )}
            {lotsError && (
              <TableRow><TableCell colSpan={7} className="text-center text-red-600 py-8">
                No se pudieron cargar los lotes. <button className="underline" onClick={() => refetchLots()}>Reintentar</button>
              </TableCell></TableRow>
            )}
            {!lotsLoading && !lotsError && lots.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin lotes todavía.</TableCell></TableRow>
            )}
            {!lotsLoading && !lotsError && lots.length > 0 && lotsVisibles.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nada calza con esa búsqueda o filtro.</TableCell></TableRow>
            )}
            {lotsVisibles.map((lot: any) => {
              const estado = certStatus(lot.certification_expires_on);
              const bloqueado = !!lot.blocked_reason;
              const disponible = Number(lot.libre ?? lot.quantity_available ?? 0);
              return (
                <TableRow key={lot.id} className={bloqueado ? 'bg-red-500/5' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selectedLots.has(lot.id)}
                      onCheckedChange={() => toggleLotSelection(lot.id)}
                      aria-label={`Seleccionar lote ${lot.lot_number}`}
                    />
                  </TableCell>
                  <TableCell>{lot.inventory_items?.name || '-'}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-1.5">
                      {lot.lot_number}
                      {bloqueado && (
                        <span title={lot.blocked_reason} className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-600 dark:text-red-400">
                          <Lock className="h-3 w-3" /> retenido
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{lot.certification_code || '-'}</TableCell>
                  <TableCell>
                    {lot.certification_expires_on ? (
                      <span className={estado === 'vencido' ? 'text-red-600 dark:text-red-400 font-medium' : estado === 'por_vencer' ? 'text-amber-600 dark:text-amber-400' : ''}>
                        {lot.certification_expires_on}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{Number(lot.quantity_received || 0).toFixed(3)}</TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${disponible <= 0 ? 'text-muted-foreground' : ''}`}>{disponible.toFixed(3)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCLP(Number(lot.unit_cost || 0))}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* La hoja de etiquetas. Sólo existe al imprimir — ver el
          aislamiento de impresión en AppShell/Breadcrumbs, porque acá
          adentro hay barra lateral, breadcrumb y otras pestañas que
          print:hidden por sí solo no alcanza a cubrir con seguridad. */}
      <div className="etiqueta-print-sheet hidden print:flex print:flex-wrap print:gap-2">
        {lotsParaImprimir.map((l: any) => (
          <EtiquetaLote key={l.id} lote={l} />
        ))}
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 8mm;
        }
        @media print {
          /* El fondo degradado del tema vive en \`body\` mismo, no en un
             hijo — \`body *\` no lo alcanza. Sin esto se imprime un
             arcoíris de tinta detrás de las etiquetas. */
          body {
            background: white !important;
          }
          body * {
            visibility: hidden;
          }
          .etiqueta-print-sheet,
          .etiqueta-print-sheet * {
            visibility: visible;
          }
          .etiqueta-print-sheet {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
          .etiqueta {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
