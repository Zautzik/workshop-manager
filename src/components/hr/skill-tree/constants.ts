import {
  // Icons used inside nodes
  Shield, Wrench, Ruler, Eye, Printer, FileInput, Droplets,
  CircleDot, Layers, Palette, Settings, Crown, FileText, Monitor,
  Maximize2, Database, Sparkles, Scissors, FileMinus, LayoutGrid,
  Target, Cpu, Box, Play, Hexagon, Unlink, Crosshair, Grid3x3,
  Hammer, Search, Package, CornerDownRight, RotateCw, Puzzle, Ribbon,
  type LucideIcon,
} from 'lucide-react';
import { type CraftBranch } from '@/lib/craft-skill-paths';

// ── Icon map ─────────────────────────────────────────────────────────

export const ICON_MAP: Record<string, LucideIcon> = {
  'shield': Shield,
  'wrench': Wrench,
  'ruler': Ruler,
  'eye': Eye,
  'printer': Printer,
  'file-input': FileInput,
  'droplets': Droplets,
  'circle-dot': CircleDot,
  'layers': Layers,
  'palette': Palette,
  'settings': Settings,
  'crown': Crown,
  'file-text': FileText,
  'monitor': Monitor,
  'maximize': Maximize2,
  'database': Database,
  'sparkles': Sparkles,
  'scissors': Scissors,
  'file-minus': FileMinus,
  'layout-grid': LayoutGrid,
  'target': Target,
  'cpu': Cpu,
  'box': Box,
  'play': Play,
  'hexagon': Hexagon,
  'unlink': Unlink,
  'crosshair': Crosshair,
  'grid-3x3': Grid3x3,
  'hammer': Hammer,
  'search': Search,
  'package': Package,
  'corner-down-right': CornerDownRight,
  'rotate-cw': RotateCw,
  'puzzle': Puzzle,
  'ribbon': Ribbon,
};

// ── Constants ────────────────────────────────────────────────────────

export const NODE_R = 26;
export const MASTER_R = 32;
export const PROF_DOT_R = 3;

export const ORDERED_BRANCHES: CraftBranch[] = [
  'foundation', 'offset_printing', 'digital_printing',
  'guillotine', 'die_cutting', 'workshop',
];
