'use client';

import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { TONE } from './types';

/* ── Resumen ─────────────────────────────────────────────────────────── */

export function ResumenCard({
  label, value, tone, icon: Icon,
}: {
  label: string; value: number; tone: string; icon: typeof AlertTriangle;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold tabular-nums ${value > 0 ? TONE[tone] : 'text-muted-foreground'}`}>
            {value}
          </p>
        </div>
        <Icon className={`h-5 w-5 ${value > 0 ? TONE[tone] : 'text-muted-foreground/40'}`} />
      </CardContent>
    </Card>
  );
}
