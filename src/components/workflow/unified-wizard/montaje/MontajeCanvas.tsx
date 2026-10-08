'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Move } from 'lucide-react';
import type { MontajeShape } from '@/types/ot-unified';

export function MontajeCanvas({
  shapes,
  updateShape,
  selectedId,
  setSelectedId,
  scale,
  canvasW,
  canvasH,
  PRESS_W,
  PRESS_H,
  PINZA_MM,
  pinzaCm,
}: {
  shapes: MontajeShape[];
  updateShape: (id: string, patch: Partial<MontajeShape>) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  scale: number;
  canvasW: number;
  canvasH: number;
  PRESS_W: number;
  PRESS_H: number;
  PINZA_MM: number;
  pinzaCm: number;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

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

  return (
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
            Pinza ({pinzaCm} cm)
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
  );
}
