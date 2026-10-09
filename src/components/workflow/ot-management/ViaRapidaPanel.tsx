'use client';

import { getStatusInfo } from './kanban-constants';

export function ViaRapidaPanel({
  filteredOTs,
  draggingId,
  onDragStart,
  onDragEnd,
  onOTSelect,
  canvasW,
}: {
  filteredOTs: any[];
  draggingId: string | null;
  onDragStart: (e: React.DragEvent, ot: any) => void;
  onDragEnd: () => void;
  onOTSelect: (ot: any) => void;
  canvasW: number;
}) {
  const urgentOTs = filteredOTs.filter(ot => ot.priority >= 8 && ot.status !== 'completed');
  return (
    <div style={{ width: '100%', maxWidth: canvasW, margin: '6px auto 0' }}>
      <div style={{
        background: 'linear-gradient(90deg, rgba(239,68,68,0.13) 0%, rgba(234,179,8,0.10) 100%)',
        border: '1.5px solid rgba(239,68,68,0.45)',
        borderRadius: 10, padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#ef4444', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          Vía Rápida — Urgentes
        </span>
        {urgentOTs.length === 0 ? (
          <span className="text-muted-foreground" style={{ fontSize: 16, fontStyle: 'italic' }}>Sin OTs urgentes</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {urgentOTs.map(ot => {
              const stInfo = getStatusInfo(ot.status);
              const isDragging = draggingId === ot.id;
              return (
                <div
                  key={ot.id}
                  draggable
                  onDragStart={e => onDragStart(e, ot)}
                  onDragEnd={onDragEnd}
                  onClick={() => { if (!isDragging) onOTSelect(ot); }}
                  title={`${ot.ot_number} - ${stInfo.labelEs} - ${ot.client_name}`}
                  style={{
                    background: isDragging ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.18)',
                    border: '1px solid rgba(239,68,68,0.5)',
                    borderRadius: 7, padding: '4px 10px', cursor: 'grab',
                    opacity: isDragging ? 0.3 : 1,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#ef4444' }}>{ot.ot_number}</span>
                  <span className="text-muted-foreground" style={{ fontSize: 16 }}>{stInfo.labelEs}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
