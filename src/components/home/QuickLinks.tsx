'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Sliders, Check, Activity } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="Personalizar inicio">
          <Sliders className="h-3.5 w-3.5" />
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

  // Compact pill: pinned shortcuts as small icon chips + the Personalizar gear.
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card/70 p-1 shadow-sm backdrop-blur">
        {links.map((leaf) => {
          const Icon = leaf.icon;
          return (
            <Tooltip key={leaf.href}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => router.push(leaf.href)}
                  aria-label={leaf.label}
                  className={cn('flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110', leaf.color)}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {leaf.label} <span className="opacity-60">· {leaf.moduleLabel}</span>
              </TooltipContent>
            </Tooltip>
          );
        })}
        <EditDialog available={available} isPinned={isPinned} toggle={toggle} />
      </div>
    </TooltipProvider>
  );
}
