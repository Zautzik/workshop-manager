'use client';
import { otStatusLabel } from '@/lib/status-labels';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, ArrowRight, DollarSign, AlertCircle, SkipForward, Upload, X, Image as ImageIcon } from 'lucide-react';
import { OPERATION_CATEGORIES, type OTOperationCategory } from '@/types/ot';
import { consumeMaterial } from '@/lib/partial-advance';
import { colorCount, makeReadySheets, pressPasses } from '@/lib/ot-calculations';
import { MaterialQueAvanza, type ConsumoElegido } from './MaterialQueAvanza';
import { estimatedHoursFor, firstProblem, promptsStageReport, validateStageReport } from '@/lib/stage-report';
import {
  CierreDeEtapa, CIERRE_VACIO, cierreToInput, cierreToPayload,
  type CierreEtapa, type StageReportPayload,
} from './CierreDeEtapa';

interface RealCostLine {
  operation_code: string;
  description: string;
  category: OTOperationCategory;
  quantity: number;
  unit: string;
  unit_cost: number;
  notes: string;
  /** For display only — estimated values from budget */
  _est_qty?: number;
  _est_unit?: string;
  _est_unit_cost?: number;
  _est_total?: number;
  _is_budgeted?: boolean;
  /**
   * La agregó sola esta pantalla al ver merma declarada en el cierre de
   * etapa — sigue siendo editable y se puede borrar, pero no partió de un
   * campo vacío. Ver el efecto que la sincroniza más abajo.
   */
  _is_merma_auto?: boolean;
  /**
   * La línea de merma se agregó, pero esta OT no tiene ninguna línea de
   * papel presupuestada de la cual sacar un costo por pliego — quedó en $0
   * porque no hay de dónde tasarla, no porque la pérdida no valga nada.
   */
  _merma_sin_costo?: boolean;
}

interface BudgetedOperation {
  id: string;
  category: string;
  name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  sort_order: number;
}

interface RealCostEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ot: {
    id: string;
    ot_number: string;
    client_name: string;
    product_name?: string;
    status: string;
    quantity?: number;
  };
  targetStatus: string;
  targetStatusLabel: string;
  /**
   * Se llama con las unidades que avanzan y con el cierre de la etapa que
   * termina —`null` cuando la etapa no lo pide, como bodega o compras—. El
   * cierre viaja hasta el mismo pedido que mueve la OT: dos llamadas separadas
   * dejarían, cuando una falla, una OT movida sin horas o al revés.
   */
  onConfirm: (movedQuantity: number, stageReport: StageReportPayload | null) => Promise<void> | void;
}

export function RealCostEntryDialog({
  open,
  onOpenChange,
  ot,
  targetStatus,
  targetStatusLabel,
  onConfirm,
}: RealCostEntryDialogProps) {
  const { toast } = useToast();
  const [lines, setLines] = useState<RealCostLine[]>([]);
  // El presupuesto ENTERO, sin filtrar por lo ya cobrado — a diferencia de
  // `lines`, que sólo trae lo pendiente. La línea de papel puede llevar
  // etapas cerrada cuando ocurre la merma (auditoría 2026-09-03, OT 41242:
  // el papel se cobró en Bodega y el troquel es tres etapas después), y sin
  // esto no habría de dónde sacar su costo unitario para tasar la merma.
  const [allBudgetedOps, setAllBudgetedOps] = useState<BudgetedOperation[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const totalQuantity = Math.max(1, Number(ot.quantity ?? 1));
  const [movedQuantity, setMovedQuantity] = useState<number>(totalQuantity);
  const isVistoGood = ot.status === 'visto_bueno';

  // ── El cierre se pide, no se exige ───────────────────────────────────────
  //
  // Aparece en las etapas que esta casa ejecuta y cronometra —el taller y el
  // reparto—, y se puede dejar en blanco: la pasada queda abierta y se cierra
  // después desde donde sea. `promptsStageReport` es la misma lista que usa el
  // servidor, así que el formulario y la compuerta nunca discrepan.
  const needsClosure = promptsStageReport(ot.status);
  const [cierre, setCierre] = useState<CierreEtapa>(CIERRE_VACIO);
  const [showCierreErrors, setShowCierreErrors] = useState(false);

  // ── El papel se mueve con las unidades ────────────────────────────────────
  //
  // Este diálogo preguntaba sólo por las unidades y el material se quedaba
  // quieto: se cortaban tres mil de seis mil y el inventario seguía mostrando
  // los pliegos completos. El fragmento que salió no quedaba atado a ningún
  // lote, así que su trazabilidad no existía.
  const consume = consumeMaterial(ot.status, targetStatus);
  const otAny = ot as unknown as Record<string, any>;
  const [consumo, setConsumo] = useState<ConsumoElegido | null>(null);

  // Contra qué se juzga el cierre: los pliegos del trabajo dicen si la merma es
  // el arreglo o un problema, y lo estimado hace saltar un 40 escrito donde se
  // esperaba un 4. Ambos son opcionales — sin ellos las compuertas no corren.
  const enteredSheets = Number(otAny.calc_sheets ?? 0) || null;
  const estimatedHours = estimatedHoursFor(ot.status, otAny);

  /**
   * ¿Se puede avanzar? Devuelve la pasada lista para el servidor.
   *
   * Sólo dice que no cuando el dato es IMPOSIBLE —480 horas, merma mayor que el
   * tiraje—, nunca cuando falta. Dejarlo en blanco manda la pasada abierta, que
   * es una respuesta legítima: quien arrastra la tarjeta a veces no es quien
   * estuvo en la máquina.
   */
  const takeClosure = (): { ok: boolean; payload: StageReportPayload | null } => {
    if (!needsClosure) return { ok: true, payload: null };
    const check = validateStageReport(cierreToInput(cierre), { enteredSheets, estimatedHours });
    if (!check.ok) {
      setShowCierreErrors(true);
      toast({
        title: 'Ese dato no puede ser',
        description: firstProblem(check) ?? 'Revisá el cierre de la etapa.',
        variant: 'destructive',
      });
      return { ok: false, payload: null };
    }
    // Una pasada vacía igual viaja: el servidor la necesita para saber que la OT
    // pasó por acá y que las horas se deben.
    return { ok: true, payload: cierreToPayload(cierre) };
  };

  // Load budgeted operations as reference
  useEffect(() => {
    if (!open || loaded) return;

    const loadBudget = async () => {
      try {
        const res = await fetch(`/api/ots/${ot.id}/operations`);
        if (!res.ok) {
          setLines([createEmptyLine(1)]);
          setLoaded(true);
          return;
        }
        const ops: BudgetedOperation[] = await res.json();
        setAllBudgetedOps(ops);

        // El presupuesto es del trabajo entero, no de esta pasada — pero cada
        // línea sólo se cobra una vez en la vida de la OT. Sin este filtro,
        // las mismas 10 líneas de "Sustrato/Papel", "Tintas", etc. se ofrecían
        // de nuevo en cada etapa; aceptar los valores por defecto en las nueve
        // paradas del tablero sumaba el presupuesto completo nueve veces en el
        // libro de costos reales (auditoría 2026-09: una OT que cerró exacta
        // en presupuesto terminó reportando -567% de margen).
        //
        // Pero "ya se registró" no es lo mismo que "ya se cubrió". Una OT que
        // retrocede a Visto Bueno, cambia de cantidad y vuelve a pasar por
        // estas mismas etapas necesita GENUINAMENTE más papel y más máquina la
        // segunda vez — comparar sólo la descripción dejaba cada línea en cero
        // ofrecido apenas se había cobrado una vez, aunque el presupuesto
        // hubiera subido después (mismo caso 41241, tras subir de 8.000 a
        // 9.000 unidades). Por eso se compara CANTIDAD registrada contra
        // cantidad presupuestada: lo ya cubierto no vuelve a ofrecerse, y lo
        // que el presupuesto subió desde entonces se ofrece por la diferencia,
        // no por el total — así no se vuelve a cobrar lo que ya se cobró.
        let recordedQtyByDesc = new Map<string, number>();
        try {
          const rcRes = await fetch(`/api/ots/${ot.id}/real-costs`);
          if (rcRes.ok) {
            const recorded: { description: string; quantity: number }[] = await rcRes.json();
            for (const r of recorded) {
              const key = (r.description ?? '').toLowerCase().trim();
              recordedQtyByDesc.set(key, (recordedQtyByDesc.get(key) ?? 0) + Number(r.quantity ?? 0));
            }
          }
        } catch {
          // Si no se puede saber qué ya se cobró, mejor no perder líneas de
          // presupuesto reales por un fetch caído — se pre-llenan todas, como
          // antes, en vez de arriesgar dejar afuera lo que sí corresponde.
        }

        const remaining = ops
          .map((op) => {
            const key = op.name.toLowerCase().trim();
            const recordedQty = recordedQtyByDesc.get(key) ?? 0;
            const pendingQty = Math.max(0, op.quantity - recordedQty);
            return { op, recordedQty, pendingQty };
          })
          .filter(({ recordedQty, pendingQty }) => recordedQty === 0 || pendingQty > 0);

        if (remaining.length === 0) {
          setLines([createEmptyLine(1)]);
        } else {
          setLines(
            remaining.map(({ op, recordedQty, pendingQty }, idx) => {
              // Sin nada registrado todavía: se ofrece el presupuesto completo,
              // como siempre. Con algo ya cubierto: se ofrece sólo lo que falta,
              // a prorrata del costo unitario presupuestado.
              const offeredQty = recordedQty > 0 ? pendingQty : op.quantity;
              const unitPrice = op.quantity > 0 ? op.total_cost / op.quantity : op.unit_cost;
              return {
                operation_code: String(idx + 1).padStart(5, '0'),
                description: recordedQty > 0 ? `${op.name} (adicional)` : op.name,
                category: (op.category as OTOperationCategory) || 'otros',
                quantity: offeredQty,
                unit: op.unit,
                unit_cost: op.unit_cost,
                notes: '',
                _est_qty: offeredQty,
                _est_unit: op.unit,
                _est_unit_cost: op.unit_cost,
                _est_total: Math.round(offeredQty * unitPrice * 100) / 100,
                _is_budgeted: true,
              };
            })
          );
        }
        setLoaded(true);
      } catch {
        setLines([createEmptyLine(1)]);
        setLoaded(true);
      }
    };

    loadBudget();
  }, [open, ot.id, loaded]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setLoaded(false);
      setLines([]);
      setAllBudgetedOps([]);
      setImageFile(null);
      setImagePreview(null);
      // El cierre NO se arrastra a la próxima OT: cuatro horas y media
      // heredadas de otra tarjeta son peores que un campo vacío.
      setCierre(CIERRE_VACIO);
      setShowCierreErrors(false);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setMovedQuantity(totalQuantity);
    }
  }, [open, ot.id, totalQuantity]);

  // ── La merma se convierte en costo sola, no en un "$0" que hay que notar ──
  //
  // El cierre de etapa dejaba guardar con "Total Real: $0" aunque la merma se
  // hubiera declarado y calificado sola de "crítica" — nada conectaba los
  // pliegos perdidos con ninguna línea de costo (auditoría 2026-09-03, OT
  // 41242: 500 de 882 pliegos perdidos, Total Real $0 hasta agregar el ítem
  // a mano). Ahora esta pantalla agrega la línea sola, tasada con el mismo
  // costo por pliego que ya paga el papel presupuestado de esta OT — no un
  // lote adivinado: CierreDeEtapa ya explica por qué automatizar CUÁL lote
  // sale sería adivinar, y esto no lo hace, sólo repite un precio que el
  // presupuesto ya usa para el mismo papel.
  //
  // Sigue siendo una fila más: se ve, se puede editar o borrar antes de
  // guardar. Si se vuelve a tocar el número de merma, se recalcula desde
  // cero — no se acumula sobre una corrección que alguien ya haya hecho a
  // mano en la fila.
  useEffect(() => {
    if (!needsClosure) return;
    const merma = cierre.mermaSheets;
    setLines((prev) => {
      const sinAuto = prev.filter((l) => !l._is_merma_auto);
      if (!merma || merma <= 0) return sinAuto;

      const papelOp = allBudgetedOps.find(
        (o) => o.category === 'materiales' && /papel|sustrato/i.test(o.name)
      );
      // Sin línea de papel presupuestada no hay de dónde sacar un costo por
      // pliego — no es que la merma valga $0, es que esta OT no tiene
      // presupuesto del cual derivarlo (auditoría 2026-09-04: pasa en OTs
      // con precio $0, una anomalía ya señalada aparte en el Tablero). Se
      // marca la línea en vez de dejarla pasar como un costo real más.
      const sinCosto = !papelOp || !enteredSheets;
      const costoPorPliego = sinCosto ? 0 : papelOp!.total_cost / enteredSheets!;

      const linea: RealCostLine = {
        operation_code: String(sinAuto.length + 1).padStart(5, '0'),
        description: sinCosto
          ? `Merma — ${otStatusLabel(ot.status)} (${merma} pliegos, sin presupuesto de papel del cual tasarla)`
          : `Merma — ${otStatusLabel(ot.status)} (${merma} pliegos, tasada con el costo del papel presupuestado)`,
        category: 'materiales',
        quantity: merma,
        unit: 'pliego',
        unit_cost: Math.round(costoPorPliego * 100) / 100,
        notes: '',
        _is_budgeted: false,
        _is_merma_auto: true,
        _merma_sin_costo: sinCosto,
      };
      return [...sinAuto, linea];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cierre.mermaSheets, needsClosure, allBudgetedOps, enteredSheets, ot.status]);

  const createEmptyLine = (idx: number): RealCostLine => ({
    operation_code: String(idx).padStart(5, '0'),
    description: '',
    category: 'otros',
    quantity: 0,
    unit: 'unit',
    unit_cost: 0,
    notes: '',
    _is_budgeted: false,
  });

  const updateLine = useCallback((index: number, field: keyof RealCostLine, value: any) => {
    setLines((prev) => {
      const copy = [...prev];
      (copy[index] as any)[field] = value;
      return copy;
    });
  }, []);

  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLine(prev.length + 1)]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const getLineTotal = (l: RealCostLine) => Math.round(l.quantity * l.unit_cost * 100) / 100;
  const getEstTotal = (l: RealCostLine) => l._est_total ?? 0;
  const grandTotal = lines.reduce((s, l) => s + getLineTotal(l), 0);
  const estGrandTotal = lines.reduce((s, l) => s + getEstTotal(l), 0);
  const overallDev = estGrandTotal > 0 ? ((grandTotal - estGrandTotal) / estGrandTotal) * 100 : 0;

  const handleSkip = async () => {
    if (movedQuantity < 1 || movedQuantity > totalQuantity) {
      toast({
        title: 'Cantidad inválida',
        description: `La cantidad a mover debe estar entre 1 y ${totalQuantity}.`,
        variant: 'destructive',
      });
      return;
    }
    // Omitir es omitir COSTOS. La pasada viaja igual —abierta si no se llenó—
    // porque es el rastro de que la OT estuvo acá.
    const closure = takeClosure();
    if (!closure.ok) return;
    if (isVistoGood && imageFile) await uploadImage();
    await onConfirm(movedQuantity, closure.payload);
    onOpenChange(false);
  };

  const uploadImage = async () => {
    if (!imageFile) return;
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append('file', imageFile);
      const res = await fetch(`/api/ots/${ot.id}/image`, { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast({ title: 'Error al subir imagen', description: body?.error ?? 'Intente de nuevo', variant: 'destructive' });
      }
    } catch {
      // non-blocking — image upload failure shouldn't block advance
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveAndAdvance = async () => {
    // El cierre se valida ANTES de escribir nada: rebotar después de haber
    // guardado los costos dejaría media operación hecha y al usuario sin saber
    // cuál mitad.
    const closure = takeClosure();
    if (!closure.ok) return;

    // Puede no haber nada que guardar acá: si esta OT ya recorrió etapas
    // anteriores, sus líneas de presupuesto ya se registraron ahí y el
    // efecto de carga las deja afuera a propósito (ver el filtro más
    // arriba). Eso ya no es un error — es lo esperado — así que en vez de
    // bloquear con un toast, se salta el POST de costos y se sigue derecho
    // al avance. Sólo bloquea si de verdad no hay nada que ofrecer (el
    // presupuesto nunca cargó) versus una línea a medio llenar por error.
    const validLines = lines.filter((l) => l.description.trim().length > 0);
    const hasNothingToRecord = validLines.length === 0;

    setSaving(true);

    try {
      if (!hasNothingToRecord) {
        const payload = {
          workflow_step: ot.status, // Record costs for the CURRENT step (before advancing)
          costs: validLines.map((l) => ({
            operation_code: l.operation_code,
            description: l.description.trim(),
            category: l.category,
            quantity: l.quantity,
            unit: l.unit,
            unit_cost: l.unit_cost,
            notes: l.notes || null,
          })),
        };

        const res = await fetch(`/api/ots/${ot.id}/real-costs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          throw new Error(errBody?.error || 'Failed to save costs');
        }

        toast({
          title: 'Costos reales registrados',
          description: `${validLines.length} ítems guardados para ${ot.ot_number}`,
        });
      }

      // Now advance the OT
      if (movedQuantity < 1 || movedQuantity > totalQuantity) {
        throw new Error(`La cantidad a mover debe estar entre 1 y ${totalQuantity}.`);
      }
      if (isVistoGood && imageFile) await uploadImage();

      // ── El papel se declara si se puede, y si no, no se frena ──────────
      //
      // Antes esto exigía escanear un pallet para poder mover la OT. Estaba
      // mal por dos motivos. Uno: `/operaciones/escanear` existe para eso, al
      // lado de la máquina y con guantes puestos — pedirlo también acá le
      // reclama al supervisor un dato que el operario declara mejor. Dos: el
      // botón «Omitir» de este mismo diálogo ya se lo saltaba, así que el
      // requisito era obligatorio y evitable a la vez, que es la peor de las
      // dos cosas.
      //
      // Cuando SÍ hay un lote escaneado el consumo va antes del avance: si el
      // lote está retenido o el certificado venció, la OT no tiene que haberse
      // movido. Esa verificación no se relaja; lo que se relajó es exigirla.
      if (consume && consumo) {
        const res = await fetch('/api/lots/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            qr: consumo.qr,
            ot_id: ot.id,
            quantity: consumo.sheets,
            stage: targetStatus,
            override_reason: consumo.overrideReason,
          }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => null);
          throw new Error(b?.error ?? 'No se pudo registrar el papel que sale.');
        }
      }

      await onConfirm(movedQuantity, closure.payload);
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Error al guardar costos',
        description: err.message || 'Intente de nuevo',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const devColor = (pct: number) => {
    if (pct > 5) return 'text-red-400';
    if (pct < -5) return 'text-green-400';
    return 'text-muted-foreground';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Registro de Costos Reales — {ot.ot_number}
          </DialogTitle>
          {/* DialogDescription renderiza un <p>, y Badge un <div> — un <div>
              dentro de un <p> es HTML inválido y React lo marcaba con un
              error de hidratación cada vez que se abría este diálogo
              (auditoría 2026-09). El texto sigue siendo la descripción
              accesible del diálogo; los Badge pasan a ser hermanos suyos
              dentro del mismo contenedor, no hijos de un párrafo. */}
          <div className="flex items-center gap-4">
            <DialogDescription>
              {ot.client_name}
              {ot.product_name && <> • {ot.product_name}</>}
            </DialogDescription>
            <Badge variant="outline" className="ml-2">
              {/* El enum crudo —`pre_press`— llegaba a la pantalla del
                  supervisor. `otStatusLabel` existe desde hace semanas. */}
              Paso actual: {otStatusLabel(ot.status)}
            </Badge>
            <ArrowRight className="h-4 w-4" />
            <Badge className="bg-primary text-primary-foreground">{targetStatusLabel}</Badge>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-2 px-1 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {needsClosure
            ? 'Todo lo de abajo es opcional y se puede completar después. Lo que no se llene queda pendiente y se pide antes de despachar la OT.'
            : 'Registre los costos reales incurridos en esta etapa antes de avanzar la OT. Los valores presupuestados se muestran como referencia.'}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3 p-3 rounded-md border border-border bg-muted/30">
          <div className="text-sm">
            <p className="font-medium text-foreground">Cantidad a mover al siguiente proceso</p>
            <p className="text-xs text-muted-foreground mt-1">
              Total OT: <span className="font-semibold text-foreground">{totalQuantity}</span> uds.
              {' '}→{' '}
              Mover: <span className="font-semibold text-primary">{movedQuantity}</span> uds.
              {' '}→{' '}
              Queda: <span className="font-semibold text-amber-500">{Math.max(0, totalQuantity - movedQuantity)}</span> uds.
            </p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Unidades que avanzan</Label>
            <Input
              type="number"
              min={1}
              max={totalQuantity}
              value={movedQuantity}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (Number.isNaN(raw)) return;
                setMovedQuantity(Math.max(1, Math.min(totalQuantity, raw)));
              }}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* El cierre va arriba de los costos porque es lo obligatorio, y
            pegado a la cantidad porque las horas son las de ESTA pasada. Nunca
            coincide con el bloque de material: ese sale de bodega, y bodega no
            es una etapa de taller. */}
        {needsClosure && (
          <CierreDeEtapa
            otId={ot.id}
            stage={ot.status}
            enteredSheets={enteredSheets}
            estimatedHours={estimatedHours}
            value={cierre}
            onChange={setCierre}
            showErrors={showCierreErrors}
          />
        )}

        {/* Sólo cuando el salto saca papel de bodega. Las etapas posteriores
            mueven producto semiterminado y volver a descontar contaría dos
            veces el mismo pliego. */}
        {consume && (
          <MaterialQueAvanza
            movedUnits={movedQuantity}
            totalUnits={totalQuantity}
            totalSheets={Number((ot as { calc_sheets?: number }).calc_sheets ?? 0) || totalQuantity}
            // El arreglo NO sale de una columna —no existe— sino de la misma
            // función que lo cobra. Leerlo de `ot.setup_sheets` daba siempre
            // cero y la regla del primer fragmento no se disparaba nunca.
            makeReadySheets={makeReadySheets(
              pressPasses(colorCount(otAny.color_front), colorCount(otAny.color_back), otAny.press_bodies ?? 4),
              { finish_troquelado: !!otAny.finish_troquelado, finish_hot_stamping: !!otAny.finish_hot_stamping },
            )}
            onChange={setConsumo}
          />
        )}

        <ScrollArea className="flex-1 max-h-[50vh] pr-2">
          <div className="space-y-3">
            {lines.map((line, idx) => {
              const total = getLineTotal(line);
              const estTotal = getEstTotal(line);
              const dev = estTotal > 0 ? ((total - estTotal) / estTotal) * 100 : 0;

              return (
                <div
                  key={idx}
                  className={`grid grid-cols-[60px_1fr_120px_90px_80px_100px_100px_36px] gap-2 items-end p-2 rounded-md border ${
                    line._is_merma_auto
                      ? 'bg-amber-500/10 border-amber-500/40'
                      : 'bg-card border-border'
                  }`}
                >
                  {/* Code */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Código</Label>
                    <Input
                      value={line.operation_code}
                      onChange={(e) => updateLine(idx, 'operation_code', e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      Descripción
                      {line._is_merma_auto && (
                        <Badge
                          variant="outline"
                          className={
                            line._merma_sin_costo
                              ? 'border-red-500/50 text-red-600 dark:text-red-400 text-[10px] px-1.5 py-0 h-4'
                              : 'border-amber-500/50 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0 h-4'
                          }
                          title={
                            line._merma_sin_costo
                              ? 'Se agregó sola al declarar merma, pero esta OT no tiene presupuesto de papel del cual sacar un costo — completalo a mano'
                              : 'Se agregó sola al declarar merma en el cierre de etapa — revisala'
                          }
                        >
                          {line._merma_sin_costo ? 'merma · sin costo' : 'merma · auto'}
                        </Badge>
                      )}
                    </Label>
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(idx, 'description', e.target.value)}
                      className="h-8 text-xs"
                      placeholder="Nombre del ítem..."
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Categoría</Label>
                    <Select
                      value={line.category}
                      onValueChange={(v) => updateLine(idx, 'category', v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATION_CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Quantity */}
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Cant.{' '}
                      {line._est_qty !== undefined && (
                        <span className="text-muted-foreground/60">({line._est_qty})</span>
                      )}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={line.quantity || ''}
                      onChange={(e) => updateLine(idx, 'quantity', Number(e.target.value))}
                      className="h-8 text-xs"
                    />
                  </div>

                  {/* Unit */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Unidad</Label>
                    <Input
                      value={line.unit}
                      onChange={(e) => updateLine(idx, 'unit', e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  {/* Unit Cost */}
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      C/U{' '}
                      {line._est_unit_cost !== undefined && (
                        <span className="text-muted-foreground/60">
                          (${line._est_unit_cost.toLocaleString()})
                        </span>
                      )}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={line.unit_cost || ''}
                      onChange={(e) => updateLine(idx, 'unit_cost', Number(e.target.value))}
                      className="h-8 text-xs"
                    />
                  </div>

                  {/* Total + Deviation */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Total</Label>
                    <div className="h-8 flex flex-col justify-center">
                      <span className="text-xs font-medium">${total.toLocaleString()}</span>
                      {estTotal > 0 && (
                        <span className={`text-[10px] ${devColor(dev)}`}>
                          {dev > 0 ? '+' : ''}{Math.round(dev)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Remove */}
                  <div className="flex items-end pb-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length <= 1}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Aviso de la línea de merma: no bloquea, pero tampoco se calla —
            justo lo que le faltaba al "Total Real: $0" de antes. Dos casos
            distintos, dos avisos distintos: uno dice "revisá el número que ya
            te di", el otro dice "no pude darte un número, ponelo vos". */}
        {lines.some((l) => l._is_merma_auto && !l._merma_sin_costo) && (
          <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Se agregó una línea de merma automáticamente, tasada con el costo del papel presupuestado — revisala antes de guardar.
          </p>
        )}
        {lines.some((l) => l._merma_sin_costo) && (
          <p className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Se agregó la línea de merma, pero esta OT no tiene presupuesto de papel del cual sacarle un costo — quedó en $0. Completá el costo a mano antes de guardar.
          </p>
        )}

        {/* Add line + Totals */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-3 w-3 mr-1" />
            Agregar ítem
          </Button>
          <div className="text-right space-y-0.5">
            {estGrandTotal > 0 && (
              <p className="text-xs text-muted-foreground">
                Presupuestado: <span className="font-medium">${estGrandTotal.toLocaleString()}</span>
              </p>
            )}
            <p className="text-sm font-bold">
              Total Real: <span className="text-primary">${grandTotal.toLocaleString()}</span>
            </p>
            {estGrandTotal > 0 && (
              <p className={`text-xs font-medium ${devColor(overallDev)}`}>
                Desviación: {overallDev > 0 ? '+' : ''}{Math.round(overallDev)}%
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          {isVistoGood && (
            <div className="flex-1 flex items-center gap-3 mr-2">
              <label
                htmlFor="ot-product-image"
                className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md px-2.5 py-1.5 hover:border-primary/50"
              >
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="preview" className="w-6 h-6 object-cover rounded" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )}
                {imageFile ? imageFile.name.slice(0, 20) + (imageFile.name.length > 20 ? '…' : '') : 'Foto del producto'}
              </label>
              <input
                id="ot-product-image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0] ?? null;
                  setImageFile(f);
                  if (f) {
                    const reader = new FileReader();
                    reader.onload = ev => setImagePreview(ev.target?.result as string);
                    reader.readAsDataURL(f);
                  } else {
                    setImagePreview(null);
                  }
                }}
              />
              {imageFile && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-red-400 transition-colors"
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="text-muted-foreground"
          >
            <SkipForward className="h-4 w-4 mr-1" />
            {/* Omitir siempre omitió sólo los COSTOS. Decirlo evita leer el
                botón como «avanzar sin llenar nada», que ahora sería falso. */}
            {needsClosure ? 'Omitir costos' : 'Omitir'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSaveAndAdvance}
            disabled={saving}
            className="bg-primary hover:bg-primary/90"
          >
            {saving ? 'Guardando...' : 'Guardar y Avanzar'}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
