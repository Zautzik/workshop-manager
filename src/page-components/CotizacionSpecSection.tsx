'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PapelEnBodega } from '@/components/comercial/PapelEnBodega';
import { ClientAutocomplete } from '@/components/workflow/ot-wizard/ClientAutocomplete';
import { toast } from 'sonner';
import { TERMINACIONES, TIPOS_PRODUCTO, type Coverage, type PressRef } from './cotizaciones-shared';

export interface CotizacionFormState {
  client_id: string; client_name: string; product_name: string; product_type: string; quantity: number;
  width_cm: number; height_cm: number; grammage_gsm: number;
  colors_front: number; colors_back: number; coverage: Coverage;
  finishes: Record<string, boolean>;
  variable_data: boolean;
  die_new: boolean;
  substrate_type: string;
  press_id: string;
  deadline: string;
  priority_level: string;
  markup: number;
}

export function CotizacionSpecSection({
  form,
  setForm,
  prensas,
  prensaElegida,
  calcSheets,
  num,
}: {
  form: CotizacionFormState;
  setForm: (value: CotizacionFormState) => void;
  prensas: PressRef[];
  prensaElegida: PressRef | null;
  calcSheets: number | null;
  num: (v: string) => number;
}) {
  return (
    <div className="space-y-2.5">
      {/* Escribir y sugerir, no un desplegable. Con veinticuatro
          cuentas —y creciendo— buscar en una lista desplegada es más
          lento que teclear tres letras. El mismo componente que usa el
          asistente de producción, que además sabe crear un cliente
          nuevo sin salir de acá: es el caso normal de una cotización. */}
      <div>
        <Label className="text-xs">Cliente</Label>
        <ClientAutocomplete
          clientName={form.client_name}
          clientId={form.client_id}
          onSelect={(c) => setForm({ ...form, client_id: c.id, client_name: c.name })}
          onNameChange={(name) => setForm({ ...form, client_name: name, client_id: '' })}
        />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div><Label>Producto</Label><Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} placeholder="Ej: Etiqueta frasco 250ml" /></div>
        <div>
          <Label className="text-xs">Tipo</Label>
          <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value })}>
            {TIPOS_PRODUCTO.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><Label className="text-xs">Cantidad</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: num(e.target.value) })} /></div>
        <div><Label className="text-xs">Ancho (cm)</Label><Input type="number" value={form.width_cm} onChange={(e) => setForm({ ...form, width_cm: num(e.target.value) })} /></div>
        <div><Label className="text-xs">Alto (cm)</Label><Input type="number" value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: num(e.target.value) })} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><Label className="text-xs">Gramaje</Label><Input type="number" value={form.grammage_gsm} onChange={(e) => setForm({ ...form, grammage_gsm: num(e.target.value) })} /></div>
        <div>
          <Label className="text-xs">Sustrato</Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={form.substrate_type}
            onChange={(e) => setForm({ ...form, substrate_type: e.target.value })}
          >
            <option value="couche">Couché</option>
            <option value="bond">Bond</option>
            <option value="cartulina">Cartulina</option>
            <option value="adhesivo">Adhesivo</option>
            <option value="kraft">Kraft</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        {/* Frente y dorso juntos: son un solo dato del oficio —«4/0»,
            «4/4»— y separarlos en dos filas costaba una fila entera. */}
        <div>
          <Label className="whitespace-nowrap text-xs">Colores f/d</Label>
          <div className="flex items-center gap-1">
            <Input type="number" value={form.colors_front} onChange={(e) => setForm({ ...form, colors_front: num(e.target.value) })} />
            <span className="text-muted-foreground">/</span>
            <Input type="number" value={form.colors_back} onChange={(e) => setForm({ ...form, colors_back: num(e.target.value) })} />
          </div>
        </div>
      </div>
      {/* Antes de mandar a comprar: qué hay parado en bodega que sirva.
          Aparece acá y no en otra pantalla porque es EL momento — un
          minuto después ya cotizó y el papel viejo sigue ahí. */}
      <PapelEnBodega
        substrateType={form.substrate_type}
        grammageGsm={form.grammage_gsm}
        sheetsNeeded={calcSheets}
        widthCm={form.width_cm}
        heightCm={form.height_cm}
        productType={form.product_type}
        onUsar={(sug) => {
          // Se ajusta el gramaje cotizado al del papel que existe. El
          // motor recalcula solo y el precio se mueve a la vista, que
          // es lo que el vendedor necesita ver antes de ofrecerlo.
          const g = sug.stock.grammageGsm;
          if (g) setForm({ ...form, grammage_gsm: g });
          toast.success(sug.pitch);
        }}
      />

      <div className="grid grid-cols-2 gap-2 items-end">
        <div>
          <Label className="text-xs">Cobertura de tinta</Label>
          <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.coverage} onChange={(e) => setForm({ ...form, coverage: e.target.value as Coverage })}>
            <option value="light">Liviana</option>
            <option value="medium">Media</option>
            <option value="heavy">Alta (sólidos)</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Prensa</Label>
          <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={prensaElegida?.id ?? ''} onChange={(e) => setForm({ ...form, press_id: e.target.value })}>
            {prensas.map((m) => (
              <option key={m.id} value={m.id}>{m.name} · {m.maxWidthCm}×{m.maxHeightCm} cm</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Fecha de entrega</Label>
          <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Prioridad</Label>
          <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={form.priority_level} onChange={(e) => setForm({ ...form, priority_level: e.target.value })}>
            <option value="baja">Baja</option>
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>
      </div>

      {/* Terminaciones de verdad. Eran una casilla que activaba sólo
          plegado, y son entre el 15 y el 20% del costo — donde vive
          el margen de un estuche. */}
      {/* Sólo si se troquela. Preguntar por un troquel en un trabajo
          que no lleva troquelado es ruido, y el ruido enseña a saltear
          campos. */}
      {form.finishes.finish_troquelado && (
        <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.die_new}
            onChange={(e) => setForm({ ...form, die_new: e.target.checked })}
          />
          <span>
            <span className="font-medium">Hay que mandar a hacer el troquel</span>
            <span className="block text-[11px] leading-snug text-muted-foreground">
              Costo de una vez, no por pliego. Si el cliente repite un trabajo que
              ya tiene matriz, dejalo sin marcar.
            </span>
          </span>
        </label>
      )}

      {/* No es una terminación: es una SEGUNDA PASADA de impresión.
          Va acá por cercanía visual, pero la etiqueta lo distingue —
          confundirlo con un acabado haría que se costee como si fuera
          trabajo de taller y no tiempo de máquina. */}
      <label className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.variable_data}
          onChange={(e) => setForm({ ...form, variable_data: e.target.checked })}
        />
        <span>
          <span className="font-medium">Dato variable</span>
          <span className="block text-[11px] leading-snug text-muted-foreground">
            Se tira en offset y se personaliza en digital: nombres, números,
            códigos. Suma una pasada por la digital, que se cobra por clic.
          </span>
        </span>
      </label>

      <div>
        <Label className="text-xs">Terminaciones</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {TERMINACIONES.map((t) => {
            const activa = !!form.finishes[t.key];
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={activa}
                onClick={() => setForm({ ...form, finishes: { ...form.finishes, [t.key]: !activa } })}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  activa
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
