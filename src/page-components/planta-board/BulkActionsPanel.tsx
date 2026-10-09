'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WandSparkles, Replace, Shuffle } from 'lucide-react';

export function BulkActionsPanel({
  selectedShiftId,
  bulkActionLoading,
  onAutoFill,
  onReplaceConflicts,
  onRedistributeOT,
}: {
  selectedShiftId: string | null;
  bulkActionLoading: 'auto-fill' | 'replace-conflicts' | 'redistribute-ot' | null;
  onAutoFill: () => void;
  onReplaceConflicts: () => void;
  onRedistributeOT: () => void;
}) {
  return (
    <Card className="bg-card/80 border-border backdrop-blur-sm p-3">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Acciones masivas</p>
      <div className="space-y-1.5">
        <Button onClick={onAutoFill} disabled={!selectedShiftId || bulkActionLoading !== null} size="sm" className="w-full h-7 text-xs justify-start">
          <WandSparkles className="w-3.5 h-3.5 mr-1.5" />
          {bulkActionLoading === 'auto-fill' ? 'Asignando...' : 'Auto-fill por restricciones'}
        </Button>
        <Button onClick={onReplaceConflicts} disabled={!selectedShiftId || bulkActionLoading !== null} variant="outline" size="sm" className="w-full h-7 text-xs justify-start border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400">
          <Replace className="w-3.5 h-3.5 mr-1.5" />
          {bulkActionLoading === 'replace-conflicts' ? 'Reemplazando...' : 'Reemplazar conflictos'}
        </Button>
        <Button onClick={onRedistributeOT} disabled={!selectedShiftId || bulkActionLoading !== null} variant="outline" size="sm" className="w-full h-7 text-xs justify-start border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400">
          <Shuffle className="w-3.5 h-3.5 mr-1.5" />
          {bulkActionLoading === 'redistribute-ot' ? 'Redistributing...' : 'Redistribuir HE'}
        </Button>
      </div>
    </Card>
  );
}
