'use client';

/**
 * SearchResultList — the result rows rendered in the top bar's search dropdown.
 * Presentational: the parent owns query, selection and routing.
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TYPE_META, type ResultItem } from '@/hooks/use-global-search';

type Props = {
  results: ResultItem[];
  selected: number;
  query: string;
  onSelect: (item: ResultItem) => void;
  onHover: (index: number) => void;
  className?: string;
};

export function SearchResultList({ results, selected, query, onSelect, onHover, className }: Props) {
  return (
    <div
      // Keep the focus in the input: a blur would collapse the inline bar and
      // unmount this list before the click ever lands on a row.
      onMouseDown={e => e.preventDefault()}
      className={cn('max-h-72 overflow-y-auto', className)}
    >
      {results.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">Sin resultados para &quot;{query}&quot;</p>
      )}
      {results.map((item, idx) => {
        const meta = TYPE_META[item.type];
        const Icon = meta.icon;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            onMouseEnter={() => onHover(idx)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
              selected === idx ? 'bg-muted' : 'hover:bg-muted/50',
            )}
          >
            <Icon className={cn('h-4 w-4 shrink-0', meta.color)} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.label}</p>
              {item.sublabel && <p className="text-xs text-muted-foreground truncate">{item.sublabel}</p>}
            </div>
            <Badge variant="outline" className="text-[10px] shrink-0">{meta.label}</Badge>
          </button>
        );
      })}
    </div>
  );
}
