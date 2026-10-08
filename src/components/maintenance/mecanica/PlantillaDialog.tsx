'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { machineTypeLabel } from '@/types/machine-type';
import { CRITICALITY_STYLE, type TemplateItem } from './types';

/* ── Plantilla por clase de máquina ──────────────────────────────────── */

export function PlantillaDialog({
  machineId, onApplied,
}: {
  machineId: string;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{
    machine: { name: string; type: string };
    has_template: boolean;
    items: TemplateItem[];
    missing_fields_notice: string;
  }>({
    queryKey: ['machine-parts-template', machineId],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`/api/machine-parts/template?machine_id=${machineId}`);
      if (!res.ok) throw new Error('No se pudo cargar la plantilla');
      const json = await res.json();
      // Por defecto vienen marcadas las que faltan: el trabajo es tachar lo que
      // esta máquina no tiene, no acordarse de lo que sí.
      setMarcadas(new Set(json.items.filter((i: TemplateItem) => !i.already_present).map((i: TemplateItem) => i.name)));
      return json;
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const items = (data?.items ?? [])
        .filter((i) => marcadas.has(i.name) && !i.already_present)
        .map((i) => ({
          system_id: i.system_id,
          name: i.name,
          criticality: i.criticality,
          position: i.position ?? null,
        }));
      const res = await fetch('/api/machine-parts/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machine_id: machineId, items }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo aplicar la plantilla');
      return json;
    },
    onSuccess: (json) => {
      toast.success(
        `${json.created} piezas creadas. Ahora falta lo que la plantilla no puede saber: plazo de reposición y vida útil de cada una.`
      );
      setOpen(false);
      onApplied();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (name: string) =>
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  const porSistema = useMemo(() => {
    const map = new Map<string, TemplateItem[]>();
    for (const i of data?.items ?? []) {
      map.set(i.system_name, [...(map.get(i.system_name) ?? []), i]);
    }
    return map;
  }, [data]);

  const aCrear = (data?.items ?? []).filter((i) => marcadas.has(i.name) && !i.already_present).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <ClipboardList className="h-4 w-4" /> Partir de una plantilla
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Piezas habituales de {data ? machineTypeLabel(data.machine.type).toLowerCase() : 'esta máquina'}
          </DialogTitle>
        </DialogHeader>

        {isLoading && <Skeleton className="h-64 w-full" />}

        {data && (
          <div className="space-y-4">
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              {data.missing_fields_notice}
            </p>

            <p className="text-sm text-muted-foreground">
              Vienen marcadas las que faltan. Destilda lo que esta máquina no tiene —
              es más rápido tachar que acordarse.
            </p>

            {[...porSistema.entries()].map(([sistema, items]) => (
              <div key={sistema} className="space-y-1.5">
                <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  {sistema}
                </p>
                <ul className="space-y-1">
                  {items.map((i) => (
                    <li key={i.name}>
                      <label
                        className={`flex cursor-pointer items-start gap-2.5 rounded-md p-2 text-sm transition-colors hover:bg-muted/60 ${
                          i.already_present ? 'opacity-50' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 accent-current"
                          checked={i.already_present || marcadas.has(i.name)}
                          disabled={i.already_present}
                          onChange={() => toggle(i.name)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            {i.name}
                            <Badge variant="outline" className={`text-[0.65rem] ${CRITICALITY_STYLE[i.criticality] ?? ''}`}>
                              {i.criticality}
                            </Badge>
                            {i.position && (
                              <span className="text-xs text-muted-foreground">({i.position})</span>
                            )}
                            {i.already_present && (
                              <span className="text-xs text-muted-foreground">ya registrada</span>
                            )}
                          </span>
                          {i.note && (
                            <span className="mt-0.5 block text-xs text-muted-foreground">{i.note}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={aCrear === 0 || mut.isPending}>
            Crear {aCrear} pieza{aCrear === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
