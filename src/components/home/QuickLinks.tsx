'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Sliders, Plus, Check, Star, Activity } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useQuickLinks } from '@/hooks/use-quick-links';
import { useHomePrefs } from '@/hooks/use-home-prefs';
import type { FlatNavLeaf } from '@/lib/navigation';

function EditDialog({
  available, isPinned, toggle,
}: {
  available: FlatNavLeaf[];
  isPinned: (href: string) => boolean;
  toggle: (href: string) => void;
}) {
  // Group the catalogue by module for a scannable picker.
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: FlatNavLeaf[] }>();
    for (const leaf of available) {
      const g = map.get(leaf.moduleKey) ?? { label: leaf.moduleLabel, items: [] };
      g.items.push(leaf);
      map.set(leaf.moduleKey, g);
    }
    return Array.from(map.values());
  }, [available]);

  const { prefs, setShowVitals } = useHomePrefs();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Sliders className="h-3.5 w-3.5" />
          Personalizar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Personalizar inicio</DialogTitle>
          <DialogDescription>
            Activa los signos vitales y marca las secciones que quieres tener a mano.
          </DialogDescription>
        </DialogHeader>

        {/* Vital strip toggle (off by default — opt-in for power users) */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Signos vitales</p>
              <p className="text-xs text-muted-foreground">Mostrar la barra de indicadores en el inicio</p>
            </div>
          </div>
          <Switch checked={prefs.showVitals} onCheckedChange={setShowVitals} />
        </div>

        <ScrollArea className="max-h-[55vh] pr-3 -mr-3">
          <div className="space-y-5">
            {grouped.map((group) => (
              <div key={group.label}>
                <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((leaf) => {
                    const Icon = leaf.icon;
                    const pinned = isPinned(leaf.href);
                    return (
                      <button
                        key={leaf.href}
                        onClick={() => toggle(leaf.href)}
                        className={cn(
                          'w-full flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors',
                          pinned ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-muted/60'
                        )}
                      >
                        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', leaf.color)}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{leaf.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{leaf.description}</p>
                        </div>
                        <span className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                          pinned ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
                        )}>
                          {pinned && <Check className="h-3 w-3" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default function QuickLinks() {
  const router = useRouter();
  const { loaded, links, available, isPinned, toggle } = useQuickLinks();

  if (!loaded) return null;

  return (
    <div className="w-full max-w-3xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Star className="h-4 w-4" />
          Tus accesos directos
        </h2>
        <EditDialog available={available} isPinned={isPinned} toggle={toggle} />
      </div>

      {links.length === 0 ? (
        <Dialog>
          <DialogTrigger asChild>
            <button className="w-full rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
              <Plus className="mx-auto mb-1 h-5 w-5" />
              Agrega tus secciones favoritas
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Personalizar accesos directos</DialogTitle>
              <DialogDescription>Marca las secciones que quieres tener a mano.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] pr-3 -mr-3">
              <div className="space-y-1">
                {available.map((leaf) => {
                  const Icon = leaf.icon;
                  const pinned = isPinned(leaf.href);
                  return (
                    <button
                      key={leaf.href}
                      onClick={() => toggle(leaf.href)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors',
                        pinned ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-muted/60'
                      )}
                    >
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', leaf.color)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-sm font-medium">{leaf.label}</span>
                      <span className="text-xs text-muted-foreground">{leaf.moduleLabel}</span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      ) : (
        <div className="flex flex-wrap justify-center gap-3">
          {links.map((leaf) => {
            const Icon = leaf.icon;
            return (
              <button
                key={leaf.href}
                onClick={() => router.push(leaf.href)}
                className="group flex w-[140px] flex-col items-center gap-2 rounded-2xl border border-border bg-card/60 p-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-105', leaf.color)}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium leading-tight text-foreground line-clamp-2">{leaf.label}</span>
                <span className="text-[11px] text-muted-foreground">{leaf.moduleLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
