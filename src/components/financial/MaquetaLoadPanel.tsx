'use client';

/**
 * Carga de maquetas por cliente.
 *
 * `maquetaLoadByClient` (src/lib/maqueta.ts) calculaba esto desde hace meses
 * y ninguna pantalla lo mostraba. La razón por la que importa: un cliente que
 * pide tres vueltas y aprueba a la tercera puede dejar menos margen que uno
 * que paga menos y aprueba a la primera, y mirando sólo el margen del tiraje
 * los dos se ven idénticos (spec-pre-prensa-y-visto-bueno.md, Fase D).
 */

import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCLP } from '@/lib/format';

interface ClientMaquetaLoad {
  clientName: string;
  jobs: number;
  rounds: number;
  cost: number;
  roundsPerJob: number;
}

export function MaquetaLoadPanel() {
  const { data, isLoading } = useQuery<{
    porCliente: ClientMaquetaLoad[];
    diagnostics: { trabajosConMaqueta: number; reason?: string };
  }>({
    queryKey: ['analytics', 'maqueta-load'],
    queryFn: async () => {
      const r = await fetch('/api/analytics/maqueta-load', { credentials: 'include' });
      if (!r.ok) throw new Error('No se pudo leer la carga de maquetas');
      return r.json();
    },
  });

  const filas = (data?.porCliente ?? []).slice(0, 8);

  if (isLoading) return null;
  if (filas.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Layers className="h-4 w-4 text-amber-500" />
          Carga de maquetas por cliente
        </CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Vueltas antes de aprobar, por cliente. Arriba de 2 vueltas por trabajo es un cliente que
          cuesta convencer — un dato que el margen del tiraje solo no muestra.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-1.5 pr-3 text-left font-medium">Cliente</th>
                <th className="py-1.5 px-3 text-right font-medium">Trabajos</th>
                <th className="py-1.5 px-3 text-right font-medium">Vueltas</th>
                <th className="py-1.5 px-3 text-right font-medium">Vueltas/trabajo</th>
                <th className="py-1.5 pl-3 text-right font-medium">Costo maquetas</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clientName} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 font-medium text-foreground">{f.clientName}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{f.jobs}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{f.rounds}</td>
                  <td
                    className={`py-1.5 px-3 text-right tabular-nums font-medium ${
                      f.roundsPerJob > 2 ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'
                    }`}
                  >
                    {f.roundsPerJob}
                  </td>
                  <td className="py-1.5 pl-3 text-right tabular-nums font-semibold text-foreground">
                    {formatCLP(f.cost)}
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
