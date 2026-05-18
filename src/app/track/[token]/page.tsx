'use client';

/**
 * Client Read-Only OT Portal — /track/[token]
 * Public page. No auth required.
 * token = OT UUID (unguessable share link).
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, Clock, AlertTriangle, Package } from 'lucide-react';

const STATUS_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending:     { label: 'Pendiente',   icon: Clock,         color: 'text-slate-500'  },
  in_progress: { label: 'En proceso',  icon: Package,       color: 'text-blue-500'   },
  review:      { label: 'En revisión', icon: AlertTriangle, color: 'text-amber-500'  },
  completed:   { label: 'Completado',  icon: CheckCircle2,  color: 'text-green-500'  },
  cancelled:   { label: 'Cancelado',   icon: AlertTriangle, color: 'text-red-500'    },
};

type OTData = {
  id: string;
  ot_number: string;
  client_name: string;
  status: string;
  priority: string;
  created_at: string;
  due_date: string | null;
  description: string | null;
};

const TIMELINE_STEPS = ['pending', 'in_progress', 'review', 'completed'];

export default function TrackPage() {
  const params = useParams();
  const token = params?.token as string;
  const [ot, setOt] = useState<OTData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/track/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setOt(data);
      })
      .catch(() => setError('Error al cargar la orden'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="text-center">
          <h1 className="text-xl font-bold">Seguimiento de Orden</h1>
          <p className="text-sm text-muted-foreground mt-1">Portal de estado para clientes</p>
        </div>

        {loading && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">Cargando…</CardContent>
          </Card>
        )}

        {error && (
          <Card>
            <CardContent className="py-10 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        )}

        {ot && (() => {
          const meta = STATUS_META[ot.status] ?? STATUS_META.pending;
          const Icon = meta.icon;
          const activeStep = TIMELINE_STEPS.indexOf(ot.status);

          return (
            <Card>
              <CardContent className="pt-6 space-y-5">
                {/* OT Number + Client */}
                <div>
                  <p className="text-2xl font-bold">{ot.ot_number}</p>
                  <p className="text-sm text-muted-foreground">{ot.client_name}</p>
                </div>

                {/* Status badge */}
                <div className={`flex items-center gap-2 ${meta.color}`}>
                  <Icon className="h-5 w-5" />
                  <span className="font-semibold text-sm">{meta.label}</span>
                </div>

                {/* Progress timeline */}
                <div className="flex items-center gap-0">
                  {TIMELINE_STEPS.map((step, idx) => {
                    const done = idx <= activeStep;
                    const stepMeta = STATUS_META[step];
                    const StepIcon = stepMeta.icon;
                    return (
                      <div key={step} className="flex-1 flex items-center">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          <StepIcon className="h-3.5 w-3.5" />
                        </div>
                        {idx < TIMELINE_STEPS.length - 1 && (
                          <div className={`flex-1 h-0.5 ${idx < activeStep ? 'bg-primary' : 'bg-muted'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Dates */}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Creada</span>
                    <span>{format(new Date(ot.created_at), 'dd MMM yyyy', { locale: es })}</span>
                  </div>
                  {ot.due_date && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Entrega estimada</span>
                      <span>{format(new Date(ot.due_date), 'dd MMM yyyy', { locale: es })}</span>
                    </div>
                  )}
                </div>

                {ot.description && (
                  <p className="text-xs text-muted-foreground border-t pt-3">{ot.description}</p>
                )}
              </CardContent>
            </Card>
          );
        })()}
      </div>
    </div>
  );
}
