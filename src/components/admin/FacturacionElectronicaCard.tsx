'use client';

/**
 * Facturación electrónica (Nubox): qué tan lista está, en una tarjeta.
 *
 * Dos mitades, porque se arreglan en lugares distintos y por personas
 * distintas: la conexión (credenciales de Nubox en Vercel, las pone quien
 * administra el despliegue) y los datos (giro, región y comuna de cada
 * cliente, los completa quien vende). La segunda se puede ir haciendo hoy.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, CircleDashed, FileText, PlugZap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Status {
  config: { provider: 'nubox' | null; enabled: boolean; missing: string[]; environment: 'certificacion' | 'produccion' | null };
  schemaReady: boolean;
  clients: { total: number; ready: number; incompletos: { id: string; name: string; missing: string[] }[] } | null;
}

export function FacturacionElectronicaCard() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useQuery<Status>({
    queryKey: ['dte-status'],
    queryFn: async () => {
      const res = await fetch('/api/dte/status', { credentials: 'include' });
      if (!res.ok) throw new Error(res.status === 403 ? 'Sólo administración y gerencia' : `Error ${res.status}`);
      return res.json();
    },
  });

  if (isLoading) return <Card className="h-28 animate-pulse bg-muted/40" />;
  if (error || !data) {
    return <Card className="p-4 text-sm text-muted-foreground">Facturación electrónica: {error instanceof Error ? error.message : 'sin respuesta'}</Card>;
  }

  const { config, clients, schemaReady } = data;
  const connected = config.enabled && config.missing.length === 0;
  const pct = clients && clients.total > 0 ? Math.round((clients.ready / clients.total) * 100) : 0;

  const conn = connected
    ? { label: `Conectada · ${config.environment === 'produccion' ? 'producción' : 'certificación'}`, tone: 'text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 }
    : config.enabled
      ? { label: `Faltan credenciales: ${config.missing.join(', ')}`, tone: 'text-amber-600 dark:text-amber-400', Icon: CircleDashed }
      : { label: 'No conectada — las facturas se registran sólo en la app', tone: 'text-muted-foreground', Icon: CircleDashed };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Facturación electrónica · Nubox</h3>
          <p className={cn('mt-0.5 flex items-center gap-1.5 text-xs', conn.tone)}>
            <conn.Icon className="h-3.5 w-3.5" /> {conn.label}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
          <PlugZap className="h-3 w-3" /> Integración futura
        </span>
      </div>

      <div className="mt-3 border-t pt-3">
        {!schemaReady ? (
          <p className="text-xs text-muted-foreground">
            La base todavía no tiene los campos del DTE (migración 20261125120000). Cuando se aplique, acá se ve qué clientes faltan.
          </p>
        ) : clients && (
          <>
            <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 text-left">
              <span className="text-xs">
                <span className="font-semibold tabular-nums">{clients.ready} de {clients.total}</span> clientes listos para facturar al SII
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span className={cn('block h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${pct}%` }} />
              </span>
              {clients.incompletos.length > 0 && (
                <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} />
              )}
            </button>
            {open && clients.incompletos.length > 0 && (
              <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
                {clients.incompletos.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50">
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="shrink-0 text-amber-600 dark:text-amber-400">falta {c.missing.join(', ')}</span>
                  </li>
                ))}
              </ul>
            )}
            {clients.incompletos.length > 0 && (
              <Link href="/comercial/clientes" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
                Completar en Clientes
              </Link>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
