'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CalendarDays, ChevronDown, Minus, Plus, User, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { PRIORITY_LEVELS } from '@/types/ot';
import { ClientAutocomplete } from '../ot-wizard/ClientAutocomplete';
import type { UnifiedOTForm } from '@/types/ot-unified';

interface Props {
  form: UnifiedOTForm;
  updateForm: (patch: Partial<UnifiedOTForm>) => void;
}

export function UnifiedStepInfo({ form, updateForm }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarOTOpen, setCalendarOTOpen] = useState(false);

  const selectedDeadline = form.deadline ? new Date(form.deadline) : undefined;
  const selectedFechaOT = form.fecha_ot ? new Date(form.fecha_ot) : undefined;

  const handleQuantityChange = (delta: number) => {
    updateForm({ quantity: Math.max(1, form.quantity + delta) });
  };

  const currentPriority = PRIORITY_LEVELS.find((p) => p.value === form.priority_level);

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
          <User className="h-6 w-6 text-primary" />
          Información del Trabajo
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Datos del cliente, producto y plazos
        </p>
      </div>

      {/* ── Client ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Cliente *</Label>
          <ClientAutocomplete
            clientName={form.client_name}
            clientId={form.client_id}
            onSelect={(c) =>
              updateForm({ client_name: c.name, client_id: c.id })
            }
            onNameChange={(name) => updateForm({ client_name: name })}
          />
        </div>

        {/* Trabajo (job title from production form) */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Nombre del Trabajo</Label>
          <Input
            placeholder='Ej: "Libros para Pintar", "Cajas Navidad"'
            value={form.trabajo}
            onChange={(e) => updateForm({ trabajo: e.target.value })}
            className="bg-input border-border"
          />
        </div>
      </div>

      {/* ── Product & Quantity ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Producto</Label>
          <Input
            placeholder="Nombre del producto / referencia"
            value={form.product_name}
            onChange={(e) => updateForm({ product_name: e.target.value })}
            className="bg-input border-border"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Cantidad *</Label>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuantityChange(-100)}
              className="w-9 h-9"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) =>
                updateForm({ quantity: Math.max(1, Number(e.target.value)) })
              }
              className="bg-input border-border text-center font-bold text-lg flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuantityChange(100)}
              className="w-9 h-9"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Dates & Priority ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Fecha OT */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Fecha OT</Label>
          <Popover open={calendarOTOpen} onOpenChange={setCalendarOTOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal bg-input border-border',
                  !form.fecha_ot && 'text-muted-foreground'
                )}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {form.fecha_ot
                  ? format(new Date(form.fecha_ot), 'dd/MM/yyyy', { locale: es })
                  : 'Seleccionar…'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedFechaOT}
                onSelect={(date) => {
                  updateForm({
                    fecha_ot: date ? date.toISOString().slice(0, 10) : '',
                  });
                  setCalendarOTOpen(false);
                }}
                locale={es}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Deadline */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Fecha de Entrega</Label>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal bg-input border-border',
                  !form.deadline && 'text-muted-foreground'
                )}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {form.deadline
                  ? format(new Date(form.deadline), 'dd/MM/yyyy', { locale: es })
                  : 'Seleccionar…'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDeadline}
                onSelect={(date) => {
                  updateForm({
                    deadline: date ? date.toISOString().slice(0, 10) : '',
                  });
                  setCalendarOpen(false);
                }}
                locale={es}
                disabled={(d) => d < new Date()}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Priority */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Prioridad</Label>
          <Select
            value={form.priority_level}
            onValueChange={(v) =>
              updateForm({ priority_level: v as any })
            }
          >
            <SelectTrigger className="bg-input border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_LEVELS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  <span className={p.color}>{p.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── OT Anterior reference ──────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" />
          OT Anterior (referencia)
        </Label>
        <Input
          placeholder="Ej: OT-2025-001"
          value={form.ot_anterior}
          onChange={(e) => updateForm({ ot_anterior: e.target.value })}
          className="bg-input border-border max-w-xs"
        />
      </div>

      {/* ── More details (collapsible) ─────────────────────────── */}
      <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="text-muted-foreground">
            <ChevronDown
              className={cn('h-4 w-4 mr-1 transition-transform', moreOpen && 'rotate-180')}
            />
            {moreOpen ? 'Menos detalles' : 'Más detalles'}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Descripción / Notas</Label>
            <Textarea
              placeholder="Notas adicionales para producción…"
              value={form.description}
              onChange={(e) => updateForm({ description: e.target.value })}
              className="bg-input border-border min-h-[80px]"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
