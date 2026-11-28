'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import type { RollbackKind } from '@/lib/ot-move';

export interface RollbackTarget {
  ot: any;
  key: string;
  labelEs: string;
  fromLabelEs: string;
}

/**
 * Un retroceso es dos cosas distintas, y sólo quien lo hace sabe cuál:
 *
 *   reproceso            hubo un error en producción y la OT vuelve a un proceso
 *                        anterior. El trabajo se hizo: los costos se incurrieron
 *                        y se quedan. Es el caso normal y viene elegido.
 *   error_de_movimiento  la tarjeta se movió de más. Esas etapas nunca se
 *                        trabajaron: sus horas salen del costo y el material que
 *                        salió para ellas vuelve a bodega.
 */
const KINDS: { value: RollbackKind; title: string; detail: string }[] = [
  {
    value: 'reproceso',
    title: 'Hay que rehacer el trabajo',
    detail: 'El trabajo se hizo y vuelve a un proceso anterior. Los costos ya incurridos (horas, mano de obra, material) se conservan.',
  },
  {
    value: 'error_de_movimiento',
    title: 'La OT se movió por error',
    detail: 'Esas etapas no se trabajaron. Sus horas salen del costo y el material que salió para etapas posteriores vuelve a bodega.',
  },
];

export function RollbackDialog({
  rollbackTarget,
  onCancel,
  onConfirm,
}: {
  rollbackTarget: RollbackTarget | null;
  onCancel: () => void;
  onConfirm: (kind: RollbackKind) => void;
}) {
  const [kind, setKind] = useState<RollbackKind>('reproceso');

  if (!rollbackTarget) return null;

  // Cada retroceso arranca en «reproceso»: revertir costo nunca queda elegido
  // por arrastre del anterior.
  const close = (fn: () => void) => { fn(); setKind('reproceso'); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-amber-500/40 rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
            <ArrowRight className="w-4 h-4 text-amber-400 rotate-180" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-sm">Retroceder OT</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-semibold text-foreground">{rollbackTarget.ot.ot_number}</span>
              {' '}—{' '}{rollbackTarget.ot.client_name}
            </p>
          </div>
        </div>
        <div className="bg-amber-500/8 border border-amber-500/25 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">De:</span>
            <span className="font-semibold text-foreground">{rollbackTarget.fromLabelEs}</span>
            <ArrowRight className="w-3 h-3 text-amber-400 rotate-180" />
            <span className="font-semibold text-amber-400">{rollbackTarget.labelEs}</span>
          </div>
        </div>
        <fieldset className="space-y-2 mb-4">
          <legend className="text-xs font-semibold text-foreground mb-1.5">¿Por qué retrocede?</legend>
          {KINDS.map((k) => (
            <label
              key={k.value}
              className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer ${
                kind === k.value ? 'border-amber-500/60 bg-amber-500/8' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name="rollback-kind"
                className="mt-0.5 accent-amber-500"
                checked={kind === k.value}
                onChange={() => setKind(k.value)}
              />
              <span>
                <span className="block text-xs font-semibold text-foreground">{k.title}</span>
                <span className="block text-[11px] text-muted-foreground leading-snug">{k.detail}</span>
              </span>
            </label>
          ))}
          <p className="text-[11px] text-muted-foreground leading-snug">
            Los costos cargados a mano (tercerizados, despachos, extras) no se tocan en ningún caso.
          </p>
        </fieldset>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => close(onCancel)}>
            Cancelar
          </Button>
          <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={() => close(() => onConfirm(kind))}>
            Confirmar Retroceso
          </Button>
        </div>
      </div>
    </div>
  );
}
