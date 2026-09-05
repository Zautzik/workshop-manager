'use client';

/**
 * UsarPlantilla — arrancar la OT desde un producto estándar ya costeado.
 *
 * `ot_templates` y su ruta GET /api/ot-templates existían desde antes: la
 * base de datos las guarda, la API las sirve, `ots.template_id` incluso tiene
 * su propia columna FK con todo el camino de guardado ya cableado
 * (UnifiedOTWizard, EditBudgetWizard) — pero nada en el formulario ponía ese
 * campo en otra cosa que `''`. Tres plantillas reales (caja plegadiza,
 * etiqueta de vino, volante) llevaban meses sin una sola forma de usarse.
 *
 * Distinto de "Repetir OT anterior": esto no busca un trabajo ya hecho para
 * ESTE cliente, busca una receta estándar para un TIPO de producto — la caja
 * a la que este cliente nunca le ha pedido nada, pero que el taller ya sabe
 * costear.
 */

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LayoutTemplate } from 'lucide-react';
import type { OTFinishes } from '@/types/ot';

export interface OtTemplateRow {
  id: string;
  name: string;
  description: string | null;
  product_type: string | null;
  substrate_type: string | null;
  grammage_gsm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  color_front: string | null;
  color_back: string | null;
  finishes: Partial<OTFinishes> | null;
  margin_pct: number | null;
  increment_pct: number | null;
  commission_pct: number | null;
}

function useOtTemplates() {
  return useQuery<OtTemplateRow[]>({
    queryKey: ['wizard', 'ot-templates'],
    queryFn: async () => {
      const res = await fetch('/api/ot-templates', { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60_000,
  });
}

interface Props {
  onApply: (tpl: OtTemplateRow) => void;
}

export function UsarPlantilla({ onApply }: Props) {
  const { data: templates = [], isLoading } = useOtTemplates();

  // Nada que ofrecer todavía no es un error -- es un taller que no ha
  // cargado plantillas. Silencioso, no un mensaje de "no hay nada aquí".
  if (!isLoading && templates.length === 0) return null;

  return (
    <Card className="border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <LayoutTemplate className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">¿Es un producto estándar?</h3>
          <p className="text-xs text-muted-foreground">
            Arranca desde una receta ya costeada — papel, colores, terminaciones y márgenes
            quedan cargados. Ajusta lo que cambie para este cliente.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando plantillas…</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {templates.map((tpl) => (
            <div key={tpl.id} className="rounded-md border border-border bg-background/60 p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{tpl.name}</span>
                {tpl.margin_pct != null && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">{tpl.margin_pct}% margen</Badge>
                )}
              </div>
              {tpl.description && (
                <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{tpl.description}</p>
              )}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {tpl.substrate_type && <span>{tpl.substrate_type}</span>}
                {tpl.grammage_gsm ? <span>{tpl.grammage_gsm} g</span> : null}
                {tpl.width_cm && tpl.height_cm ? <span>{tpl.width_cm}×{tpl.height_cm} cm</span> : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-2 h-7 w-full text-xs"
                onClick={() => onApply(tpl)}
              >
                Usar esta plantilla
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default UsarPlantilla;
