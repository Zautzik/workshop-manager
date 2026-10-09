'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export interface RollbackTarget {
  ot: any;
  key: string;
  labelEs: string;
  fromLabelEs: string;
}

export function RollbackDialog({
  rollbackTarget,
  onCancel,
  onConfirm,
}: {
  rollbackTarget: RollbackTarget | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!rollbackTarget) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-amber-500/40 rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
            <ArrowRight className="w-4 h-4 text-amber-400 rotate-180" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-sm">Retroceder OT</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-semibold text-foreground">{rollbackTarget.ot.ot_number}</span>
              {' '}—{' '}{rollbackTarget.ot.client_name}
            </p>
          </div>
        </div>
        <div className="bg-amber-500/8 border border-amber-500/25 rounded-lg p-3 mb-4 space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">De:</span>
            <span className="font-semibold text-foreground">{rollbackTarget.fromLabelEs}</span>
            <ArrowRight className="w-3 h-3 text-amber-400 rotate-180" />
            <span className="font-semibold text-amber-400">{rollbackTarget.labelEs}</span>
          </div>
          <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-snug">
            ⚠️ Los costos ya registrados en esta OT serán preservados. Solo se cambia el estado del proceso.
          </p>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={onConfirm}>
            Confirmar Retroceso
          </Button>
        </div>
      </div>
    </div>
  );
}
