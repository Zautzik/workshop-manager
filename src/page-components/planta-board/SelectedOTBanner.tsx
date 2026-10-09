'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function SelectedOTBanner({
  ot,
  onClear,
}: {
  ot: any;
  onClear: () => void;
}) {
  return (
    <Card className="bg-card border-accent/40 backdrop-blur-sm p-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">OT Activa: {ot.ot_number}</h3>
          <p className="text-sm text-muted-foreground">{ot.client_name} — {ot.quantity} unidades</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onClear}
          className="border-border bg-card/50 hover:bg-card"
        >
          Limpiar
        </Button>
      </div>
    </Card>
  );
}
