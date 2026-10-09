'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Search } from 'lucide-react';

export function KanbanToolbar({
  searchTerm,
  setSearchTerm,
  showCompleted,
  setShowCompleted,
  onCreateNew,
}: {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  showCompleted: boolean;
  setShowCompleted: (updater: (prev: boolean) => boolean) => void;
  onCreateNew: () => void;
}) {
  return (
    <div className="flex items-center justify-start sm:justify-end gap-2 flex-wrap">
      <div className="relative w-full sm:w-auto">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar OT o cliente..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-input border-border placeholder:text-muted-foreground w-full sm:w-56 pl-9 text-base"
        />
      </div>
      <Button
        variant={showCompleted ? 'default' : 'outline'}
        onClick={() => setShowCompleted(prev => !prev)}
        className="text-sm sm:text-base"
      >
        {showCompleted ? 'Ocultar completadas' : 'Mostrar completadas'}
      </Button>
      <Button onClick={onCreateNew} className="bg-primary hover:bg-primary/90 text-sm sm:text-base">
        <Plus className="w-4 h-4 mr-1" />Nueva OT
      </Button>
    </div>
  );
}
