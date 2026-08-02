'use client';

/**
 * GlobalSearchBar — the desktop search field, inline in the header.
 *
 * Focusing it widens the field in place and drops the results underneath it;
 * there is no modal. Below `md` the header has no room for this, so
 * <GlobalSearch /> keeps serving mobile as a dialog.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { SearchResultList } from '@/components/SearchResultList';
import { useGlobalSearchResults, DESKTOP_MEDIA_QUERY, type ResultItem } from '@/hooks/use-global-search';
import { cn } from '@/lib/utils';

export function GlobalSearchBar() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useGlobalSearchResults(query);
  const open = expanded && query.trim() !== '';

  // Cmd+K / Ctrl+K focuses the field instead of opening anything. This bar
  // stays mounted below `md` (the header is only visually hidden), so the
  // media query is what keeps it from competing with the mobile dialog.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        if (!window.matchMedia(DESKTOP_MEDIA_QUERY).matches) return;
        e.preventDefault();
        setExpanded(true);
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const collapse = () => {
    setExpanded(false);
    setQuery('');
    setSelected(0);
  };

  const navigate = (item: ResultItem) => {
    collapse();
    inputRef.current?.blur();
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
      // First Escape clears what was typed, second one gives the field back.
      if (query !== '') {
        setQuery('');
        setSelected(0);
      } else {
        collapse();
        inputRef.current?.blur();
      }
    }
  };

  return (
    // Fully controlled: `open` is derived, and dismissal is handled by the
    // input's own blur/Escape. Letting Radix drive onOpenChange would collapse
    // the field every time the dropdown closed — including when Escape merely
    // cleared the query.
    <Popover open={open}>
      <PopoverAnchor asChild>
        <div
          onClick={() => inputRef.current?.focus()}
          className={cn(
            'relative flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/60 px-2.5 py-1.5',
            'transition-[width,background-color] duration-200 ease-out',
            expanded ? 'w-[420px] bg-muted' : 'w-[180px] cursor-pointer hover:bg-muted',
          )}
        >
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            onFocus={() => setExpanded(true)}
            onBlur={() => collapse()}
            onKeyDown={handleKeyDown}
            placeholder={expanded ? 'Buscar OTs, empleados, equipos…' : 'Buscar'}
            aria-label="Buscar OTs, empleados y equipos"
            className={cn(
              // ring-offset-0 as well as ring-0: the base Input keeps a 2px
              // offset band on focus, which shows up as a ghost outline with
              // its own corner radius inside the pill.
              'h-auto border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
              'placeholder:text-muted-foreground',
              !expanded && 'cursor-pointer',
            )}
          />
          {!expanded && (
            <kbd className="shrink-0 rounded border bg-background/60 px-1 py-0.5 text-[10px] text-muted-foreground">
              Ctrl+K
            </kbd>
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
        // Keep the caret in the input so typing carries on while results show.
        onOpenAutoFocus={e => e.preventDefault()}
        onCloseAutoFocus={e => e.preventDefault()}
        // Escape belongs to the input's two-stage handler, not to Radix.
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <SearchResultList
          results={results}
          selected={selected}
          query={query}
          onSelect={navigate}
          onHover={setSelected}
        />
        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          <span><kbd className="rounded border bg-muted px-1 py-0.5">↑↓</kbd> navegar</span>
          <span><kbd className="rounded border bg-muted px-1 py-0.5">↵</kbd> abrir</span>
          <span><kbd className="rounded border bg-muted px-1 py-0.5">Esc</kbd> cerrar</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
