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

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Trash2,
  RotateCw,
  Grid3X3,
  Maximize2,
  Puzzle,
  Move,
  Scissors,
  Wand2,
  Lock,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UnifiedOTForm, MontajeShape } from '@/types/ot-unified';

interface Props {
  form: UnifiedOTForm;
  updateForm: (patch: Partial<UnifiedOTForm>) => void;
}

const SHAPE_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
];

const SHAPE_TYPES: { value: MontajeShape['shapeType']; label: string; icon: string }[] = [
  { value: 'rectangle', label: 'Rectángulo', icon: '▬' },
  { value: 'rounded', label: 'Redondeado', icon: '▢' },
  { value: 'circle', label: 'Círculo', icon: '●' },
  { value: 'die_cut', label: 'Troquel', icon: '✂' },
  { value: 'custom', label: 'Forma Libre', icon: '⬡' },
];

const CUT_PRESETS: { name: string; path: string; desc: string }[] = [
  {
    name: 'Caja Plegadiza',
    path: 'M 0 20 L 20 0 L 80 0 L 100 20 L 100 80 L 80 100 L 20 100 L 0 80 Z',
    desc: 'Troquel clásico para caja con solapas',
  },
  {
    name: 'Display Curvo',
    path: 'M 10 0 Q 0 0 0 10 L 0 90 Q 0 100 10 100 L 90 100 Q 100 100 100 90 L 100 10 Q 100 0 90 0 Z',
    desc: 'Bordes redondeados para display',
  },
  {
    name: 'Etiqueta Ovalada',
    path: 'M 50 0 C 80 0 100 20 100 50 C 100 80 80 100 50 100 C 20 100 0 80 0 50 C 0 20 20 0 50 0 Z',
    desc: 'Forma ovalada para etiquetas',
  },
  {
    name: 'Bolsa con Asa',
    path: 'M 0 15 L 0 100 L 100 100 L 100 15 L 85 15 L 85 0 L 65 0 L 65 15 L 35 15 L 35 0 L 15 0 L 15 15 Z',
    desc: 'Troquel de bolsa con huecos de asa',
  },
  {
    name: 'Hexagonal',
    path: 'M 50 0 L 93 25 L 93 75 L 50 100 L 7 75 L 7 25 Z',
    desc: 'Forma hexagonal',
  },
];

export function UnifiedStepMontaje({ form, updateForm }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDieCutDialog, setShowDieCutDialog] = useState(false);

  // New shape form state
  const [newShape, setNewShape] = useState({
    label: '',
    width: form.width_cm > 0 ? form.width_cm * 10 : 100,
    height: form.height_cm > 0 ? form.height_cm * 10 : 150,
    shapeType: 'rectangle' as MontajeShape['shapeType'],
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

  /* ── Drag handling ──────────────────────────────────────────── */
  const handleMouseDown = (e: React.MouseEvent, shapeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const shape = shapes.find((s) => s.id === shapeId);
    if (!shape) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDraggingId(shapeId);
    setSelectedId(shapeId);
    setDragOffset({
      x: e.clientX - rect.left - shape.x * scale,
      y: e.clientY - rect.top - shape.y * scale,
    });
  };

  useEffect(() => {
    if (!draggingId) return;

    const handleMove = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const newX = (e.clientX - rect.left - dragOffset.x) / scale;
      const newY = (e.clientY - rect.top - dragOffset.y) / scale;
      updateShape(draggingId, {
        x: Math.max(0, Math.min(PRESS_W - 10, newX)),
        y: Math.max(0, Math.min(PRESS_H - 10, newY)),
      });
    };

    const handleUp = () => setDraggingId(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, dragOffset, scale, PRESS_W, PRESS_H]);

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

      {/* ── Press sheet config ─────────────────────────────────── */}
      <Card className="p-3 border-border">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Pliego:</Label>
            <Input
              type="number"
              value={form.press_sheet_width}
              onChange={(e) => updateForm({ press_sheet_width: Number(e.target.value) })}
              className="bg-input border-border h-8 w-20 text-xs font-mono"
            />
            <span className="text-xs text-muted-foreground">×</span>
            <Input
              type="number"
              value={form.press_sheet_height}
              onChange={(e) => updateForm({ press_sheet_height: Number(e.target.value) })}
              className="bg-input border-border h-8 w-20 text-xs font-mono"
            />
            <span className="text-xs text-muted-foreground">mm</span>
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Pinza:</Label>
            <Input
              type="number"
              step={0.1}
              value={form.montaje.pinza_cm}
              onChange={(e) =>
                updateForm({
                  montaje: { ...form.montaje, pinza_cm: Number(e.target.value) },
                })
              }
              className="bg-input border-border h-8 w-16 text-xs font-mono"
            />
            <span className="text-xs text-muted-foreground">cm</span>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>
              <ZoomOut className="h-3 w-3" />
            </Button>
            <span className="text-xs text-muted-foreground w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
              <ZoomIn className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* ── Canvas ─────────────────────────────────────────── */}
        <div className="flex-1">
          <div className="overflow-auto rounded-xl border-2 border-border bg-muted/10 p-2">
            <div
              ref={canvasRef}
              className="relative mx-auto bg-white rounded-lg shadow-inner select-none"
              style={{
                width: canvasW,
                height: canvasH,
                cursor: draggingId ? 'grabbing' : 'default',
              }}
              onClick={() => setSelectedId(null)}
            >
              {/* Pinza zone */}
              <div
                className="absolute left-0 right-0 top-0 bg-red-500/10 border-b-2 border-dashed border-red-400 flex items-center justify-center"
                style={{ height: PINZA_MM * scale }}
              >
                <span className="text-[9px] text-red-500 font-bold uppercase tracking-wider">
                  Pinza ({form.montaje.pinza_cm} cm)
                </span>
              </div>

              {/* Grid guides (every 50mm) */}
              {Array.from({ length: Math.floor(PRESS_W / 50) }).map((_, i) => (
                <div
                  key={`vg-${i}`}
                  className="absolute top-0 bottom-0 border-l border-dashed border-gray-200"
                  style={{ left: (i + 1) * 50 * scale }}
                />
              ))}
              {Array.from({ length: Math.floor(PRESS_H / 50) }).map((_, i) => (
                <div
                  key={`hg-${i}`}
                  className="absolute left-0 right-0 border-t border-dashed border-gray-200"
                  style={{ top: (i + 1) * 50 * scale }}
                />
              ))}

              {/* Shapes */}
              {shapes.map((shape) => {
                const isSelected = shape.id === selectedId;
                const sw = shape.width * scale;
                const sh = shape.height * scale;
                const sx = shape.x * scale;
                const sy = shape.y * scale;
                const bleedPx = shape.bleed * scale;

                return (
                  <div
                    key={shape.id}
                    className={cn(
                      'absolute group cursor-grab active:cursor-grabbing transition-shadow',
                      isSelected && 'z-10'
                    )}
                    style={{
                      left: sx - bleedPx,
                      top: sy - bleedPx,
                      width: sw + bleedPx * 2,
                      height: sh + bleedPx * 2,
                    }}
                    onMouseDown={(e) => handleMouseDown(e, shape.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(shape.id);
                    }}
                  >
                    {/* Bleed zone */}
                    <div
                      className="absolute inset-0 opacity-20"
                      style={{
                        backgroundColor: shape.color,
                        borderRadius:
                          shape.shapeType === 'circle'
                            ? '50%'
                            : shape.shapeType === 'rounded'
                              ? (shape.borderRadius || 5) * scale
                              : 2,
                      }}
                    />

                    {/* Shape itself */}
                    <div
                      className={cn(
                        'absolute border-2 flex items-center justify-center',
                        isSelected ? 'shadow-lg ring-2 ring-blue-500' : 'shadow-sm'
                      )}
                      style={{
                        left: bleedPx,
                        top: bleedPx,
                        width: sw,
                        height: sh,
                        borderColor: shape.color,
                        backgroundColor: shape.color + '25',
                        borderRadius:
                          shape.shapeType === 'circle'
                            ? '50%'
                            : shape.shapeType === 'rounded'
                              ? (shape.borderRadius || 5) * scale
                              : 2,
                      }}
                    >
                      {/* SVG overlay for die-cut / custom shapes */}
                      {(shape.shapeType === 'die_cut' || shape.shapeType === 'custom') &&
                        shape.customPath && (
                          <svg
                            viewBox="0 0 100 100"
                            className="absolute inset-0 w-full h-full"
                            style={{ pointerEvents: 'none' }}
                          >
                            <path
                              d={shape.customPath}
                              fill="none"
                              stroke={shape.color}
                              strokeWidth={2}
                              strokeDasharray="4 2"
                            />
                          </svg>
                        )}

                      <span
                        className="text-xs font-bold select-none"
                        style={{ color: shape.color }}
                      >
                        {shape.label}
                      </span>

                      {/* Dimensions label */}
                      <span className="absolute -bottom-3 left-0 text-[8px] text-gray-500 whitespace-nowrap">
                        {shape.width}×{shape.height}
                      </span>
                    </div>

                    {/* Move handle */}
                    {isSelected && (
                      <div className="absolute -top-2 -left-2 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow">
                        <Move className="h-2.5 w-2.5" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Press sheet label */}
              <div className="absolute bottom-1 right-2 text-[9px] text-gray-400 font-mono">
                {PRESS_W}×{PRESS_H} mm
              </div>
            </div>
          </div>
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
            <Card className="p-3 border-border space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold flex items-center gap-1">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: selectedShape.color }}
                  />
                  {selectedShape.label}
                </h4>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => rotateShape(selectedShape.id)}
                  >
                    <RotateCw className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-destructive"
                    onClick={() => removeShape(selectedShape.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[10px]">Ancho (mm)</Label>
                  <Input
                    type="number"
                    value={selectedShape.width}
                    onChange={(e) =>
                      updateShape(selectedShape.id, {
                        width: Number(e.target.value),
                      })
                    }
                    className="h-7 text-xs font-mono bg-input border-border"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">Alto (mm)</Label>
                  <Input
                    type="number"
                    value={selectedShape.height}
                    onChange={(e) =>
                      updateShape(selectedShape.id, {
                        height: Number(e.target.value),
                      })
                    }
                    className="h-7 text-xs font-mono bg-input border-border"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[10px]">X (mm)</Label>
                  <Input
                    type="number"
                    value={Math.round(selectedShape.x)}
                    onChange={(e) =>
                      updateShape(selectedShape.id, {
                        x: Number(e.target.value),
                      })
                    }
                    className="h-7 text-xs font-mono bg-input border-border"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">Y (mm)</Label>
                  <Input
                    type="number"
                    value={Math.round(selectedShape.y)}
                    onChange={(e) =>
                      updateShape(selectedShape.id, {
                        y: Number(e.target.value),
                      })
                    }
                    className="h-7 text-xs font-mono bg-input border-border"
                  />
                </div>
              </div>

              <div className="space-y-0.5">
                <Label className="text-[10px]">Sangrado (mm)</Label>
                <Input
                  type="number"
                  value={selectedShape.bleed}
                  onChange={(e) =>
                    updateShape(selectedShape.id, {
                      bleed: Number(e.target.value),
                    })
                  }
                  className="h-7 text-xs font-mono bg-input border-border"
                />
              </div>

              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Badge variant="outline" className="text-[9px]">
                  {selectedShape.shapeType === 'die_cut'
                    ? '✂ Troquel'
                    : selectedShape.shapeType === 'custom'
                      ? '⬡ Custom'
                      : selectedShape.shapeType}
                </Badge>
                <span>• Rot: {selectedShape.rotation}°</span>
              </div>
            </Card>
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

      {/* ── Add Shape Dialog ──────────────────────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Pieza al Montaje</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Etiqueta</Label>
              <Input
                placeholder={`P${shapes.length + 1}`}
                value={newShape.label}
                onChange={(e) =>
                  setNewShape({ ...newShape, label: e.target.value })
                }
                className="bg-input border-border"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Ancho (mm)</Label>
                <Input
                  type="number"
                  value={newShape.width}
                  onChange={(e) =>
                    setNewShape({ ...newShape, width: Number(e.target.value) })
                  }
                  className="bg-input border-border font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Alto (mm)</Label>
                <Input
                  type="number"
                  value={newShape.height}
                  onChange={(e) =>
                    setNewShape({ ...newShape, height: Number(e.target.value) })
                  }
                  className="bg-input border-border font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Forma</Label>
              <div className="grid grid-cols-5 gap-2">
                {SHAPE_TYPES.map((st) => (
                  <button
                    key={st.value}
                    type="button"
                    onClick={() =>
                      setNewShape({ ...newShape, shapeType: st.value })
                    }
                    className={cn(
                      'rounded-lg border-2 p-2 text-center transition-all text-xs',
                      newShape.shapeType === st.value
                        ? 'border-primary bg-primary/10 font-bold'
                        : 'border-muted hover:border-muted-foreground/30'
                    )}
                  >
                    <div className="text-lg">{st.icon}</div>
                    <div className="text-[9px]">{st.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Sangrado (mm)</Label>
              <Input
                type="number"
                value={newShape.bleed}
                onChange={(e) =>
                  setNewShape({ ...newShape, bleed: Number(e.target.value) })
                }
                className="bg-input border-border w-24 font-mono"
              />
            </div>

            {newShape.shapeType === 'rounded' && (
              <div className="space-y-1">
                <Label className="text-xs">Radio Borde (mm)</Label>
                <Input
                  type="number"
                  value={newShape.borderRadius}
                  onChange={(e) =>
                    setNewShape({
                      ...newShape,
                      borderRadius: Number(e.target.value),
                    })
                  }
                  className="bg-input border-border w-24 font-mono"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={addShape}>
              <Plus className="h-4 w-4 mr-1" />
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Die-Cut Preset Dialog ─────────────────────────────── */}
      <Dialog open={showDieCutDialog} onOpenChange={setShowDieCutDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Troqueles Especiales
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Seleccione un troquel predefinido o ingrese un SVG path personalizado.
            </p>

            {/* Presets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CUT_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
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
                  }}
                  className="rounded-lg border-2 border-muted p-3 text-left hover:border-primary/50 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-3">
                    <svg viewBox="0 0 100 100" className="w-12 h-12 flex-shrink-0">
                      <path
                        d={preset.path}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        className="text-primary"
                      />
                    </svg>
                    <div>
                      <div className="font-semibold text-sm">{preset.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {preset.desc}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom SVG path */}
            <div className="space-y-2 border-t border-border pt-3">
              <Label className="text-xs font-semibold flex items-center gap-1">
                <Wand2 className="h-3.5 w-3.5" />
                SVG Path Personalizado
              </Label>
              <Textarea
                placeholder='M 0 0 L 100 0 L 100 100 L 0 100 Z'
                value={newShape.customPath}
                onChange={(e) =>
                  setNewShape({ ...newShape, customPath: e.target.value })
                }
                className="bg-input border-border min-h-[60px] font-mono text-xs"
              />
              <Button
                size="sm"
                disabled={!newShape.customPath.trim()}
                onClick={() => {
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
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Agregar Forma Custom
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
