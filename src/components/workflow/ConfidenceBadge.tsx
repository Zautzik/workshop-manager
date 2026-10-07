'use client';

import { Badge } from '@/components/ui/badge';

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color =
    confidence >= 80 ? 'bg-green-500/20 text-green-400 border-green-500/40' :
    confidence >= 50 ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' :
    'bg-red-500/20 text-red-400 border-red-500/40';

  return (
    <Badge variant="outline" className={`${color} text-xs`}>
      {confidence}% confianza
    </Badge>
  );
}
