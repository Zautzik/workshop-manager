'use client';

/**
 * Matriz de mantención por máquina -- componente × frecuencia, cada celda
 * coloreada por tipo de acción. La versión digital, siempre al día, de la
 * hoja de mantención en papel que ya usa el taller para la Ryobi: la
 * aritmética vive en maintenance-matrix.ts (testeada), el checklist sigue
 * siendo la única fuente de verdad -- editar uno en Checklists cambia lo
 * que esta vista muestra, no hay una copia separada que se desactualice.
 *
 * Estructura de tabla plana (sticky left, zebra) igual que el único otro
 * pivote de este proyecto, RoleTransitionsMatrix.tsx -- no se inventa un
 * componente de grilla nuevo para esto.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Printer, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMaintenanceChecklists } from '@/hooks/use-maintenance-queries';
import { buildMaintenanceMatrix, type MatrixEntry } from '@/lib/maintenance-matrix';
import { actionTypeMeta, frequencyLabel, ACTION_TYPE_META } from '@/lib/maintenance-checklist-meta';

interface MachineOption {
  id: string;
  name: string;
  type: string;
}

function useMachinesList() {
  return useQuery<MachineOption[]>({
    queryKey: ['maintenance', 'machines-for-matrix'],
    queryFn: async () => {
      const res = await fetch('/api/machines', { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });
}

/** Mismo criterio de match que PautasPanel.tsx (checklist ligado a una máquina puntual, o a todo su tipo). */
function checklistAppliesTo(checklist: any, machine: MachineOption): boolean {
  if (checklist.machine_id) return checklist.machine_id === machine.id;
  return !checklist.machine_type || checklist.machine_type === machine.type;
}

export function MachineMaintenanceMatrix() {
  const { data: machines = [], isLoading: loadingMachines } = useMachinesList();
  const { data: checklists = [], isLoading: loadingChecklists } = useMaintenanceChecklists();
  const [machineId, setMachineId] = useState<string>('');

  const selectedMachine = machines.find((m) => m.id === machineId) ?? null;

  const matrix = useMemo(() => {
    if (!selectedMachine) return { rows: [], frequencies: [] };
    const entries: MatrixEntry[] = [];
    for (const checklist of checklists as any[]) {
      if (!checklistAppliesTo(checklist, selectedMachine)) continue;
      const items = Array.isArray(checklist.items) ? checklist.items : [];
      for (const item of items) {
        entries.push({
          section: item.section ?? null,
          frequency: checklist.frequency ?? 'as_needed',
          actionType: item.actionType ?? null,
          checklistName: checklist.name,
        });
      }
    }
    return buildMaintenanceMatrix(entries);
  }, [checklists, selectedMachine]);

  const isLoading = loadingMachines || loadingChecklists;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="max-w-xs flex-1">
          <Select value={machineId} onValueChange={setMachineId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona una máquina…" />
            </SelectTrigger>
            <SelectContent>
              {machines.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {matrix.rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> Imprimir
          </Button>
        )}
      </div>

      {selectedMachine && matrix.rows.length > 0 && (
        <div className="hidden text-center print:block">
          <h1 className="text-xl font-bold">{selectedMachine.name} — Matriz de mantención</h1>
          <p className="text-sm text-muted-foreground">Impreso el {new Date().toLocaleDateString('es-CL')}</p>
        </div>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : !selectedMachine ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Cpu className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Elige una máquina para ver su matriz de mantención.</p>
          </CardContent>
        </Card>
      ) : matrix.rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Sin checklists cargados para esta máquina todavía. Se pueden crear en la pestaña Checklists.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Componente
                  </th>
                  {matrix.frequencies.map((f) => (
                    <th key={f} className="min-w-[100px] px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                      {frequencyLabel(f)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row, i) => (
                  <tr key={row.section} className={cn('border-b last:border-0', i % 2 === 1 && 'bg-muted/20')}>
                    <td className="sticky left-0 z-10 bg-inherit px-3 py-1.5 text-xs font-medium">
                      {row.section}
                    </td>
                    {matrix.frequencies.map((f) => {
                      const actionTypes = row.cells[f];
                      return (
                        <td key={f} className="px-2 py-1.5 text-center">
                          {actionTypes === undefined ? null : actionTypes.length === 0 ? (
                            <span
                              title="Hay un paso acá, sin tipo de acción registrado"
                              className="mx-auto inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground/40"
                            />
                          ) : (
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              {actionTypes.map((at) => {
                                const meta = actionTypeMeta(at);
                                const Icon = meta.icon;
                                return (
                                  <span
                                    key={at}
                                    title={meta.label}
                                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${meta.className}`}
                                  >
                                    <Icon className="h-3 w-3" />
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3 border-t pt-3">
            {Object.entries(ACTION_TYPE_META).map(([key, meta]) => {
              const Icon = meta.icon;
              return (
                <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${meta.className}`}>
                    <Icon className="h-2.5 w-2.5" />
                  </span>
                  {meta.label}
                </span>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default MachineMaintenanceMatrix;
