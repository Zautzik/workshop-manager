'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import {
  WORK_CATEGORIES,
  type WorkCategoryKey,
  type WorkCategoryOption,
} from '@/types/work-category';

/* ================================================================ */
/*  Work Type Selector — Pre-form step before Production OT          */
/* ================================================================ */

interface WorkTypeSelectorProps {
  /** Callback when a category is confirmed */
  onSelect: (category: WorkCategoryKey) => void;
  /** Callback to go back */
  onCancel?: () => void;
}

export default function WorkTypeSelector({ onSelect, onCancel }: WorkTypeSelectorProps) {
  const [selected, setSelected] = useState<WorkCategoryKey | null>(null);
  const [hovering, setHovering] = useState<WorkCategoryKey | null>(null);

  const activeCategory = WORK_CATEGORIES.find((c) => c.key === (hovering ?? selected));

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold">Nueva Orden de Trabajo</h1>
        </div>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Seleccione el tipo de trabajo para pre-cargar el formulario con los valores
          predeterminados adecuados para cada categoría de producto.
        </p>
      </div>

      {/* Category Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {WORK_CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat.key}
            category={cat}
            isSelected={selected === cat.key}
            onSelect={() => setSelected(cat.key)}
            onHover={() => setHovering(cat.key)}
            onLeave={() => setHovering(null)}
          />
        ))}
      </div>

      {/* Preview panel */}
      {activeCategory && (
        <Card className="border-2 transition-colors" style={{ borderColor: activeCategory.color + '40' }}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <span className="text-3xl">{activeCategory.icon}</span>
              <div className="flex-1 space-y-1">
                <h3 className="font-bold text-lg">{activeCategory.label}</h3>
                <p className="text-sm text-muted-foreground">{activeCategory.description}</p>
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

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-2">
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
        ) : (
          <div />
        )}

        <Button
          size="lg"
          disabled={!selected}
          onClick={() => selected && onSelect(selected)}
          className="min-w-[200px]"
        >
          Continuar con&nbsp;
          {selected
            ? WORK_CATEGORIES.find((c) => c.key === selected)?.label
            : '...'}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Individual Category Card ───────────────────────────────── */

function CategoryCard({
  category,
  isSelected,
  onSelect,
  onHover,
  onLeave,
}: {
  category: WorkCategoryOption;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={`
        relative group rounded-xl border-2 p-4 text-left transition-all duration-200
        hover:shadow-md hover:scale-[1.02] cursor-pointer
        ${isSelected
          ? 'ring-2 ring-offset-2 shadow-md'
          : 'border-muted hover:border-current'
        }
      `}
      style={{
        borderColor: isSelected ? category.color : undefined,
      }}
    >
      {/* Selected check */}
      {isSelected && (
        <div
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shadow"
          style={{ backgroundColor: category.color }}
        >
          ✓
        </div>
      )}

      <div className="text-2xl mb-2">{category.icon}</div>
      <div className="font-semibold text-sm leading-tight">{category.label}</div>
      <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
        {category.description}
      </div>
    </button>
  );
}
