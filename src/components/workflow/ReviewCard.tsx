'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MessageSquare, User, Phone, Timer, AlertTriangle, Eye } from 'lucide-react';
import type { WhatsAppProductionLog } from '@/types/whatsapp-production';
import { formatCLP } from '@/lib/whatsapp-cost-inference';
import { StatusBadge } from './StatusBadge';
import { ConfidenceBadge } from './ConfidenceBadge';

export function ReviewCard({
  log,
  onReview,
}: {
  log: WhatsAppProductionLog;
  onReview: (log: WhatsAppProductionLog) => void;
}) {
  const parsedData = log.parsed_data as any;
  const inferredCosts = log.inferred_costs as any;

  return (
    <Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-600 text-white font-mono">
              OT-{log.ot_number}
            </Badge>
            <StatusBadge status={log.review_status} />
            {parsedData?.confidence !== undefined && (
              <ConfidenceBadge confidence={parsedData.confidence} />
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(log.message_timestamp).toLocaleString('es-CL')}
          </span>
        </div>

        {/* Operator Info */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            {log.operator_name || 'Sin nombre'}
          </span>
          <span className="flex items-center gap-1">
            <Phone className="h-3.5 w-3.5" />
            {log.operator_phone}
          </span>
          {log.elapsed_minutes && (
            <span className="flex items-center gap-1">
              <Timer className="h-3.5 w-3.5" />
              {Math.round(log.elapsed_minutes)} min
            </span>
          )}
        </div>

        {/* Raw Message */}
        <div className="bg-muted/50 rounded-lg p-3 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> Mensaje original
          </p>
          <p className="text-sm font-mono">&quot;{log.raw_message}&quot;</p>
        </div>

        {/* Quick Stats */}
        {parsedData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {parsedData.pliegos_produced !== null && (
              <div className="bg-background rounded p-2 border text-center">
                <p className="text-lg font-bold">{parsedData.pliegos_produced?.toLocaleString('es-CL')}</p>
                <p className="text-xs text-muted-foreground">Pliegos</p>
              </div>
            )}
            {parsedData.merma !== null && (
              <div className="bg-background rounded p-2 border text-center">
                <p className="text-lg font-bold text-amber-500">{parsedData.merma?.toLocaleString('es-CL')}</p>
                <p className="text-xs text-muted-foreground">Merma</p>
              </div>
            )}
            {parsedData.buenos !== null && (
              <div className="bg-background rounded p-2 border text-center">
                <p className="text-lg font-bold text-green-500">{parsedData.buenos?.toLocaleString('es-CL')}</p>
                <p className="text-xs text-muted-foreground">Buenos</p>
              </div>
            )}
            {inferredCosts?.total_inferred_cost > 0 && (
              <div className="bg-background rounded p-2 border text-center">
                <p className="text-lg font-bold text-blue-500">{formatCLP(inferredCosts.total_inferred_cost)}</p>
                <p className="text-xs text-muted-foreground">Costo est.</p>
              </div>
            )}
          </div>
        )}

        {/* Processes */}
        {parsedData?.processes_mentioned?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {parsedData.processes_mentioned.map((p: string) => (
              <Badge key={p} variant="secondary" className="text-xs">
                {p}
              </Badge>
            ))}
          </div>
        )}

        {/* Problems Alert */}
        {parsedData?.problems_reported?.length > 0 && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {parsedData.problems_reported.join(' | ')}
            </AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onReview(log)}
            className="gap-1"
          >
            <Eye className="h-3.5 w-3.5" />
            Revisar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
