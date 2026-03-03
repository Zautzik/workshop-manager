'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  MessageSquare,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OTApproval, OTApprovalStatus } from '@/types/ot';

interface Props {
  otId: string;
}

const STATUS_CONFIG: Record<OTApprovalStatus, { icon: React.ReactNode; label: string; color: string }> = {
  pending: {
    icon: <Clock className="h-4 w-4" />,
    label: 'Pendiente',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  approved: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    label: 'Aprobado',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  rejected: {
    icon: <XCircle className="h-4 w-4" />,
    label: 'Rechazado',
    color: 'text-red-400 bg-red-500/10 border-red-500/20',
  },
  revision_requested: {
    icon: <AlertTriangle className="h-4 w-4" />,
    label: 'Revisión Solicitada',
    color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  },
};

export function OTApprovalPanel({ otId }: Props) {
  const [approvals, setApprovals] = useState<OTApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAction, setShowAction] = useState<'approve' | 'reject' | 'request_revision' | null>(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchApprovals = async () => {
    try {
      const res = await fetch(`/api/ots/${otId}/approval`);
      if (res.ok) {
        const data = await res.json();
        setApprovals(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, [otId]);

  const handleAction = async () => {
    if (!showAction) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/ots/${otId}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: showAction, comments: comments || null }),
      });
      if (res.ok) {
        setShowAction(null);
        setComments('');
        fetchApprovals();
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const latestApproval = approvals[0];
  const hasPending = approvals.some((a) => a.status === 'pending');

  if (loading) {
    return (
      <Card className="p-4 border-border bg-card/50">
        <div className="text-xs text-muted-foreground text-center">Cargando aprobaciones...</div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Current status badge */}
      {latestApproval && (
        <Card className={cn('p-3 border flex items-center gap-3', STATUS_CONFIG[latestApproval.status].color)}>
          {STATUS_CONFIG[latestApproval.status].icon}
          <div className="flex-1">
            <p className="text-sm font-semibold">{STATUS_CONFIG[latestApproval.status].label}</p>
            {latestApproval.comments && (
              <p className="text-xs mt-0.5 opacity-80">{latestApproval.comments}</p>
            )}
          </div>
          <span className="text-[10px] opacity-60">
            {new Date(latestApproval.created_at).toLocaleDateString('es-CL')}
          </span>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {!hasPending && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1 gap-1 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
            onClick={() => setShowAction('request_revision')}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Solicitar Revisión
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          className="flex-1 gap-1 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => setShowAction('approve')}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Aprobar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1 gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
          onClick={() => setShowAction('reject')}
        >
          <XCircle className="h-3.5 w-3.5" />
          Rechazar
        </Button>
      </div>

      {/* History */}
      {approvals.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
            Historial
          </p>
          {approvals.slice(1).map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              {STATUS_CONFIG[a.status].icon}
              <span>{STATUS_CONFIG[a.status].label}</span>
              {a.comments && <span className="truncate">— {a.comments}</span>}
              <span className="ml-auto shrink-0 text-[10px]">
                {new Date(a.created_at).toLocaleDateString('es-CL')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Action dialog */}
      <Dialog open={!!showAction} onOpenChange={(open) => !open && setShowAction(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {showAction === 'approve' && 'Aprobar OT'}
              {showAction === 'reject' && 'Rechazar OT'}
              {showAction === 'request_revision' && 'Solicitar Revisión'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Comentarios (opcional)..."
              className="bg-input border-border min-h-[80px]"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAction(null)}>
                Cancelar
              </Button>
              <Button
                onClick={handleAction}
                disabled={submitting}
                className={cn(
                  showAction === 'approve' && 'bg-emerald-600 hover:bg-emerald-700',
                  showAction === 'reject' && 'bg-red-600 hover:bg-red-700',
                  showAction === 'request_revision' && 'bg-amber-600 hover:bg-amber-700'
                )}
              >
                {submitting ? 'Procesando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
