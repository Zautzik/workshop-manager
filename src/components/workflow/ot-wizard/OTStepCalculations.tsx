'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Layers, Droplets, Grid3X3, Clock, Printer, History, TrendingDown, TrendingUp } from 'lucide-react';
import type { OTFormData } from '@/types/ot';
import { ImpositionPreview } from './ImpositionPreview';

interface HistoricalOT {
  id: string;
  ot_number: string;
  client_name: string;
  product_name: string;
  quantity: number;
  subtotal: number;
  total_price: number;
  unit_price: number;
  created_at: string;
}

interface Props {
  form: OTFormData;
  updateForm: (patch: Partial<OTFormData>) => void;
}

export function OTStepCalculations({ form }: Props) {
  const { calculations: c } = form;
  const [history, setHistory] = useState<HistoricalOT[]>([]);

  // Fetch historical OTs for comparison
  useEffect(() => {
    async function fetchHistory() {
      try {
        const params = new URLSearchParams();
        if (form.client_name) params.set('client', form.client_name);
        if (form.product_type) params.set('product_type', form.product_type);
        const res = await fetch(`/api/ots/history?${params}`);
        if (res.ok) {
          const data = await res.json();
          setHistory(data.filter((h: HistoricalOT) => h.total_price > 0).slice(0, 5));
        }
      } catch {
        // ignore
      }
    }
    fetchHistory();
  }, [form.client_name, form.product_type]);

  const cards = [
    {
      icon: <Grid3X3 className="h-5 w-5" />,
      label: 'Pliegos',
      value: c.calc_sheets.toLocaleString(),
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10 border-blue-500/20',
    },
    {
      icon: <Layers className="h-5 w-5" />,
      label: 'Sustrato',
      value: `${c.calc_substrate_kg.toLocaleString()} kg`,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10 border-emerald-500/20',
    },
    {
      icon: <Droplets className="h-5 w-5" />,
      label: 'Tintas',
      value: `${c.calc_ink_kg.toLocaleString()} kg`,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10 border-purple-500/20',
    },
    {
      icon: <Printer className="h-5 w-5" />,
      label: 'Placas CTP',
      value: `${c.calc_plates} placas`,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/20',
    },
  ];

  return (
    <div className="space-y-2">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-foreground">Cálculos y Optimización</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Revisión automática de materiales y tiempos
        </p>
      </div>

      <div className="max-w-xl mx-auto space-y-6">
        {/* Imposition preview */}
        {form.imposition && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <Grid3X3 className="h-4 w-4 text-primary" />
              Imposición en Pliego 70×100
            </h3>
            <ImpositionPreview
              imposition={form.imposition}
              widthCm={form.width_cm}
              heightCm={form.height_cm}
            />
          </div>
        )}

        {/* Material cards */}
        <div className="grid grid-cols-2 gap-4">
          {cards.map((card) => (
            <Card
              key={card.label}
              className={`p-4 border ${card.bgColor} bg-card/80`}
            >
              <div className="flex items-start gap-3">
                <div className={card.color}>{card.icon}</div>
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-bold text-foreground">{card.value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Estimated times */}
        <div className="border border-border rounded-lg p-4 bg-card/50">
          <div className="flex items-center gap-2 text-muted-foreground mb-3">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">Tiempos estimados</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Impresión:</span>
              <span className="text-sm font-semibold text-foreground">
                {c.calc_print_hours} hrs
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Terminaciones:</span>
              <span className="text-sm font-semibold text-foreground">
                {c.calc_finish_hours} hrs
              </span>
            </div>
          </div>
        </div>

        {/* Historical cost comparison */}
        {history.length > 0 && (
          <div className="border border-border rounded-lg p-4 bg-card/50">
            <div className="flex items-center gap-2 text-muted-foreground mb-3">
              <History className="h-4 w-4" />
              <span className="text-sm font-medium">Historial de Costos Similares</span>
            </div>
            <div className="space-y-2">
              {history.map((h) => {
                const unitPriceFmt = `$${h.unit_price?.toLocaleString('es-CL', { maximumFractionDigits: 1 }) ?? '0'}`;
                return (
                  <div
                    key={h.id}
                    className="flex items-center justify-between text-xs border-b border-border/50 last:border-0 pb-1.5 last:pb-0"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-foreground">{h.ot_number}</span>
                      <span className="text-muted-foreground ml-2">
                        {h.client_name} · {h.quantity?.toLocaleString()} uds
                      </span>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className="font-bold text-foreground">
                        ${h.total_price?.toLocaleString('es-CL', { maximumFractionDigits: 0 }) ?? '0'}
                      </span>
                      <span className="text-muted-foreground ml-1">
                        ({unitPriceFmt}/u)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Summary note */}
        <p className="text-xs text-muted-foreground text-center">
          Los cálculos incluyen un 5% de excedente y {50} pliegos de arranque.
          Puede ajustar cantidades y costos en el siguiente paso.
        </p>
      </div>
    </div>
  );
}
