'use client';

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
import { CalendarDays, ChevronDown, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useState } from 'react';
import type { OTFormData, OTPriorityLevel } from '@/types/ot';
import { PRIORITY_LEVELS } from '@/types/ot';
import { ClientAutocomplete } from './ClientAutocomplete';
import { TemplateSelector } from './TemplateSelector';

interface Props {
  form: OTFormData;
  updateForm: (patch: Partial<OTFormData>) => void;
}

export function OTStepInformation({ form, updateForm }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const selectedDate = form.deadline ? new Date(form.deadline) : undefined;

  const handleQuantityChange = (delta: number) => {
    const next = Math.max(1, form.quantity + delta);
    updateForm({ quantity: next });
  };

  const currentPriority = PRIORITY_LEVELS.find((p) => p.value === form.priority_level);

  return (
    <div className="space-y-2">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-foreground">Información del Trabajo</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Ingrese los datos básicos del cliente y producto
        </p>
      </div>

      <div className="space-y-5 max-w-lg mx-auto">
        {/* Template selector */}
        <TemplateSelector form={form} updateForm={updateForm} />

        {/* Client */}
        <div className="space-y-2">
          <Label htmlFor="client_name" className="text-foreground font-semibold">
            Cliente
          </Label>
          <ClientAutocomplete
            clientName={form.client_name}
            clientId={form.client_id}
            onSelect={({ id, name }) => updateForm({ client_id: id, client_name: name })}
            onNameChange={(name) => updateForm({ client_name: name })}
          />
        </div>

        {/* Product name */}
        <div className="space-y-2">
          <Label htmlFor="product_name" className="text-foreground font-semibold">
            Producto
          </Label>
          <Input
            id="product_name"
            value={form.product_name}
            onChange={(e) => updateForm({ product_name: e.target.value })}
            placeholder="Ej: Etiquetas Gatorade, Caja Display..."
            className="bg-input border-border"
          />
        </div>

        {/* Quantity */}
        <div className="space-y-2">
          <Label className="text-foreground font-semibold">Cantidad</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 border-border shrink-0"
              onClick={() => handleQuantityChange(-100)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => updateForm({ quantity: Math.max(1, parseInt(e.target.value) || 1) })}
              className="bg-input border-border text-center text-lg font-semibold"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 border-border shrink-0"
              onClick={() => handleQuantityChange(100)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Deadline */}
        <div className="space-y-2">
          <Label className="text-foreground font-semibold">Fecha de Entrega</Label>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal bg-input border-border',
                  !selectedDate && 'text-muted-foreground'
                )}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {selectedDate
                  ? format(selectedDate, "PPP", { locale: es })
                  : 'Seleccionar fecha...'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  updateForm({ deadline: date ? date.toISOString() : '' });
                  setCalendarOpen(false);
                }}
                disabled={(date) => date < new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Priority */}
        <div className="space-y-2">
          <Label className="text-foreground font-semibold">Prioridad</Label>
          <Select
            value={form.priority_level}
            onValueChange={(val) => updateForm({ priority_level: val as OTPriorityLevel })}
          >
            <SelectTrigger className="bg-input border-border">
              <SelectValue>
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      currentPriority?.value === 'baja' && 'bg-blue-400',
                      currentPriority?.value === 'normal' && 'bg-green-400',
                      currentPriority?.value === 'alta' && 'bg-amber-400',
                      currentPriority?.value === 'urgente' && 'bg-red-400',
                    )}
                  />
                  {currentPriority?.label}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_LEVELS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        p.value === 'baja' && 'bg-blue-400',
                        p.value === 'normal' && 'bg-green-400',
                        p.value === 'alta' && 'bg-amber-400',
                        p.value === 'urgente' && 'bg-red-400',
                      )}
                    />
                    {p.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* More options */}
        <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between text-muted-foreground">
              Más opciones
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', moreOpen && 'rotate-180')}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="description" className="text-foreground font-semibold">
                Notas / Descripción
              </Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
                placeholder="Instrucciones especiales, referencias, etc..."
                className="bg-input border-border min-h-[80px]"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
