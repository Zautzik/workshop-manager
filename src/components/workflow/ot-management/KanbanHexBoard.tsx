'use client';

import { useRef, type Dispatch, type SetStateAction } from 'react';
import { otStatusLabel } from '@/lib/status-labels';
import { HEX_CLIP, KANBAN_GROUPS, getStatusInfo } from './kanban-constants';

export function KanbanHexBoard({
  boardWrapRef,
  isMobile,
  HEX_W,
  HEX_H,
  INSET_X,
  INSET_Y,
  POSITIONS,
  CANVAS_W,
  CANVAS_H,
  getByStatus,
  dragOverCol,
  draggingId,
  openPasses,
  splitGroupTotals,
  onDragStart,
  onDragEnd,
  onColEnter,
  onColLeave,
  onColOver,
  onColDrop,
  onHover,
  onOTSelect,
  onPasadasOpen,
}: {
  boardWrapRef: React.RefObject<HTMLDivElement>;
  isMobile: boolean;
  HEX_W: number;
  HEX_H: number;
  INSET_X: number;
  INSET_Y: number;
  POSITIONS: { x: number; y: number }[];
  CANVAS_W: number;
  CANVAS_H: number;
  getByStatus: (key: string) => any[];
  dragOverCol: string | null;
  draggingId: string | null;
  openPasses: Record<string, string[]>;
  splitGroupTotals: Record<string, number>;
  onDragStart: (e: React.DragEvent, ot: any) => void;
  onDragEnd: () => void;
  onColEnter: (e: React.DragEvent, key: string) => void;
  onColLeave: (e: React.DragEvent, key: string) => void;
  onColOver: (e: React.DragEvent) => void;
  onColDrop: (e: React.DragEvent, key: string) => void;
  onHover: Dispatch<SetStateAction<{ ot: any; rect: DOMRect } | null>>;
  onOTSelect: (ot: any) => void;
  onPasadasOpen: (ot: any) => void;
}) {
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div
      ref={boardWrapRef}
      style={{ width: '100%', overflow: isMobile ? 'visible' : 'hidden', display: 'flex', justifyContent: 'center', paddingBottom: 4 }}
    >
      <div style={{ width: CANVAS_W, height: CANVAS_H, position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* Flow arrows between process hexes (desktop beehive only) */}
          {!isMobile && (
          <svg width={CANVAS_W} height={CANVAS_H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, opacity: 0.8 }}>
            <defs>
              <marker id="flowArrowHead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <polygon points="0 0, 6 3, 0 6" fill="rgba(148,163,184,0.8)" />
              </marker>
            </defs>
            {[[0, 2], [1, 2], [2, 3], [2, 4], [3, 5], [4, 5]].map(([from, to], idx) => {
              const fromPos = POSITIONS[from as number];
              const toPos = POSITIONS[to as number];
              const x1 = fromPos.x + HEX_W / 2;
              const y1 = fromPos.y + HEX_H / 2;
              const x2 = toPos.x + HEX_W / 2;
              const y2 = toPos.y + HEX_H / 2;
              const dx = x2 - x1, dy = y2 - y1;
              const len = Math.hypot(dx, dy) || 1;
              const pad = 54;
              return (
                <line
                  key={`flow-${idx}`}
                  x1={x1 + (dx / len) * pad} y1={y1 + (dy / len) * pad}
                  x2={x2 - (dx / len) * pad} y2={y2 - (dy / len) * pad}
                  stroke="rgba(148,163,184,0.8)" strokeWidth="2.5" strokeDasharray="6 5" markerEnd="url(#flowArrowHead)"
                />
              );
            })}
          </svg>
          )}

          {KANBAN_GROUPS.map((group, idx) => {
            const { x, y } = POSITIONS[idx];
            const count = group.stages.reduce((s, k) => s + getByStatus(k).length, 0);
            return (
              <div
                key={group.id}
                style={{
                  position: 'absolute', left: x, top: y,
                  width: HEX_W, height: HEX_H, zIndex: 2,
                  filter: `drop-shadow(0 4px 16px rgb(${group.rgb} / 0.42))`,
                  transition: 'filter 0.18s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.filter = `drop-shadow(0 6px 22px rgb(${group.rgb} / 0.68))`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.filter = `drop-shadow(0 4px 16px rgb(${group.rgb} / 0.42))`; }}
              >
                {/* outer hex = border colour */}
                <div style={{ position: 'absolute', inset: 0, clipPath: HEX_CLIP, background: `rgb(${group.rgb})` }}>
                  {/* inner hex = fill */}
                  <div style={{ position: 'absolute', inset: '7px', clipPath: HEX_CLIP, background: 'var(--hex-fill, #ffffff)' }}>
                    {/* -- Content: title + horizontal sub-step columns -- */}
                    <div style={{ position: 'absolute', left: INSET_X, right: INSET_X, top: INSET_Y, bottom: INSET_Y, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      {/* Title + count */}
                      <div style={{ flexShrink: 0, textAlign: 'center', padding: '4px 4px 3px', borderBottom: `3px solid rgb(${group.rgb})` }}>
                        <div style={{ fontSize: 20, fontWeight: 900, color: `rgb(${group.rgb})`, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {group.label}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: `rgb(${group.rgb} / 0.7)`, lineHeight: 1.2, marginTop: 1 }}>
                          {count} {count === 1 ? 'orden' : 'ordenes'}
                        </div>
                      </div>
                      {/* Sub-step columns -- colored header tab + cards body, each a drop target */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
                        {(group.stages as readonly string[]).map((stageKey, sIdx) => {
                          const stInfo = getStatusInfo(stageKey);
                          const stageOTs = getByStatus(stageKey);
                          const isOver = dragOverCol === stageKey && !!draggingId;
                          return (
                            <div
                              key={stageKey}
                              style={{
                                flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0,
                                borderLeft: sIdx > 0 ? `1px solid rgb(${group.rgb} / 0.25)` : 'none',
                                background: isOver ? `rgb(${group.rgb} / 0.10)` : 'transparent',
                                transition: 'background 0.1s',
                              }}
                              onDragEnter={e => onColEnter(e, stageKey)}
                              onDragLeave={e => onColLeave(e, stageKey)}
                              onDragOver={onColOver}
                              onDrop={e => onColDrop(e, stageKey)}
                            >
                              <div style={{ flexShrink: 0, textAlign: 'center', background: `rgb(${group.rgb})`, padding: '3px 3px' }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.05, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'normal', overflowWrap: 'break-word' }}>
                                  {stInfo.labelEs}
                                </div>
                                <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.85)', lineHeight: 1.1 }}>
                                  {stageOTs.length}
                                </div>
                              </div>
                              <div style={{ flex: 1, overflowY: 'auto', padding: '5px 3px', display: 'flex', flexWrap: 'wrap', gap: 4, alignContent: 'flex-start', justifyContent: 'center' }}>
                                {isOver && stageOTs.length === 0 && (
                                  <div style={{ width: '100%', border: `1px dashed rgb(${group.rgb} / 0.5)`, borderRadius: 3, textAlign: 'center', fontSize: 16, color: `rgb(${group.rgb})`, padding: '3px 0', marginTop: 2 }}>↓</div>
                                )}
                                {stageOTs.map(ot => {
                                  const isDragging = draggingId === ot.id;
                                  const isPartial = !!ot.is_partial;
                                  const splitTotal = ot.split_group_id ? Number(splitGroupTotals[ot.split_group_id] ?? 0) : 0;
                                  const splitPct = isPartial && splitTotal > 0
                                    ? Math.max(1, Math.min(100, Math.round((Number(ot.quantity ?? 0) / splitTotal) * 100)))
                                    : null;
                                  const priDot = ot.priority >= 8 ? '#ef4444' : ot.priority >= 5 ? '#f59e0b' : `rgb(${group.rgb})`;
                                  // Las etapas por las que pasó y de las que todavía se
                                  // deben horas. Van al `title` para que el motivo esté a
                                  // un hover, no sólo el hecho de que algo falta.
                                  const debe: string[] = openPasses[ot.id] ?? [];
                                  const MINI_W = Math.round(HEX_W * 0.2);
                                  const MINI_H = Math.round(MINI_W * 0.88);
                                  return (
                                    <div
                                      key={ot.id}
                                      draggable
                                      onDragStart={e => onDragStart(e, ot)}
                                      onDragEnd={onDragEnd}
                                      onMouseEnter={e => {
                                        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                        hoverTimerRef.current = setTimeout(() => onHover({ ot, rect }), 220);
                                      }}
                                      onMouseLeave={() => {
                                        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                                        hoverTimerRef.current = setTimeout(() => onHover(p => p?.ot.id === ot.id ? null : p), 80);
                                      }}
                                      onClick={() => { if (!isDragging) onOTSelect(ot); }}
                                      title={
                                        `${ot.ot_number} - ${stInfo.labelEs} - ${ot.client_name}` +
                                        (debe.length
                                          ? `
Faltan horas de: ${debe.map(otStatusLabel).join(', ')}`
                                          : '')
                                      }
                                      style={{
                                        width: MINI_W, height: MINI_H, clipPath: HEX_CLIP,
                                        background: isDragging ? `rgb(${group.rgb} / 0.10)` : isPartial ? `rgb(${group.rgb} / 0.09)` : `rgb(${group.rgb} / 0.20)`,
                                        cursor: 'grab', opacity: isDragging ? 0.3 : isPartial ? 0.6 : 1,
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        position: 'relative', flexShrink: 0,
                                        outline: isPartial ? `1.5px dashed rgb(${group.rgb} / 0.55)` : 'none',
                                      }}
                                    >
                                      <div style={{ position: 'absolute', top: 7, left: '50%', transform: 'translateX(-50%)', width: 6, height: 6, borderRadius: '50%', background: priDot }} />
                                      {debe.length > 0 && (
                                        // Un anillo ámbar arriba a la derecha: se lee de un
                                        // vistazo sin robarle sitio al número de OT, que es
                                        // lo único que el hexágono tiene que decir siempre.
                                        //
                                        // Y es la puerta, no sólo el aviso: la deuda se paga
                                        // donde se ve. `draggable={false}` y `stopPropagation`
                                        // para que el clic no arranque un arrastre ni abra la
                                        // OT — el hexágono entero ya hace las dos cosas.
                                        <button
                                          type="button"
                                          draggable={false}
                                          onDragStart={e => e.preventDefault()}
                                          onClick={e => { e.stopPropagation(); onPasadasOpen(ot); }}
                                          title={`Faltan horas de: ${debe.map(otStatusLabel).join(', ')}`}
                                          aria-label={`Cerrar pasadas pendientes de ${ot.ot_number}`}
                                          style={{
                                            position: 'absolute', top: 4, right: '14%',
                                            width: 13, height: 13, borderRadius: '50%',
                                            border: '2px solid #f59e0b', background: 'transparent',
                                            cursor: 'pointer', padding: 0, zIndex: 2,
                                          }}
                                        />
                                      )}
                                      <span style={{ fontSize: 16, fontWeight: 800, color: `rgb(${group.rgb})`, textAlign: 'center', lineHeight: 1.05, padding: '0 4px', marginTop: 6, overflow: 'hidden', maxWidth: '100%', wordBreak: 'break-all' }}>
                                        {ot.ot_number.replace(/^OT-?/i, '')}
                                      </span>
                                      {isPartial && (
                                        <span style={{ fontSize: 16, fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>
                                          {splitPct !== null ? `${splitPct}%` : 'PAR'}
                                        </span>
                                      )}
                                      {ot.product_image_url && (
                                        <div style={{ position: 'absolute', inset: 0, clipPath: HEX_CLIP, backgroundImage: `url(${ot.product_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.18 }} />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
