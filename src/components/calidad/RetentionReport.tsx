'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShieldCheck, Archive, FileStack, Clock, CalendarClock, Image as ImageIcon, GitCommitHorizontal,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRetention } from '@/hooks/use-retention';

const fmtDate = (s: string | null | undefined) =>
  s && isValid(parseISO(s)) ? format(parseISO(s), 'PP', { locale: es }) : '—';

function Stat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string | number; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className={`h-4 w-4 ${tone ?? ''}`} />{label}
        </div>
        <div className={`mt-1 text-2xl font-bold ${tone ?? 'text-foreground'}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

export default function RetentionReport() {
  const { data, isLoading } = useRetention();

  if (isLoading || !data) {
    return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Compliance statement */}
      <Card className="border-l-4 border-l-emerald-500">
        <CardContent className="p-5 flex items-start gap-3">
          <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">Control de documentos · Retención FSSC 22000</span>
              <Badge className="bg-emerald-500 text-white text-xs">{data.policy_years} años</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Los registros de trazabilidad (OTs, lotes, certificados, evidencia y aprobaciones) se conservan al
              menos {data.policy_years} años. Ningún registro se elimina antes de cumplir su periodo de retención.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={FileStack} label="Registros (OTs)" value={data.total_ots.toLocaleString()} tone="text-indigo-500" />
        <Stat icon={Clock} label="En retención" value={data.under_retention.toLocaleString()} tone="text-emerald-500" />
        <Stat icon={Archive} label="Elegibles para archivo" value={data.past_retention.toLocaleString()} tone="text-amber-500" />
        <Stat icon={ImageIcon} label="Evidencias" value={data.attachments_count.toLocaleString()} tone="text-cyan-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4" />Línea de retención</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Registro más antiguo</span><span className="font-medium">{fmtDate(data.oldest_record)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Próximo vencimiento de retención</span><span className="font-medium">{fmtDate(data.next_retention_expiry)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Registros recientes retenidos hasta</span><span className="font-medium">{fmtDate(data.retained_through)}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><GitCommitHorizontal className="h-4 w-4" />Evidencia conservada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Fotos / documentos de entregable</span><span className="font-medium">{data.attachments_count.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Eventos de trazabilidad de proceso</span><span className="font-medium">{data.status_events_count.toLocaleString()}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
