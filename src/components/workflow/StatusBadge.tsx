'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Clock, RotateCcw, Zap } from 'lucide-react';

export function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
    pending: { label: 'Pendiente', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40', icon: Clock },
    approved: { label: 'Aprobado', color: 'bg-green-500/20 text-green-400 border-green-500/40', icon: CheckCircle2 },
    rejected: { label: 'Rechazado', color: 'bg-red-500/20 text-red-400 border-red-500/40', icon: XCircle },
    needs_revision: { label: 'Revisión', color: 'bg-purple-500/20 text-purple-400 border-purple-500/40', icon: RotateCcw },
    auto_approved: { label: 'Auto', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40', icon: Zap },
  };

  const { label, color, icon: Icon } = config[status] || config.pending;

  return (
    <Badge variant="outline" className={`${color} text-xs gap-1`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
