'use client';

import { Card } from '@/components/ui/card';

export function StatCard({ icon: Icon, label, value, tone = 'default' }: {
  icon: any; label: string; value: string; tone?: 'default' | 'warn';
}) {
  return (
    <Card className="p-4 flex items-center gap-3 border-border">
      <div className={`rounded-lg p-2 ${tone === 'warn' ? 'bg-amber-500/10 text-amber-500' : 'bg-primary/10 text-primary'}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold tabular-nums leading-tight text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
      </div>
    </Card>
  );
}
