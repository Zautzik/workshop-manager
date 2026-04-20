'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  Timer,
  DollarSign,
  Zap,
  RotateCcw,
  Info,
} from 'lucide-react';
import { useWhatsAppLogs } from '@/hooks/use-whatsapp';
import { formatCLP } from '@/lib/whatsapp-cost-inference';
import type { WhatsAppProductionLog } from '@/types/whatsapp-production';

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
    pending: { label: 'En revisión', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40', icon: Clock },
    approved: { label: 'Aprobado', color: 'bg-green-500/20 text-green-400 border-green-500/40', icon: CheckCircle2 },
    rejected: { label: 'Rechazado', color: 'bg-red-500/20 text-red-400 border-red-500/40', icon: XCircle },
    needs_revision: { label: 'Corrección', color: 'bg-purple-500/20 text-purple-400 border-purple-500/40', icon: RotateCcw },
    auto_approved: { label: 'Registrado', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40', icon: Zap },
  };

  const { label, color, icon: Icon } = config[status] || config.pending;

  return (
    <Badge variant="outline" className={`${color} text-xs gap-1`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function LogEntry({ log }: { log: WhatsAppProductionLog }) {
  const isStart = log.message_type === 'start';
  const inferredCosts = log.inferred_costs as any;

  return (
    <Card className={`border-l-4 ${
      isStart ? 'border-l-blue-500' :
      log.review_status === 'approved' ? 'border-l-green-500' :
      log.review_status === 'rejected' ? 'border-l-red-500' :
      'border-l-amber-500'
    }`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-600 text-white font-mono text-xs">
              OT-{log.ot_number}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {isStart ? '▶ Inicio' : log.message_type === 'cancel' ? '🚫 Cancelado' : '⏹ Fin'}
            </Badge>
            <StatusBadge status={log.review_status} />
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(log.message_timestamp).toLocaleString('es-CL')}
          </span>
        </div>

        {/* Quick data */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {log.elapsed_minutes && (
            <span className="flex items-center gap-1">
              <Timer className="h-3 w-3" /> {Math.round(log.elapsed_minutes)} min
            </span>
          )}
          {inferredCosts?.total_inferred_cost > 0 && (
            <span className="flex items-center gap-1 text-blue-500">
              <DollarSign className="h-3 w-3" />
              {formatCLP(inferredCosts.total_inferred_cost)}
            </span>
          )}
        </div>

        {/* Review comments from supervisor */}
        {log.review_comments && (
          <Alert className="py-2 bg-muted/50">
            <AlertDescription className="text-xs">
              <strong>Supervisor:</strong> {log.review_comments}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default function OperatorWhatsAppView() {
  const { data, isLoading } = useWhatsAppLogs({ limit: 30 });
  const logs = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-green-500" />
        <h2 className="text-xl font-semibold">Mis Reportes WhatsApp</h2>
      </div>

      <Alert className="bg-green-500/5 border-green-500/20">
        <Info className="h-4 w-4 text-green-500" />
        <AlertDescription className="text-sm">
          Aquí puedes ver el estado de tus mensajes de producción. Envía por WhatsApp:
          <br />
          <code className="text-xs bg-muted px-1 rounded">INICIO OT-1234</code> — para iniciar
          <br />
          <code className="text-xs bg-muted px-1 rounded">FIN OT-1234 500 pliegos, 3 merma, doblado ok</code> — para finalizar
          <br />
          <code className="text-xs bg-muted px-1 rounded">CANCELAR OT-1234</code> — para anular un inicio
        </AlertDescription>
      </Alert>

      {isLoading ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Clock className="h-8 w-8 mx-auto text-muted-foreground animate-spin mb-2" />
            <p className="text-sm text-muted-foreground">Cargando...</p>
          </CardContent>
        </Card>
      ) : logs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <h3 className="text-lg font-semibold">Sin reportes aún</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Tus mensajes de WhatsApp aparecerán aquí
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-300px)]">
          <div className="space-y-3">
            {logs.map(log => (
              <LogEntry key={log.id} log={log} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
