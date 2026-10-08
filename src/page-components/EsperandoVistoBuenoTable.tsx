'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { formatCLP } from '@/lib/format';
import { otStatusBadgeClass, otStatusLabel } from '@/lib/status-labels';

export function EsperandoVistoBuenoTable({
  esperando,
  onRegistrarVistoBueno,
}: {
  esperando: any[];
  onRegistrarVistoBueno: (ot: { id: string; numero: string; cliente: string }) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Esperando el visto bueno del cliente</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Órdenes creadas que todavía no tienen la prueba firmada. Una vez firmada se
          compra el papel y se graban las planchas: hasta ahí se puede cambiar.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">OT</th>
                <th className="text-left py-2 px-3 font-medium">Cliente</th>
                <th className="text-left py-2 px-3 font-medium">Producto</th>
                <th className="text-right py-2 px-3 font-medium">Total</th>
                <th className="text-center py-2 px-3 font-medium">Entrega</th>
                <th className="text-center py-2 px-3 font-medium">Estado</th>
                <th className="text-right py-2 px-3 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {esperando.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground">
                    Nada esperando visto bueno. Creá una OT con el botón de arriba.
                  </td>
                </tr>
              )}
              {esperando.map((ot: any) => (
                <tr key={ot.id} className="border-b hover:bg-muted/40">
                  <td className="py-2 px-3 font-mono font-semibold">{ot.ot_number}</td>
                  <td className="py-2 px-3">{ot.client_name}</td>
                  <td className="py-2 px-3 text-muted-foreground">{ot.product_name}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{formatCLP(ot.total_price ?? 0)}</td>
                  <td className="py-2 px-3 text-center text-xs text-muted-foreground tabular-nums">
                    {ot.deadline
                      ? new Date(ot.deadline.length <= 10 ? `${ot.deadline}T00:00:00` : ot.deadline)
                          .toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
                      : '—'}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <Badge className={otStatusBadgeClass(ot.status)}>{otStatusLabel(ot.status)}</Badge>
                  </td>
                  <td className="py-2 px-3 text-right">
                    {/* La acción depende de dónde está parada la OT: en Pre-Prensa
                        falta completar la ficha; en Visto Bueno lo que falta es una
                        persona que decida, y eso hay que registrarlo con nombre. */}
                    {/* El documento para el cliente, en los dos momentos: antes
                        del visto bueno sale con banda, después con precio firme.
                        Se abre en pestaña nueva porque se comparte por enlace. */}
                    <Link
                      href={`/documentos/cotizacion/${ot.id}`}
                      target="_blank"
                      className="mr-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                    >
                      <FileSpreadsheet className="h-3 w-3" />
                      {ot.status === 'pre_press' ? 'Cotización' : 'Cotización final'}
                    </Link>
                    {ot.status === 'visto_bueno' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => onRegistrarVistoBueno({ id: ot.id, numero: ot.ot_number, cliente: ot.client_name })}
                      >
                        <ShieldCheck className="mr-1 h-3 w-3" />
                        Registrar visto bueno
                      </Button>
                    ) : (
                      <Link
                        href="/operaciones/pre-prensa"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Completar ficha
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
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
