'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from '@tanstack/react-query';
import { useOTs } from "@/hooks/use-workflow-queries";
import { queryKeys } from "@/hooks/use-workflow-queries";
import { useToast } from "@/hooks/use-toast";
import { UnifiedOTWizard } from "./UnifiedOTWizard";
import { useRouter, useSearchParams } from "next/navigation";
import { EditBudgetWizard } from "./EditBudgetWizard";
import { EditOTDialog } from "./EditOTDialog";
import { ComprasDialog } from "./ComprasDialog";
import { RealCostEntryDialog } from "./RealCostEntryDialog";
import { OTHoverCard } from "./OTHoverCard";
import { SplitOTDialog } from "./SplitOTDialog";
// El recorrido real de una OT vive en el motor de estados: el prensista que
// manda «fin, entro OT 40965» tiene que llegar a la misma etapa a la que lo
// llevaría este tablero.
import { naturalNextStatuses, type OTWorkflowStatus } from '@/lib/ot-state-machine';
import { useQuery } from '@tanstack/react-query';
import type { StageReportPayload } from './CierreDeEtapa';
import { PasadasPendientes } from './PasadasPendientes';
import {
  STATUS_FLOW, KANBAN_GROUPS, BOARD_PAD, LANE_RESERVE, WIDTH_UNITS, HEIGHT_UNITS, MOBILE_MAX_W, MOBILE_GAP,
  getStatusInfo, getAllNextStatuses,
} from './ot-management/kanban-constants';
import { KanbanToolbar } from './ot-management/KanbanToolbar';
import { KanbanHexBoard } from './ot-management/KanbanHexBoard';
import { ViaRapidaPanel } from './ot-management/ViaRapidaPanel';
import { RollbackDialog, type RollbackTarget } from './ot-management/RollbackDialog';

interface OTManagementProps {
  onOTSelect: (ot: any) => void;
}

export function OTManagement({ onOTSelect }: OTManagementProps) {
  const { data: otsQuery = [], isFetching: otsFetching, refetch: refetchOTs } = useOTs();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // El Tablero mostraba "0 órdenes" en todas las columnas por unos segundos
  // después de guardar en Compras (auditoría 2026-09, Corrida 1) — nunca se
  // pudo reproducir de nuevo con sondeo cronometrado sobre el flujo exacto
  // (esta sesión, verificación de la Corrida 1), y `updateOTStatus` nunca
  // vacía la caché: sólo mapea las OT existentes. Aun sin una causa raíz
  // confirmada, mostrar un tablero vacío mientras HAY una lectura en camino
  // es el síntoma exacto que se reportó, así que se blinda el render: si una
  // recarga en curso trae momentáneamente una lista vacía, se sigue
  // mostrando la última lista con datos hasta que la recarga termine de
  // verdad. Un tablero genuinamente vacío (0 OT reales) se sigue mostrando
  // como vacío en cuanto la recarga se asienta.
  const lastNonEmptyOTs = useRef<any[]>([]);
  if (otsQuery.length > 0) lastNonEmptyOTs.current = otsQuery;
  const ots = otsQuery.length === 0 && otsFetching ? lastNonEmptyOTs.current : otsQuery;

  // ── Lo que cada OT debe ──────────────────────────────────────────────────
  //
  // Mover una tarjeta ya no exige declarar cuánto tomó la etapa: eso frenaba el
  // taller sin conseguir el dato. Lo que reemplaza al bloqueo es que la deuda se
  // VEA — un punto ámbar mientras la pasada siga abierta. Una obligación
  // invisible no es una obligación, es una sorpresa el día del despacho.
  const { data: openPasses = {}, refetch: refetchOpenPasses } = useQuery<Record<string, string[]>>({
    queryKey: ['ot-open-passes'],
    queryFn: async () => {
      const res = await fetch('/api/ots/open-passes', { credentials: 'include' });
      if (!res.ok) return {};
      return (await res.json()) ?? {};
    },
  });

  // Llegar con `?asistente=1` abre el asistente derecho. Lo usa el botón
  // «Completar todos los datos» de la cotización: sin esto el vendedor caía en
  // el tablero y tenía que buscar «Nueva OT», que es un paso donde se pierde a
  // la mitad de la gente.
  //
  // Va como estado INICIAL y no como efecto. Un efecto que llama a `setState`
  // provoca un render en cascada —y lo marca el linter— pero sobre todo tendría
  // otro defecto: volvería a abrir el asistente cada vez que el parámetro
  // cambiara, incluso después de que el usuario lo cerró.
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createFlow,      setCreateFlow]      = useState<'none' | 'wizard'>(
    () => (searchParams?.get('asistente') === '1' ? 'wizard' : 'none'),
  );
  const [showEditDialog,  setShowEditDialog]  = useState(false);
  const [editingOT,       setEditingOT]       = useState<any>(null);
  const [budgetEditOT,    setBudgetEditOT]    = useState<any>(null);
  // Llegar con `?editar=<otId>` abre EditBudgetWizard (montaje, máquina,
  // operaciones) para esa OT. Antes no existía ninguna forma de llegar acá:
  // `EditBudgetWizard` estaba importado y montado pero nada en este archivo
  // llamaba `setBudgetEditOT` con una OT real -- código huérfano, encontrado
  // siguiendo el reclamo "una OT de Cotización nunca puede completar montaje
  // ni operaciones" (auditoría 2026-08-31). `FichaPrePrensa` linkea acá.
  //
  // No puede ser un estado inicial como `asistente=1`: la OT hay que
  // encontrarla en `ots`, que todavía no cargó en el primer render. Un `ref`
  // evita reabrir el editor si el usuario ya lo cerró y `ots` se revalida.
  const editarAplicado = useRef(false);
  const editarParam = searchParams?.get('editar');
  useEffect(() => {
    if (!editarParam || editarAplicado.current) return;
    const target = (ots as any[]).find((o) => o.id === editarParam);
    if (target) {
      setBudgetEditOT(target);
      editarAplicado.current = true;
    }
  }, [editarParam, ots]);
  const [compraOT,        setCompraOT]        = useState<any>(null);
  const [costEntryOT,     setCostEntryOT]     = useState<any>(null);
  const [costEntryTarget, setCostEntryTarget] = useState<{ key: string; label: string } | null>(null);
  const [splitOT,         setSplitOT]         = useState<any>(null);
  const [pasadasOT,       setPasadasOT]       = useState<any>(null);
  const [splitTarget,     setSplitTarget]     = useState<{ key: string; label: string } | null>(null);
  const [rollbackTarget,  setRollbackTarget]  = useState<RollbackTarget | null>(null);
  const [searchTerm,      setSearchTerm]      = useState("");
  const [showCompleted,   setShowCompleted]   = useState(false);
  const [draggedOT,       setDraggedOT]       = useState<any>(null);
  const [dragOverCol,     setDragOverCol]     = useState<string | null>(null);
  const [draggingId,      setDraggingId]      = useState<string | null>(null);
  const [hoveredOT,       setHoveredOT]       = useState<{ ot: any; rect: DOMRect } | null>(null);
  const dragCounter = useRef<Record<string, number>>({});
  // Board scales to fill the available box (both axes) — never scrolls, and
  // grows to use the freed vertical space instead of leaving a gap below.
  const boardWrapRef = useRef<HTMLDivElement>(null);
  // Measure the frame the beehive must fill: free width (the board's own width)
  // and free height (its distance to the viewport bottom, minus the urgent lane).
  // The cluster grows into reclaimed vertical space instead of leaving a void.
  const [frame, setFrame] = useState({ w: 1280, h: 680 });
  useLayoutEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const top = el.getBoundingClientRect().top;
      const h = window.innerHeight - top - LANE_RESERVE;
      setFrame({ w, h: Math.max(h, 420) });
    };
    update();
    raf = requestAnimationFrame(update); // catch late layout (fonts, async content)
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  // A 3.25-wide beehive can't live on a phone, so below the breakpoint the board
  // becomes a single full-width column of stage hexes that flows top -> bottom and
  // scrolls vertically (natural on a tall screen). Above it, the desktop beehive
  // fills both axes with no zoom.
  const isMobile = frame.w < MOBILE_MAX_W;
  const HEX_W = isMobile ? frame.w - BOARD_PAD * 2 : (frame.w - BOARD_PAD * 2) / WIDTH_UNITS;
  const HEX_H = isMobile ? Math.round(HEX_W * 0.72) : (frame.h - BOARD_PAD * 2) / HEIGHT_UNITS;
  const INSET_X = HEX_W * 0.12;
  const INSET_Y = HEX_H * 0.06;
  const X_STEP = isMobile ? 0 : HEX_W * 0.75;
  const Y_STEP = isMobile ? HEX_H + MOBILE_GAP : HEX_H * 0.5;
  const POSITIONS = isMobile
    ? KANBAN_GROUPS.map((_, i) => ({ x: 0, y: i * Y_STEP }))
    : [
        { x: 0,          y: 0 },      // Diseño
        { x: 0,          y: HEX_H },  // Compras & Bodega
        { x: X_STEP,     y: Y_STEP }, // Corte & Impresión
        { x: X_STEP * 2, y: 0 },      // Acabados
        { x: X_STEP * 2, y: HEX_H },  // Terminación
        { x: X_STEP * 3, y: Y_STEP }, // Despacho
      ];
  const CANVAS_W = isMobile ? HEX_W : X_STEP * 3 + HEX_W;
  const CANVAS_H = isMobile
    ? KANBAN_GROUPS.length * HEX_H + (KANBAN_GROUPS.length - 1) * MOBILE_GAP
    : HEX_H * 2;

  const updateOTStatus = async (
    otId: string,
    newStatus: string,
    rollback = false,
    stageReport: StageReportPayload | null = null,
  ) => {
    // 1. Snapshot the current list before we touch anything.
    const previousOTs = queryClient.getQueryData<any[]>(queryKeys.ots);

    // 2. Move the card immediately — 0 ms perceived latency.
    queryClient.setQueryData<any[]>(queryKeys.ots, (old = []) =>
      old.map(ot => ot.id === otId ? { ...ot, status: newStatus } : ot)
    );

    const res = await fetch(`/api/ots/${otId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to_status: newStatus,
        reason: rollback ? 'kanban_rollback' : 'kanban_advance',
        rollback,
        // El cierre de la etapa viaja con el movimiento, no en un pedido
        // aparte: si fueran dos, la que falla deja la OT movida sin horas.
        stage_report: stageReport,
      }),
    });

    if (!res.ok) {
      // 3. Server rejected the transition — snap back to the previous state.
      queryClient.setQueryData(queryKeys.ots, previousOTs);
      const body = await res.json().catch(() => null);
      toast({ title: "Error al actualizar estado", description: body?.error ?? 'Request failed', variant: "destructive" });
      return;
    }

    // El servidor avisa cuando la OT se movió pero su cierre no se pudo
    // guardar. Es lo único que el usuario puede volver a cargar, así que no se
    // esconde detrás del toast de éxito.
    const body = await res.json().catch(() => null);
    if (body?.warning) {
      toast({ title: 'OT avanzada, cierre no guardado', description: body.warning, variant: 'destructive' });
    } else {
      toast({ title: rollback ? "OT retrocedida" : "OT avanzada", description: `→ ${getStatusInfo(newStatus).labelEs}` });
    }
    // 4. Background refetch to pull any server-computed fields (updated_at, etc.).
    refetchOTs();
    refetchOpenPasses();
  };

  const requestAdvance = (ot: any, key: string, label: string) => {
    // Salir de Pre-Prensa NO es registrar costos.
    //
    // El diálogo de costos reales pregunta qué se gastó en la etapa que termina.
    // En Pre-Prensa todavía no se gastó nada: no se compró papel ni se grabó una
    // plancha — para eso justamente falta el visto bueno. Lo que decide si la OT
    // puede avanzar es si la FICHA está completa, porque lo que sigue es mandarle
    // una prueba al cliente y no se puede probar lo que no se sabe.
    //
    // Se manda a Pre-Prensa, que enumera lo que falta con su motivo y el enlace
    // a donde se completa.
    if (ot.status === 'pre_press') {
      router.push('/operaciones/pre-prensa');
      return;
    }

    // Salir de Compras TAMPOCO es registrar costos.
    //
    // Lo que ocurre en ese paso es CONSEGUIR lo que la OT necesita, y no todo
    // se compra: un pantone especial se pide aparte, el polilaminado lo hace un
    // tercero, y muy seguido el papel ya está en bodega de un trabajo anterior.
    // El diálogo de costos preguntaba «cuánto gastaste» —la pregunta
    // equivocada— y además dejaba sin formarse la cadena que una auditoría FSSC
    // pide reconstruir: pliego → lote → OC → proveedor → certificado.
    if (ot.status === 'paper_purchase') {
      setCompraOT(ot);
      return;
    }

    setCostEntryOT(ot); setCostEntryTarget({ key, label });
  };
  const confirmAdvance = async (movedQuantity: number, stageReport: StageReportPayload | null) => {
    if (!costEntryOT || !costEntryTarget) return;

    const totalQty = Number(costEntryOT.quantity ?? 0);
    const shouldSplit = totalQty > 0 && movedQuantity > 0 && movedQuantity < totalQty;

    if (shouldSplit) {
      const res = await fetch(`/api/ots/${costEntryOT.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advance_quantity: movedQuantity,
          target_status: costEntryTarget.key,
          stage_report: stageReport,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast({ title: 'Error al dividir OT', description: body?.error ?? 'Request failed', variant: 'destructive' });
        return;
      }

      const body = await res.json().catch(() => null);
      if (body?.warning) {
        toast({ title: 'OT dividida, cierre no guardado', description: body.warning, variant: 'destructive' });
      } else {
        toast({
          title: 'OT dividida y avanzada',
          description: `${costEntryOT.ot_number}: ${movedQuantity} uds. → ${costEntryTarget.label}`,
        });
      }
      refetchOTs();
      refetchOpenPasses();
    } else {
      await updateOTStatus(costEntryOT.id, costEntryTarget.key, false, stageReport);
    }

    setCostEntryOT(null);
    setCostEntryTarget(null);
  };
  const confirmRollback = () => {
    if (rollbackTarget) updateOTStatus(rollbackTarget.ot.id, rollbackTarget.key, true);
    setRollbackTarget(null);
  };

  const filteredOTs = (ots as any[]).filter((ot: any) => {
    if (!showCompleted && ot.status === 'completed') return false;

    return (
      ot.ot_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ot.client_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });
  const getByStatus = (key: string) =>
    filteredOTs.filter(ot => ot.status === key).sort((a, b) => b.priority - a.priority);

  // Totals per split group — used to show the % of a partially-advanced OT.
  const splitGroupTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    (ots as any[]).forEach((ot: any) => {
      if (!ot?.split_group_id) return;
      totals[ot.split_group_id] = (totals[ot.split_group_id] ?? 0) + Number(ot.quantity ?? 0);
    });
    return totals;
  }, [ots]);


  // ── drag handlers ────────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, ot: any) => {
    setHoveredOT(null);
    setDraggedOT(ot);
    setDraggingId(ot.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ot.id);
    const ghost = document.createElement('div');
    ghost.textContent = ot.ot_number;
    ghost.style.cssText = 'padding:6px 14px;background:#6366f1;color:#fff;border-radius:8px;font-size:12px;font-weight:700;position:fixed;top:-999px;left:-999px;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 40, 16);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  };

  const onDragEnd = () => {
    setDraggedOT(null); setDraggingId(null); setDragOverCol(null);
    dragCounter.current = {};
  };

  const onColEnter = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    dragCounter.current[key] = (dragCounter.current[key] ?? 0) + 1;
    setDragOverCol(key);
  };
  const onColLeave = (e: React.DragEvent, key: string) => {
    dragCounter.current[key] = Math.max(0, (dragCounter.current[key] ?? 1) - 1);
    if (dragCounter.current[key] === 0) setDragOverCol(p => p === key ? null : p);
  };
  const onColOver  = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const onColDrop  = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    dragCounter.current[key] = 0; setDragOverCol(null);
    if (!draggedOT || draggedOT.status === key) return;
    const fromIdx = STATUS_FLOW.findIndex(s => s.key === draggedOT.status);
    const toIdx   = STATUS_FLOW.findIndex(s => s.key === key);
    const isBackward = toIdx < fromIdx;
    if (isBackward) {
      setRollbackTarget({
        ot: draggedOT,
        key,
        labelEs: getStatusInfo(key).labelEs,
        fromLabelEs: getStatusInfo(draggedOT.status).labelEs,
      });
    } else {
      requestAdvance(draggedOT, key, getStatusInfo(key).labelEs);
    }
    setDraggedOT(null); setDraggingId(null);
  };

  return (
    <div className="space-y-2 overflow-x-hidden">
      {/* Slim toolbar -- search + create (page chrome lives in the back button) */}
      <KanbanToolbar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        showCompleted={showCompleted}
        setShowCompleted={setShowCompleted}
        onCreateNew={() => setCreateFlow('wizard')}
      />

      {/* Floating drag hint */}
      {draggingId && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-xs font-semibold px-4 py-2 rounded-full shadow-xl pointer-events-none select-none">
          Arrastra adelante para avanzar · Arrastra atrás para retroceder (preserva costos)
        </div>
      )}

      {/* -- Honeycomb stage board: 6 process hexes, scales to fit width -- */}
      <KanbanHexBoard
        boardWrapRef={boardWrapRef}
        isMobile={isMobile}
        HEX_W={HEX_W}
        HEX_H={HEX_H}
        INSET_X={INSET_X}
        INSET_Y={INSET_Y}
        POSITIONS={POSITIONS}
        CANVAS_W={CANVAS_W}
        CANVAS_H={CANVAS_H}
        getByStatus={getByStatus}
        dragOverCol={dragOverCol}
        draggingId={draggingId}
        openPasses={openPasses}
        splitGroupTotals={splitGroupTotals}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onColEnter={onColEnter}
        onColLeave={onColLeave}
        onColOver={onColOver}
        onColDrop={onColDrop}
        onHover={setHoveredOT}
        onOTSelect={onOTSelect}
        onPasadasOpen={setPasadasOT}
      />

      {/* Vía Rápida: urgent OTs */}
      <ViaRapidaPanel
        filteredOTs={filteredOTs}
        draggingId={draggingId}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onOTSelect={onOTSelect}
        canvasW={CANVAS_W}
      />

      {/* Rollback confirmation dialog */}
      <RollbackDialog
        rollbackTarget={rollbackTarget}
        onCancel={() => setRollbackTarget(null)}
        onConfirm={confirmRollback}
      />
      {/* Dialogs */}
      {createFlow === 'wizard' && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <UnifiedOTWizard onClose={() => setCreateFlow('none')} onSuccess={() => { refetchOTs(); setCreateFlow('none'); }} />
        </div>
      )}
      {budgetEditOT && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <EditBudgetWizard ot={budgetEditOT} onClose={() => setBudgetEditOT(null)} onSuccess={() => { refetchOTs(); setBudgetEditOT(null); }} />
        </div>
      )}
      {editingOT && (
        <EditOTDialog ot={editingOT} open={showEditDialog} onOpenChange={setShowEditDialog} onSuccess={refetchOTs} />
      )}
      <ComprasDialog
        ot={compraOT}
        open={!!compraOT}
        onOpenChange={(v) => { if (!v) setCompraOT(null); }}
        onDone={(allResolved) => {
          // Guardar la lista de requisitos no es lo mismo que terminar de
          // conseguirlos. Cuando el guardado deja "Todo conseguido", la OT
          // tiene que seguir a la siguiente etapa sola — quedarse en Compras
          // con todo resuelto es exactamente el atasco que encontró la
          // auditoría de 2026-09 (OT 41240, "1 de 1" sin moverse nunca).
          const otId = compraOT?.id;
          const siguiente = compraOT ? naturalNextStatuses(compraOT.status as OTWorkflowStatus)[0] : undefined;
          setCompraOT(null);
          if (allResolved && otId && siguiente) {
            updateOTStatus(otId, siguiente, false, null);
          } else {
            refetchOTs();
          }
        }}
      />

      {costEntryOT && costEntryTarget && (
        <RealCostEntryDialog
          open={!!costEntryOT}
          onOpenChange={(open) => { if (!open) { setCostEntryOT(null); setCostEntryTarget(null); } }}
          ot={costEntryOT}
          targetStatus={costEntryTarget.key}
          targetStatusLabel={costEntryTarget.label}
          onConfirm={confirmAdvance}
        />
      )}
      <PasadasPendientes
        ot={pasadasOT}
        onOpenChange={(open) => { if (!open) setPasadasOT(null); }}
        onClosed={() => { refetchOpenPasses(); refetchOTs(); }}
      />

      {/* OT Hover Card overlay */}
      {hoveredOT && !draggingId && (
        <OTHoverCard
          ot={hoveredOT.ot}
          anchorRect={hoveredOT.rect}
          onClose={() => setHoveredOT(null)}
          nextStatuses={getAllNextStatuses(hoveredOT.ot.status)}
          onAdvance={(ot, key, label) => requestAdvance(ot, key, label)}
          onSplit={(ot, key, label) => { setSplitOT(ot); setSplitTarget({ key, label }); }}
          onEdit={(ot) => { setEditingOT(ot); setShowEditDialog(true); }}
          onEditBudget={(ot) => setBudgetEditOT(ot)}
        />
      )}
      {splitOT && splitTarget && (
        <SplitOTDialog
          open={!!splitOT}
          onOpenChange={(open) => { if (!open) { setSplitOT(null); setSplitTarget(null); } }}
          ot={splitOT}
          targetStatus={splitTarget.key}
          targetStatusLabel={splitTarget.label}
          onSuccess={() => { refetchOTs(); setSplitOT(null); setSplitTarget(null); }}
        />
      )}
    </div>
  );
}
