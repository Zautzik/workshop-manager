'use client';

/**
 * GlobalSearch — Cmd+K / Ctrl+K palette
 * Searches OTs, workers, and machines in real time.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, FileText, Users, Wrench } from 'lucide-react';
import { useOTs } from '@/hooks/use-operations-queries';
import { useWorkers } from '@/hooks/use-operations-queries';
import { useMachines } from '@/hooks/use-operations-queries';
import { cn } from '@/lib/utils';

type ResultItem = {
  id: string;
  label: string;
  sublabel?: string;
  type: 'ot' | 'worker' | 'machine';
  href: string;
};

const TYPE_META = {
  ot:      { label: 'OT',        icon: FileText, color: 'text-blue-500'   },
  worker:  { label: 'Empleado',  icon: Users,    color: 'text-amber-500'  },
  machine: { label: 'Equipo',    icon: Wrench,   color: 'text-orange-500' },
};

function normalize(s: string) {
  return s?.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '') ?? '';
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: otsRaw  = [] } = useOTs();
  const { data: workers = [] } = useWorkers();
  const { data: machines = [] } = useMachines();

  // Open on Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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

  const results: ResultItem[] = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];

    const items: ResultItem[] = [];

    // OTs
    (otsRaw as any[]).forEach(ot => {
      if (
        normalize(ot.ot_number ?? '').includes(q) ||
        normalize(ot.client_name ?? '').includes(q) ||
        normalize(ot.status ?? '').includes(q)
      ) {
        items.push({
          id: `ot-${ot.id}`,
          label: ot.ot_number ?? ot.id,
          sublabel: ot.client_name,
          type: 'ot',
          href: `/workflow?ot=${ot.id}`,
        });
      }
    });

    // Workers
    (workers as any[]).forEach(w => {
      if (normalize(w.full_name ?? w.name ?? '').includes(q)) {
        items.push({
          id: `worker-${w.id}`,
          label: w.full_name ?? w.name,
          sublabel: w.department,
          type: 'worker',
          href: `/hr/empleados`,
        });
      }
    });

    // Machines
    (machines as any[]).forEach(m => {
      if (normalize(m.name ?? '').includes(q) || normalize(m.brand ?? '').includes(q)) {
        items.push({
          id: `machine-${m.id}`,
          label: m.name,
          sublabel: m.brand,
          type: 'machine',
          href: `/maintenance/maquinas`,
        });
      }
    });

    return items.slice(0, 8);
  }, [query, otsRaw, workers, machines]);

  // Keyboard navigation
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
      setOpen(false);
    }
  };

  const navigate = (item: ResultItem) => {
    setOpen(false);
    router.push(item.href);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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

        <div className="max-h-72 overflow-y-auto">
          {query.trim() === '' && (
            <p className="text-xs text-muted-foreground text-center py-8">Empieza a escribir para buscar</p>
          )}
          {query.trim() !== '' && results.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">Sin resultados para &quot;{query}&quot;</p>
          )}
          {results.map((item, idx) => {
            const meta = TYPE_META[item.type];
            const Icon = meta.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item)}
                onMouseEnter={() => setSelected(idx)}
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

        <div className="border-t border-border px-3 py-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span><kbd className="bg-muted px-1 py-0.5 rounded border">↑↓</kbd> navegar</span>
          <span><kbd className="bg-muted px-1 py-0.5 rounded border">↵</kbd> abrir</span>
          <span><kbd className="bg-muted px-1 py-0.5 rounded border">Ctrl+K</kbd> paleta</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
