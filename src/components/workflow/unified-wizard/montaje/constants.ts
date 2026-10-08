import type { MontajeShape } from '@/types/ot-unified';

export const SHAPE_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
];

export const SHAPE_TYPES: { value: MontajeShape['shapeType']; label: string; icon: string }[] = [
  { value: 'rectangle', label: 'Rectángulo', icon: '▬' },
  { value: 'rounded', label: 'Redondeado', icon: '▢' },
  { value: 'circle', label: 'Círculo', icon: '●' },
  { value: 'die_cut', label: 'Troquel', icon: '✂' },
  { value: 'custom', label: 'Forma Libre', icon: '⬡' },
];

export const CUT_PRESETS: { name: string; path: string; desc: string }[] = [
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
