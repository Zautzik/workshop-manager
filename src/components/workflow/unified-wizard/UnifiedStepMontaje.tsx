'use client';

/**
 * UnifiedStepMontaje — Interactive montaje (imposition) editor.
 *
 * Features:
 * - Visual press-sheet canvas (70×100 cm default, customizable)
 * - Add product shapes: rectangle, rounded, circle, custom die-cut
 * - Drag to reposition, rotate, delete
 * - Real-time utilization & waste calculation
 * - Gripper (pinza) zone visualization
 * - Auto-layout for regular grid
 * - SVG path input for custom die-cut shapes
 */

import { useState, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Grid3X3, Puzzle, Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UnifiedOTForm, MontajeShape } from '@/types/ot-unified';
import { SHAPE_COLORS } from './montaje/constants';
import { PressSheetConfig } from './montaje/PressSheetConfig';
import { MontajeCanvas } from './montaje/MontajeCanvas';
import { ShapePropertiesPanel } from './montaje/ShapePropertiesPanel';
import { AddShapeDialog, type NewShapeState } from './montaje/AddShapeDialog';
import { DieCutDialog } from './montaje/DieCutDialog';

interface Props {
  form: UnifiedOTForm;
  updateForm: (patch: Partial<UnifiedOTForm>) => void;
}

export function UnifiedStepMontaje({ form, updateForm }: Props) {
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDieCutDialog, setShowDieCutDialog] = useState(false);

  // New shape form state
  const [newShape, setNewShape] = useState<NewShapeState>({
    label: '',
    width: form.width_cm > 0 ? form.width_cm * 10 : 100,
    height: form.height_cm > 0 ? form.height_cm * 10 : 150,
    shapeType: 'rectangle',
    borderRadius: 5,
    customPath: '',
    bleed: 3,
  });

  // Canvas dimensions in pixels
  const CANVAS_BASE_W = 420;
  const CANVAS_BASE_H = 600;
  const PRESS_W = form.press_sheet_width;  // mm
  const PRESS_H = form.press_sheet_height; // mm
  const PINZA_MM = form.montaje.pinza_cm * 10;

  // Scale: mm → px
  const scale = useMemo(
    () =>
      Math.min(CANVAS_BASE_W / PRESS_W, CANVAS_BASE_H / PRESS_H) * zoom,
    [PRESS_W, PRESS_H, zoom]
  );

  const canvasW = PRESS_W * scale;
  const canvasH = PRESS_H * scale;

  /* ── Shapes helpers ─────────────────────────────────────────── */
  const shapes = form.montaje_shapes;

  const setShapes = useCallback(
    (next: MontajeShape[]) => updateForm({ montaje_shapes: next }),
    [updateForm]
  );

  const addShape = () => {
    const id = crypto.randomUUID();
    const colorIdx = shapes.length % SHAPE_COLORS.length;
    const s: MontajeShape = {
      id,
      label: newShape.label || `P${shapes.length + 1}`,
      x: 10,
      y: PINZA_MM + 10,
      width: newShape.width,
      height: newShape.height,
      rotation: 0,
      shapeType: newShape.shapeType,
      customPath: newShape.customPath || undefined,
      borderRadius: newShape.borderRadius,
      bleed: newShape.bleed,
      color: SHAPE_COLORS[colorIdx],
    };
    setShapes([...shapes, s]);
    setShowAddDialog(false);
    setSelectedId(id);
  };

  const updateShape = (id: string, patch: Partial<MontajeShape>) => {
    setShapes(shapes.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeShape = (id: string) => {
    setShapes(shapes.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const rotateShape = (id: string) => {
    const shape = shapes.find((s) => s.id === id);
    if (!shape) return;
    const nextRot = (shape.rotation + 90) % 360;
    // Also swap width/height for the visual
    updateShape(id, {
      rotation: nextRot,
      width: shape.height,
      height: shape.width,
    });
  };

  /* ── Auto-grid layout ──────────────────────────────────────── */
  const autoLayout = () => {
    if (shapes.length === 0) return;
    const firstShape = shapes[0];
    const bleed = firstShape.bleed;
    const w = firstShape.width + bleed * 2;
    const h = firstShape.height + bleed * 2;

    const cols = Math.floor(PRESS_W / w);
    const rows = Math.floor((PRESS_H - PINZA_MM) / h);

    const newShapes: MontajeShape[] = [];
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const existing = shapes[idx] || { ...firstShape, id: crypto.randomUUID() };
        newShapes.push({
          ...existing,
          id: existing.id || crypto.randomUUID(),
          label: `${String.fromCharCode(65 + idx)}`,
          x: c * w + bleed,
          y: PINZA_MM + r * h + bleed,
          width: firstShape.width,
          height: firstShape.height,
          color: SHAPE_COLORS[idx % SHAPE_COLORS.length],
        });
        idx++;
      }
    }
    setShapes(newShapes);

    // Update montaje grid info
    updateForm({
      montaje: {
        ...form.montaje,
        montaje_grid: `${cols} x ${rows}`,
        montaje_paginas: cols * rows,
      },
    });
  };

  /* ── Die-cut dialog handlers ──────────────────────────────────── */
  const handleSelectPreset = (preset: { name: string; path: string; desc: string }) => {
    const id = crypto.randomUUID();
    const colorIdx = shapes.length % SHAPE_COLORS.length;
    setShapes([
      ...shapes,
      {
        id,
        label: preset.name.slice(0, 4),
        x: 20,
        y: PINZA_MM + 20,
        width: form.width_cm > 0 ? form.width_cm * 10 : 150,
        height: form.height_cm > 0 ? form.height_cm * 10 : 200,
        rotation: 0,
        shapeType: 'die_cut',
        customPath: preset.path,
        bleed: 3,
        color: SHAPE_COLORS[colorIdx],
      },
    ]);
    setShowDieCutDialog(false);
    setSelectedId(id);
  };

  const handleAddCustomShape = () => {
    const id = crypto.randomUUID();
    const colorIdx = shapes.length % SHAPE_COLORS.length;
    setShapes([
      ...shapes,
      {
        id,
        label: `T${shapes.length + 1}`,
        x: 20,
        y: PINZA_MM + 20,
        width: form.width_cm > 0 ? form.width_cm * 10 : 150,
        height: form.height_cm > 0 ? form.height_cm * 10 : 200,
        rotation: 0,
        shapeType: 'custom',
        customPath: newShape.customPath,
        bleed: 3,
        color: SHAPE_COLORS[colorIdx],
      },
    ]);
    setShowDieCutDialog(false);
    setSelectedId(id);
  };

  /* ── Utilization calculation ────────────────────────────────── */
  const utilization = useMemo(() => {
    if (shapes.length === 0) return { pct: 0, waste: 100, poses: 0 };
    const totalShapeArea = shapes.reduce((s, sh) => s + sh.width * sh.height, 0);
    const sheetArea = PRESS_W * PRESS_H;
    const pct = Number(((totalShapeArea / sheetArea) * 100).toFixed(1));
    return { pct: Math.min(pct, 100), waste: Number((100 - pct).toFixed(1)), poses: shapes.length };
  }, [shapes, PRESS_W, PRESS_H]);

  const selectedShape = shapes.find((s) => s.id === selectedId);

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
          <Puzzle className="h-6 w-6 text-primary" />
          Montaje Interactivo
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Arrastre las piezas sobre el pliego. Soporte para troqueles especiales y formas personalizadas.
        </p>
      </div>

      <PressSheetConfig form={form} updateForm={updateForm} zoom={zoom} setZoom={setZoom} />

      <div className="flex flex-col lg:flex-row gap-4">
        {/* ── Canvas ─────────────────────────────────────────── */}
        <div className="flex-1">
          <MontajeCanvas
            shapes={shapes}
            updateShape={updateShape}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            scale={scale}
            canvasW={canvasW}
            canvasH={canvasH}
            PRESS_W={PRESS_W}
            PRESS_H={PRESS_H}
            PINZA_MM={PINZA_MM}
            pinzaCm={form.montaje.pinza_cm}
          />
        </div>

        {/* ── Sidebar tools ──────────────────────────────────── */}
        <div className="w-full lg:w-72 space-y-4">
          {/* Action buttons */}
          <Card className="p-3 border-border space-y-2">
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                setNewShape({
                  label: '',
                  width: form.width_cm > 0 ? form.width_cm * 10 : 100,
                  height: form.height_cm > 0 ? form.height_cm * 10 : 150,
                  shapeType: 'rectangle',
                  borderRadius: 5,
                  customPath: '',
                  bleed: 3,
                });
                setShowAddDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Agregar Pieza
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => setShowDieCutDialog(true)}
            >
              <Scissors className="h-4 w-4 mr-1" />
              Troquel Especial
            </Button>

            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={autoLayout}
              disabled={shapes.length === 0}
            >
              <Grid3X3 className="h-4 w-4 mr-1" />
              Auto-distribuir
            </Button>
          </Card>

          {/* Stats */}
          <Card className="p-3 border-border space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">
              Estadísticas
            </h4>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Poses:</span>
                <span className="font-bold">{utilization.poses}</span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Utilización:</span>
                  <span
                    className={cn(
                      'font-bold',
                      utilization.pct >= 80
                        ? 'text-emerald-500'
                        : utilization.pct >= 60
                          ? 'text-amber-500'
                          : 'text-red-500'
                    )}
                  >
                    {utilization.pct}%
                  </span>
                </div>
                <div className="bg-muted rounded-full h-2">
                  <div
                    className={cn(
                      'h-2 rounded-full transition-all',
                      utilization.pct >= 80
                        ? 'bg-emerald-500'
                        : utilization.pct >= 60
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                    )}
                    style={{ width: `${Math.min(utilization.pct, 100)}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Desperdicio:</span>
                <span className="font-medium">{utilization.waste}%</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Montaje:</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {form.montaje.montaje_grid}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Selected shape properties */}
          {selectedShape && (
            <ShapePropertiesPanel
              selectedShape={selectedShape}
              updateShape={updateShape}
              rotateShape={rotateShape}
              removeShape={removeShape}
            />
          )}

          {/* Montaje text fields */}
          <Card className="p-3 border-border space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">
              Datos Montaje
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <Label className="text-[10px]">Páginas Total</Label>
                <Input
                  type="number"
                  value={form.montaje.paginas_total}
                  onChange={(e) =>
                    updateForm({
                      montaje: {
                        ...form.montaje,
                        paginas_total: Number(e.target.value),
                      },
                    })
                  }
                  className="h-7 text-xs font-mono bg-input border-border"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px]">Corte Hoja</Label>
                <Input
                  value={form.montaje.corte_hoja}
                  onChange={(e) =>
                    updateForm({
                      montaje: { ...form.montaje, corte_hoja: e.target.value },
                    })
                  }
                  className="h-7 text-xs bg-input border-border"
                />
              </div>
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px]">Forma Extensión</Label>
              <Input
                placeholder='Ej: 21.5 x 32'
                value={form.montaje.forma_extension}
                onChange={(e) =>
                  updateForm({
                    montaje: {
                      ...form.montaje,
                      forma_extension: e.target.value,
                    },
                  })
                }
                className="h-7 text-xs bg-input border-border"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px]">Pliego a Máquina</Label>
              <Input
                placeholder='Ej: 33 x 48'
                value={form.montaje.pliego_a_maquina}
                onChange={(e) =>
                  updateForm({
                    montaje: {
                      ...form.montaje,
                      pliego_a_maquina: e.target.value,
                    },
                  })
                }
                className="h-7 text-xs bg-input border-border"
              />
            </div>
          </Card>
        </div>
      </div>

      <AddShapeDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        newShape={newShape}
        setNewShape={setNewShape}
        shapesCount={shapes.length}
        onAdd={addShape}
      />

      <DieCutDialog
        open={showDieCutDialog}
        onOpenChange={setShowDieCutDialog}
        newShape={newShape}
        setNewShape={setNewShape}
        onSelectPreset={handleSelectPreset}
        onAddCustom={handleAddCustomShape}
      />
    </div>
  );
}
