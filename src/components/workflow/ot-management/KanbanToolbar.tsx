'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Hexagon, Columns3, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export function KanbanToolbar({
  searchTerm,
  setSearchTerm,
  showCompleted,
  setShowCompleted,
  view,
  onViewChange,
  onCreateNew,
}: {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  showCompleted: boolean;
  setShowCompleted: (updater: (prev: boolean) => boolean) => void;
  view: 'carriles' | 'general';
  onViewChange: (v: 'carriles' | 'general') => void;
  onCreateNew: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
      <div className="relative w-full sm:w-auto">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar OT o cliente..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full border-border bg-input pl-9 text-base placeholder:text-muted-foreground sm:w-56"
        />
      </div>

      {/* Carriles (default, audit M2) or the hex overview. */}
      <div role="group" aria-label="Vista del tablero" className="inline-flex rounded-md border p-0.5">
        {([
          ['carriles', 'Carriles', Columns3],
          ['general', 'Vista general', Hexagon],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => onViewChange(key)}
            aria-pressed={view === key}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded px-3 text-sm transition-colors',
              view === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* The board holds OTs in flight + those completed in the last 30 days
          (useBoardOTs); older ones are found with search in Expediente or
          Cotizaciones › Historial. Said on the button so it is not a surprise. */}
      <Button
        variant={showCompleted ? 'default' : 'outline'}
        onClick={() => setShowCompleted((prev) => !prev)}
        className="text-sm sm:text-base"
        title="Completadas en los últimos 30 días"
      >
        {showCompleted ? 'Ocultar completadas' : 'Completadas (30 días)'}
      </Button>
      <Button onClick={onCreateNew} className="bg-primary text-sm hover:bg-primary/90 sm:text-base">
        <Plus className="mr-1 h-4 w-4" />Nueva OT
      </Button>
    </div>
  );
}
