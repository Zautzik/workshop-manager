'use client';

/**
 * La fila rankeada que ya probó su forma en Rentabilidad (HoraPrensaPanel,
 * MermaPanel, ClientesPanel): un rango, una etiqueta, una barra con tope de
 * ancho (nunca 100% del card — a ese ancho una barra no muestra magnitud,
 * sólo estira el card) y un valor a la derecha. Se extrae acá porque el mismo
 * patrón se repite en Equipos (máquinas con más downtime, piezas más
 * críticas, máquinas más cargadas) — sólo el dato y el texto cambian, la fila
 * es idéntica.
 *
 * Deliberadamente sin Card/CardHeader ni estado vacío: cada panel sigue
 * dueño de su propio título, su explicación de por qué este orden y no el
 * obvio, y su estado vacío honesto — eso no se puede compartir sin perder lo
 * que hace bueno a cada panel.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface RankedListItem {
  id: string;
  label: string;
  sublabel?: string | null;
  /** 0-100, ya normalizado contra el máximo de la lista. */
  barPct: number;
  /** Color explícito de la barra (p. ej. para un estado crítico). Por defecto usa el color primario del tema. */
  barColor?: string;
  value: React.ReactNode;
  title?: string;
  onClick?: () => void;
}

function Row({ rank, item }: { rank: number; item: RankedListItem }) {
  const pct = Math.max(0, Math.min(100, item.barPct));
  const content = (
    <>
      <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground">{rank}</span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
        {item.label}
        {item.sublabel && <span className="ml-1.5 font-normal text-muted-foreground">{item.sublabel}</span>}
      </span>
      <span className="h-1.5 w-full max-w-[120px] shrink-0 overflow-hidden rounded-full bg-muted">
        <span
          className={cn('block h-full rounded-full transition-all', !item.barColor && 'bg-primary')}
          style={{ width: `${pct}%`, ...(item.barColor ? { background: item.barColor } : {}) }}
        />
      </span>
      <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-foreground">{item.value}</span>
    </>
  );

  if (item.onClick) {
    return (
      <li>
        <button
          type="button"
          onClick={item.onClick}
          title={item.title}
          className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60"
        >
          {content}
        </button>
      </li>
    );
  }
  return (
    <li title={item.title} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1">
      {content}
    </li>
  );
}

export function RankedList({
  items,
  visibleCount = 5,
  moreLabel,
  fewerLabel,
}: {
  items: RankedListItem[];
  visibleCount?: number;
  moreLabel?: (total: number) => string;
  fewerLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, visibleCount);
  const hasMore = items.length > visibleCount;

  return (
    <div className="space-y-2">
      <ol className="space-y-0.5">
        {shown.map((item, i) => (
          <Row key={item.id} rank={i + 1} item={item} />
        ))}
      </ol>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          {expanded
            ? (fewerLabel ?? `Mostrar sólo los primeros ${visibleCount}`)
            : (moreLabel?.(items.length) ?? `Ver todos (${items.length})`)}
        </button>
      )}
    </div>
  );
}
