'use client';

import { useState } from 'react';
import { DieLine } from './DieLine';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Sparkles } from 'lucide-react';
import { RepetirOTAnterior } from './RepetirOTAnterior';
import type { UnifiedOTForm } from '@/types/ot-unified';
import {
  WORK_CATEGORIES,
  type WorkCategoryKey,
  type WorkCategoryOption,
} from '@/types/work-category';

interface Props {
  selected: WorkCategoryKey | null;
  onSelect: (cat: WorkCategoryKey) => void;
  /** Cargar las especificaciones de un trabajo anterior. */
  onRepeat?: (patch: Partial<UnifiedOTForm>, otNumber: string) => void;
}

export function UnifiedStepCategory({ selected, onSelect, onRepeat }: Props) {
  const [hovering, setHovering] = useState<WorkCategoryKey | null>(null);
  const [chosen, setChosen] = useState<WorkCategoryKey | null>(selected);

  const activeCategory = WORK_CATEGORIES.find(
    (c) => c.key === (hovering ?? chosen)
  );

  return (
    <div className="space-y-6">
      {/* Lo primero que hace un impresor no es elegir tipo de trabajo: es
          preguntarse si esto ya lo hicimos antes. */}
      {onRepeat && <RepetirOTAnterior onApply={onRepeat} />}
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">
            Tipo de Trabajo
          </h2>
        </div>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Seleccione la categoría para pre-cargar valores y costos por defecto.
          Puede modificar todo en los pasos siguientes.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {WORK_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setChosen(cat.key)}
            onMouseEnter={() => setHovering(cat.key)}
            onMouseLeave={() => setHovering(null)}
            className={`
              relative group rounded-xl border-2 p-4 text-left transition-all duration-200
              hover:shadow-md hover:scale-[1.02] cursor-pointer
              text-foreground/45 hover:text-foreground/70
              ${
                chosen === cat.key
                  ? 'ring-2 ring-offset-2 shadow-md'
                  : 'border-muted hover:border-current'
              }
            `}
            style={{ borderColor: chosen === cat.key ? cat.color : undefined }}
          >
            {chosen === cat.key && (
              <div
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shadow"
                style={{ backgroundColor: cat.color }}
              >
                ✓
              </div>
            )}
            {/* El troquel, no un emoji: un impresor reconoce el producto por su
                línea de corte y su hendido antes de leer el título. */}
            <DieLine
              kind={cat.key}
              className="mb-2 h-12 w-12 transition-colors"
              style={{ color: chosen === cat.key || hovering === cat.key ? cat.color : undefined }}
            />
            <div className="font-semibold text-sm leading-tight">{cat.label}</div>
            <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
              {cat.description}
            </div>
          </button>
        ))}
      </div>

      {/* Preview */}
      {activeCategory && (
        <Card
          className="border-2 transition-colors"
          style={{ borderColor: activeCategory.color + '40' }}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <span className="text-3xl">{activeCategory.icon}</span>
              <div className="flex-1 space-y-1">
                <h3 className="font-bold text-lg">{activeCategory.label}</h3>
                <p className="text-sm text-muted-foreground">
                  {activeCategory.description}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  <Badge variant="outline" className="text-[10px]">
                    Formulario pre-cargado
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    Costos por defecto
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    Procesos típicos
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm */}
      <div className="flex justify-center">
        <Button
          size="lg"
          disabled={!chosen}
          onClick={() => chosen && onSelect(chosen)}
          className="min-w-[240px]"
        >
          Continuar con&nbsp;
          {chosen
            ? WORK_CATEGORIES.find((c) => c.key === chosen)?.label
            : '…'}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
