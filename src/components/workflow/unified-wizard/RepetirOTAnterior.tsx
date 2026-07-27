'use client';

/**
 * "Repetir OT anterior" — cómo empieza de verdad un trabajo en una imprenta.
 *
 * El mejor estimador de un taller no es una fórmula: es el precedente. "Qué le
 * cobramos a Viña Santa Elena la vez pasada por esta misma etiqueta" gana
 * cualquier discusión, porque incluye todo lo que el modelo no sabe — que ese
 * cliente pide prueba de color, que ese troquel ya existe, que esa cartulina
 * llega en tres semanas.
 *
 * El campo `ot_anterior` vivía en el formulario sin conectarse a nada. Esto lo
 * conecta: buscar un trabajo pasado, ver qué se cobró Y qué costó de verdad, y
 * arrancar la OT nueva con esas especificaciones ya cargadas.
 *
 * Deliberadamente NO copia el precio. Copia el trabajo. El precio se recalcula
 * con las tarifas de hoy — el papel de hace ocho meses no vale lo de hoy, y
 * arrastrar un precio viejo es cómo se repite un error de cotización.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, RotateCcw, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCLP } from '@/lib/format';
import type { UnifiedOTForm } from '@/types/ot-unified';

interface PastOT {
  id: string;
  ot_number: string;
  client_name: string;
  client_id: string | null;
  product_name: string | null;
  product_type: string | null;
  quantity: number;
  width_cm: number | null;
  height_cm: number | null;
  substrate_type: string | null;
  grammage_gsm: number | null;
  color_front: string | null;
  color_back: string | null;
  ink_coverage: string | null;
  total_price: number | null;
  created_at: string;
}

function usePastOTs(term: string) {
  return useQuery<PastOT[]>({
    queryKey: ['wizard', 'past-ots'],
    queryFn: async () => {
      const res = await fetch('/api/ots?limit=200', { credentials: 'include' });
      if (!res.ok) return [];
      const payload = await res.json();
      const list: any[] = Array.isArray(payload) ? payload : payload?.data ?? [];
      return list.filter((o) => o.width_cm && o.height_cm && Number(o.quantity) > 0);
    },
    staleTime: 5 * 60_000,
  });
}

/** Costo real acumulado del trabajo pasado — lo que de verdad salió. */
function useRealCost(otId: string | null) {
  return useQuery<number | null>({
    queryKey: ['wizard', 'past-real-cost', otId],
    queryFn: async () => {
      if (!otId) return null;
      const res = await fetch(`/api/ots/${otId}/cost-analysis`, { credentials: 'include' });
      if (!res.ok) return null;
      const body = await res.json().catch(() => null);
      const actual = Number(body?.summary?.total_actual ?? 0);
      return actual > 0 ? actual : null;
    },
    enabled: Boolean(otId),
    staleTime: 60_000,
  });
}

interface Props {
  onApply: (patch: Partial<UnifiedOTForm>, otNumber: string) => void;
}

export function RepetirOTAnterior({ onApply }: Props) {
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<PastOT | null>(null);
  const { data: all = [], isLoading } = usePastOTs(term);
  const { data: realCost } = useRealCost(picked?.id ?? null);

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return all
      .filter(
        (o) =>
          o.client_name?.toLowerCase().includes(q) ||
          o.product_name?.toLowerCase().includes(q) ||
          String(o.ot_number).toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [all, term]);

  const apply = (ot: PastOT) => {
    onApply(
      {
        client_name: ot.client_name ?? '',
        client_id: ot.client_id ?? '',
        product_name: ot.product_name ?? '',
        product_type: (ot.product_type ?? '') as UnifiedOTForm['product_type'],
        quantity: Number(ot.quantity) || 0,
        width_cm: Number(ot.width_cm) || 0,
        height_cm: Number(ot.height_cm) || 0,
        substrate_type: (ot.substrate_type ?? '') as UnifiedOTForm['substrate_type'],
        grammage_gsm: Number(ot.grammage_gsm) || 0,
        color_front: (ot.color_front ?? 'cmyk') as UnifiedOTForm['color_front'],
        color_back: (ot.color_back ?? 'sin_impresion') as UnifiedOTForm['color_back'],
        ink_coverage: (ot.ink_coverage ?? 'medium') as UnifiedOTForm['ink_coverage'],
        ot_anterior: ot.ot_number,
      },
      ot.ot_number
    );
  };

  return (
    <Card className="border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">¿Es una repetición?</h3>
          <p className="text-xs text-muted-foreground">
            Busca el trabajo anterior y arranca con sus especificaciones. El precio se recalcula con
            las tarifas de hoy — el papel de hace ocho meses no vale lo de hoy.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setPicked(null);
          }}
          placeholder="Cliente, producto o número de OT…"
          className="h-9 pl-8 text-sm"
        />
      </div>

      {term.trim() && !isLoading && matches.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Sin trabajos anteriores que coincidan. Sigue abajo para crearla desde cero.
        </p>
      )}

      {matches.length > 0 && (
        <div className="space-y-1.5">
          {matches.map((ot) => {
            const active = picked?.id === ot.id;
            return (
              <div
                key={ot.id}
                className={`rounded-md border p-2.5 transition-colors ${
                  active ? 'border-primary bg-primary/10' : 'border-border bg-background/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setPicked(active ? null : ot)}
                  className="w-full text-left"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {ot.product_name || 'Sin nombre'}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{ot.ot_number}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{ot.client_name}</span>
                    <span>{Number(ot.quantity).toLocaleString('es-CL')} u</span>
                    <span>{ot.width_cm}×{ot.height_cm} cm</span>
                    {ot.grammage_gsm ? <span>{ot.grammage_gsm} g</span> : null}
                    <span>{new Date(ot.created_at).toLocaleDateString('es-CL')}</span>
                  </div>
                </button>

                {active && (
                  <div className="mt-2 space-y-2 border-t border-border pt-2">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="text-muted-foreground">
                        Se cobró{' '}
                        <b className="text-foreground">
                          {ot.total_price ? formatCLP(ot.total_price) : '—'}
                        </b>
                      </span>
                      {realCost != null && ot.total_price ? (
                        <span
                          className={`inline-flex items-center gap-1 ${
                            realCost > ot.total_price ? 'text-destructive' : 'text-emerald-600'
                          }`}
                        >
                          {realCost > ot.total_price ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          costó {formatCLP(realCost)}
                        </span>
                      ) : (
                        <Badge variant="outline" className="border-border text-[10px] font-normal">
                          sin costo real registrado
                        </Badge>
                      )}
                    </div>
                    {realCost != null && ot.total_price && realCost > ot.total_price && (
                      <p className="text-[11px] text-destructive">
                        Ese trabajo costó más de lo que se cobró. Revisa el precio antes de repetirlo.
                      </p>
                    )}
                    <Button size="sm" className="h-7 text-xs" onClick={() => apply(ot)}>
                      Usar estas especificaciones
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default RepetirOTAnterior;
