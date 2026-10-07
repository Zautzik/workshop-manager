'use client';

import { Badge } from '@/components/ui/badge';
import type { InferredCostLine } from '@/types/whatsapp-production';
import { formatCLP, confidenceMargin } from '@/lib/whatsapp-cost-inference';

export function CostLineTable({ lines, confidence }: { lines: InferredCostLine[]; confidence: number }) {
  const margin = confidenceMargin(confidence);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left p-2 font-medium">Concepto</th>
            <th className="text-right p-2 font-medium">Cant.</th>
            <th className="text-right p-2 font-medium">Unid.</th>
            <th className="text-right p-2 font-medium">$/u</th>
            <th className="text-right p-2 font-medium">Total</th>
            <th className="text-center p-2 font-medium">Fuente</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
              <td className="p-2">{line.description}</td>
              <td className="p-2 text-right font-mono">{line.quantity.toLocaleString('es-CL')}</td>
              <td className="p-2 text-right text-muted-foreground">{line.unit}</td>
              <td className="p-2 text-right font-mono">{formatCLP(line.unit_cost)}</td>
              <td className="p-2 text-right font-mono font-medium">{formatCLP(line.total_cost)}</td>
              <td className="p-2 text-center">
                <Badge variant="outline" className={`text-[10px] ${
                  line.source === 'parsed' ? 'bg-green-500/10 text-green-500' :
                  line.source === 'inferred' ? 'bg-blue-500/10 text-blue-500' :
                  'bg-gray-500/10 text-gray-500'
                }`}>
                  {line.source === 'parsed' ? '📱 Dato' :
                   line.source === 'inferred' ? '🤖 IA' : '📋 Default'}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/30">
            <td colSpan={4} className="p-2 font-semibold">Total Estimado</td>
            <td className="p-2 text-right font-mono font-bold text-lg">
              {formatCLP(lines.reduce((s, l) => s + l.total_cost, 0))}
            </td>
            <td className="p-2 text-center text-xs text-muted-foreground">
              ±{Math.round((1 - margin.low) * 100)}%
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
