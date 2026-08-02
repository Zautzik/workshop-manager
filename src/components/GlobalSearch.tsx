'use client';

/**
 * GlobalSearch — the mobile search surface.
 *
 * The mobile header has no room for an inline field next to the menu button,
 * the logo and the action icons, so below `md` search stays a dialog. Desktop
 * uses <GlobalSearchBar /> in the header instead.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { SearchResultList } from '@/components/SearchResultList';
import { useGlobalSearchResults, DESKTOP_MEDIA_QUERY, type ResultItem } from '@/hooks/use-global-search';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GlobalSearch({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useGlobalSearchResults(query);

  // Cmd+K / Ctrl+K, but only while the mobile header is the visible one —
  // above `md` the inline bar claims the shortcut instead.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        if (window.matchMedia(DESKTOP_MEDIA_QUERY).matches) return;
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpenChange]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      // requestAnimationFrame fires after the dialog finishes its enter
      // animation — no artificial delay, zero perceptible lag.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const navigate = (item: ResultItem) => {
    onOpenChange(false);
    router.push(item.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[selected]) {
      navigate(results[selected]);
    } else if (e.key === 'Escape') {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-md overflow-hidden">
        {/* Screen-reader-only title — Radix Dialog requires one for a11y */}
        <DialogTitle className="sr-only">Búsqueda global</DialogTitle>
        <DialogDescription className="sr-only">Busca OTs, empleados y equipos</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar OTs, empleados, equipos…"
            className="border-0 shadow-none focus-visible:ring-0 text-sm p-0 h-auto"
          />
          <kbd className="hidden sm:block text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border shrink-0">Esc</kbd>
        </div>

        <SearchResultList
          results={results}
          selected={selected}
          query={query}
          onSelect={navigate}
          onHover={setSelected}
        />

        <div className="border-t border-border px-3 py-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span><kbd className="bg-muted px-1 py-0.5 rounded border">↑↓</kbd> navegar</span>
          <span><kbd className="bg-muted px-1 py-0.5 rounded border">↵</kbd> abrir</span>
          <span><kbd className="bg-muted px-1 py-0.5 rounded border">Esc</kbd> cerrar</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
