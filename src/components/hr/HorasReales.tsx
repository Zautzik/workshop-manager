'use client';

/**
 * Lo que las horas del taller dicen sobre las competencias de cada persona.
 *
 * `worker_assignments` sabe desde hace meses quién estuvo en qué puesto y
 * cuántas horas, y cada puesto tiene su máquina. Cruzarlo con las competencias
 * que esa máquina exige da las horas de práctica reales de cada quien — el
 * campo que hasta ahora había que tipear a mano y por eso estaba casi vacío.
 *
 * La pantalla PROPONE. No sube a nadie de nivel: trescientas horas en la
 * guillotina prueban que estuvo ahí, no que corte bien.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, UserPlus, TrendingUp, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface AccrualRow {
  employee_id: string;
  employee_name: string;
  skill_id: string;
  skill_name: string | null;
  observedHours: number;
  recordedHours: number;
  currentLevel: number;
  suggestedLevel: number;
  hasProposal: boolean;
  isNew: boolean;
  firstWorked: string;
  lastWorked: string;
  reason: string;
}

const nf = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

export function HorasReales() {
  const qc = useQueryClient();
  const [crearFaltantes, setCrearFaltantes] = useState(true);

  const { data, isLoading } = useQuery<{
    rows: AccrualRow[];
    summary: Record<string, number>;
    blocked_reason?: string;
  }>({
    queryKey: ['skills', 'accrual'],
    queryFn: async () => {
      const res = await fetch('/api/skills/accrual');
      if (!res.ok) throw new Error('No se pudieron calcular las horas reales');
      return res.json();
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/skills/accrual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ create_missing: crearFaltantes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo aplicar');
      return json;
    },
    onSuccess: (json) => {
      toast.success(
        `${json.updated} fichas actualizadas${json.created ? `, ${json.created} creadas` : ''}. ${
          json.pending_assessment
            ? `${json.pending_assessment} quedaron esperando evaluación.`
            : ''
        }`
      );
      qc.invalidateQueries({ queryKey: ['skills'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-80 w-full" />;

  if (data?.blocked_reason) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Info className="mx-auto h-8 w-8 text-muted-foreground opacity-50" />
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
            {data.blocked_reason}
          </p>
        </CardContent>
      </Card>
    );
  }

  const rows = data?.rows ?? [];
  const s = data?.summary ?? {};
  const conPropuesta = rows.filter((r) => r.hasProposal);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Horas reales en máquina
            </CardTitle>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Cruzando los partes de trabajo con las competencias que exige cada máquina.
              La app cuenta las horas; quién sabe hacer el trabajo lo decide una persona
              mirando el trabajo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Number(s.sin_registro ?? 0) > 0 && (
              <Badge variant="outline" className="border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300">
                {s.sin_registro} sin ficha
              </Badge>
            )}
            {Number(s.suben_nivel ?? 0) > 0 && (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                {s.suben_nivel} para evaluar
              </Badge>
            )}
            <Badge variant="secondary">{nf.format(Number(s.horas_totales ?? 0))} h en total</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {conPropuesta.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Las fichas coinciden con las horas trabajadas. No hay nada que revisar.
          </p>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {conPropuesta.map((r) => (
                <li key={`${r.employee_id}|${r.skill_id}`} className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.employee_name}</span>
                        <span className="text-sm text-muted-foreground">{r.skill_name}</span>
                        {r.isNew && (
                          <Badge variant="outline" className="gap-1 border-sky-500/30 bg-sky-500/15 text-xs text-sky-700 dark:text-sky-300">
                            <UserPlus className="h-3 w-3" /> sin ficha
                          </Badge>
                        )}
                        {r.suggestedLevel > r.currentLevel && !r.isNew && (
                          <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/15 text-xs text-emerald-700 dark:text-emerald-300">
                            <TrendingUp className="h-3 w-3" />
                            nivel {r.currentLevel} → {r.suggestedLevel}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {nf.format(r.observedHours)} h reales
                        {r.recordedHours > 0 && <> · {nf.format(r.recordedHours)} h en ficha</>}
                        {' '}· desde {r.firstWorked} hasta {r.lastWorked}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <Switch id="crear" checked={crearFaltantes} onCheckedChange={setCrearFaltantes} />
                <Label htmlFor="crear" className="cursor-pointer text-sm">
                  Crear la ficha de quien trabajó y no la tiene (en nivel 1, sin certificar)
                </Label>
              </div>
              <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
                Registrar las horas reales
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Sólo se escriben horas. Ningún nivel sube solo: eso lo firma un evaluador
              desde la ficha de la persona.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
