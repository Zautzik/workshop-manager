'use client';

/**
 * GlobalSearch — the search control that lives in the app top bar.
 *
 * Collapsed it is a plain 36×36 icon button, the same shape as every other
 * header control. Clicking it (or Cmd/Ctrl+K) expands the button in place into
 * a text field and drops the results below it as a menu, so the page stays
 * visible and usable while searching — a dialog blocked the whole viewport to
 * show at most eight rows.
 *
 * The field is always mounted and collapses to zero width, which is what lets
 * the open/close animate; it leaves the tab order while collapsed so a
 * keyboard user never lands on an invisible input.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HEADER_ICON, HEADER_ICON_BUTTON } from '@/components/shell/header-controls';
import { SearchResultList } from '@/components/SearchResultList';
import { useGlobalSearchResults, type ResultItem } from '@/hooks/use-global-search';

/**
 * @param onOpenChange Notified whenever the field opens or closes. The shell
 *   uses it to clear the top bar of everything else while searching on mobile,
 *   where a usable field needs the full width of the row.
 */
export function GlobalSearch({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useGlobalSearchResults(query);

  useEffect(() => setMounted(true), []);

  // Resolved after mount — `navigator` has no server value, and the hint would
  // otherwise differ between the server and client renders.
  const shortcutHint = !mounted
    ? ''
    : /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
      ? '⌘K'
      : 'Ctrl+K';

  // Every open/close goes through here so the shell is never left showing the
  // mobile search layout with the field already closed. Memoised because the
  // shortcut listener below closes over it — an identity that changed each
  // render would leave the listener calling a stale `onOpenChange`.
  const changeOpen = useCallback((next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  const openSearch = useCallback(() => {
    setQuery('');
    setSelected(0);
    changeOpen(true);
  }, [changeOpen]);

  // Cmd+K / Ctrl+K at every breakpoint.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openSearch]);

  // Focus once the field has been laid out: requestAnimationFrame fires after
  // the width transition has started, by which point it is wide enough to hold
  // the caret.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const close = () => {
    changeOpen(false);
    inputRef.current?.blur();
  };

  const navigate = (item: ResultItem) => {
    close();
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
      close();
    }
  };

  // Collapse when focus leaves the control entirely. Result rows cancel their
  // own mousedown (see SearchResultList), so clicking one never blurs the input
  // and the row's click still lands.
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) changeOpen(false);
  };

  const trigger = (
    <button
      type="button"
      // Open on click while collapsed; while open the icon is just the field's
      // affordance, so it hands focus back to the input.
      onClick={() => (open ? inputRef.current?.focus() : openSearch())}
      aria-label="Buscar"
      aria-expanded={open}
      className={cn(
        HEADER_ICON_BUTTON,
        open && 'hover:bg-transparent hover:text-muted-foreground'
      )}
    >
      <Search className={HEADER_ICON} />
    </button>
  );

  return (
    <div className={cn('relative', open && 'w-full md:w-auto')} onBlur={handleBlur}>
      {/* No border of its own: this sits inside the header cluster, which
          already draws one. A second outline 1px inside the first diverges at
          the corners (12px radius against 8px) and reads as a heavy doubled
          edge at the ends with nothing along the straight runs. The fill alone
          is what marks the field, same as the hover fill on its neighbours.

          Open, it takes the whole row on mobile — the shell hides the rest of
          the bar at that width — and a fixed 20rem from md up, where it has to
          share the row with its neighbours. */}
      <div
        className={cn(
          'flex h-9 items-center rounded-lg transition-[width] duration-200 ease-out motion-reduce:transition-none',
          open ? 'w-full bg-muted md:w-[min(20rem,calc(100vw-9rem))]' : 'w-9'
        )}
      >
        {/* The tooltip only makes sense over the collapsed icon — once the field
            is open the placeholder says the same thing, and a hint floating
            under a field being typed into is just noise. */}
        {open ? trigger : (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="bottom">
              Buscar
              {shortcutHint && <span className="ml-1.5 text-muted-foreground">{shortcutHint}</span>}
            </TooltipContent>
          </Tooltip>
        )}

        <Input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(0); }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar OTs, empleados, equipos…"
          // Clients and inventory are also searched for roles that can see
          // them (see use-global-search.ts) but the placeholder stays as-is:
          // it's already truncated on mobile, and the three domains everyone
          // gets are what the field advertises.
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
          className={cn(
            // `ring-offset-0` as well as `ring-0`: zeroing the ring width alone
            // leaves the base Input's `focus-visible:ring-offset-2` painting a
            // 2px band of the offset colour, which shows as a pale seam either
            // side of the text against the field's fill.
            'h-9 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none transition-opacity duration-150 focus-visible:ring-0 focus-visible:ring-offset-0 motion-reduce:transition-none',
            // Padding only while open: horizontal padding survives `min-w-0`, so
            // a collapsed input would keep claiming those pixels and push the
            // field past the 36px the icon-only state is supposed to occupy.
            open ? 'px-2' : 'pointer-events-none opacity-0'
          )}
        />

        {/* Clear. Only earns its space once there is something to clear.
            Cancelling the mousedown keeps focus in the input, so clearing never
            collapses the field on its way to emptying it. */}
        {open && query !== '' && (
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setQuery(''); setSelected(0); inputRef.current?.focus(); }}
            aria-label="Limpiar búsqueda"
            className="mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Results drop below the field instead of over the page. `inset-x-0`
          pins the panel to both of the field's edges rather than giving it a
          width of its own — a wider panel overhangs the field on the left and
          stops short of the cluster's border on the right, which reads as two
          misaligned surfaces. It only appears once there is something to say —
          an empty panel prompting you to type sits over the page for no reason
          while the field itself already says what it is for. */}
      {open && query.trim() !== '' && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          <SearchResultList
            results={results}
            selected={selected}
            query={query}
            onSelect={navigate}
            onHover={setSelected}
          />
        </div>
      )}
    </div>
  );
}
