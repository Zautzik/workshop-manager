'use client';

import { useEffect, useRef } from 'react';
import { ArrowRight, Calendar, Layers, Package, Ruler, DollarSign, Image as ImageIcon } from 'lucide-react';

const STATUS_FLOW_KEYS = [
  'pre_press', 'visto_bueno', 'paper_purchase', 'in_storage',
  'guillotine_first_cut', 'offset_printing', 'digital_printing',
  'die_cutting', 'guillotine_final_cut', 'workshop', 'outsourced',
  'workshop_revision', 'ready_for_delivery', 'in_delivery', 'completed',
];
const STATUS_LABELS: Record<string, string> = {
  pre_press: 'Pre-Prensa', visto_bueno: 'Visto Bueno', paper_purchase: 'Compra Papel',
  in_storage: 'En Bodega', guillotine_first_cut: 'Primer Corte', offset_printing: 'Offset',
  digital_printing: 'Digital', die_cutting: 'Troquelado', guillotine_final_cut: 'Corte Final',
  workshop: 'Taller', outsourced: 'Tercerizado', workshop_revision: 'Revisión',
  ready_for_delivery: 'Listo', in_delivery: 'En Entrega', completed: 'Completado',
};
const STATUS_COLORS: Record<string, string> = {
  pre_press: '#8b5cf6', visto_bueno: '#f59e0b', paper_purchase: '#64748b',
  in_storage: '#06b6d4', guillotine_first_cut: '#f97316', offset_printing: '#a855f7',
  digital_printing: '#d946ef', die_cutting: '#ec4899', guillotine_final_cut: '#ef4444',
  workshop: '#6366f1', outsourced: '#eab308', workshop_revision: '#10b981',
  ready_for_delivery: '#22c55e', in_delivery: '#14b8a6', completed: '#6b7280',
};

interface OTHoverCardProps {
  ot: any;
  anchorRect: DOMRect;
  onClose: () => void;
}

export function OTHoverCard({ ot, anchorRect, onClose }: OTHoverCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Position: try right of anchor, fall back to left if near viewport edge
  const CARD_W = 300;
  const CARD_H = 380;
  const VP_W = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const VP_H = typeof window !== 'undefined' ? window.innerHeight : 800;

  const spaceRight = VP_W - (anchorRect.right + 8);
  const left = spaceRight >= CARD_W
    ? anchorRect.right + 8
    : Math.max(8, anchorRect.left - CARD_W - 8);

  // anchorRect is viewport-relative; card is position:fixed — no scrollY adjustment needed
  let top = anchorRect.top - 8;
  if (top + CARD_H > VP_H) {
    top = Math.max(8, VP_H - CARD_H - 8);
  }

  const statusIdx = STATUS_FLOW_KEYS.indexOf(ot.status);
  const progressPct = statusIdx >= 0 ? Math.round(((statusIdx + 1) / STATUS_FLOW_KEYS.length) * 100) : 0;
  const statusColor = STATUS_COLORS[ot.status] ?? '#6b7280';

  const priColor = ot.priority >= 8 ? '#ef4444' : ot.priority >= 5 ? '#f59e0b' : '#3b82f6';
  const priLabel = ot.priority >= 8 ? 'Urgente' : ot.priority >= 5 ? 'Media' : 'Normal';

  const fmt = (v: any) => (v !== null && v !== undefined && v !== '') ? v : '—';
  const fmtPrice = (v: any) => typeof v === 'number' ? `$${v.toLocaleString('es-CL')}` : '—';
  const fmtDate = (v: any) => {
    if (!v) return '—';
    try { return new Date(v).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' }); }
    catch { return v; }
  };

  return (
    <div
      ref={ref}
      onMouseEnter={() => { /* keep open when hovering card itself */ }}
      onMouseLeave={onClose}
      style={{
        position: 'fixed',
        left,
        top,
        width: CARD_W,
        zIndex: 9999,
        background: 'var(--card, #1a1a2e)',
        border: `1.5px solid ${statusColor}55`,
        borderRadius: 12,
        boxShadow: `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px ${statusColor}22`,
        overflow: 'hidden',
        pointerEvents: 'all',
        fontFamily: 'inherit',
      }}
    >
      {/* Header strip */}
      <div style={{ background: `${statusColor}22`, borderBottom: `1px solid ${statusColor}44`, padding: '10px 12px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: statusColor, letterSpacing: '0.03em' }}>{ot.ot_number}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: priColor, background: `${priColor}22`, border: `1px solid ${priColor}55`, borderRadius: 4, padding: '1px 6px' }}>
            P{ot.priority} · {priLabel}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-foreground, #888)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ot.client_name}
        </div>
        {ot.product_name && (
          <div style={{ fontSize: 10, color: 'var(--muted-foreground, #888)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ot.product_name}
          </div>
        )}
      </div>

      {/* Product image */}
      <div style={{ height: 100, background: '#00000030', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
        {ot.product_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ot.product_image_url}
            alt="Producto"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: 0.35 }}>
            <ImageIcon size={28} color="var(--muted-foreground, #888)" />
            <span style={{ fontSize: 9, color: 'var(--muted-foreground, #888)' }}>Sin imagen</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ padding: '8px 12px 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 9, color: 'var(--muted-foreground, #888)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Progreso</span>
          <span style={{ fontSize: 9, color: statusColor, fontWeight: 700 }}>{progressPct}% · {STATUS_LABELS[ot.status] ?? ot.status}</span>
        </div>
        <div style={{ height: 5, background: '#ffffff18', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ width: `${progressPct}%`, height: '100%', background: statusColor, borderRadius: 99, transition: 'width 0.3s' }} />
        </div>
        {/* Mini status dots */}
        <div style={{ display: 'flex', gap: 2, marginTop: 5, flexWrap: 'wrap' }}>
          {STATUS_FLOW_KEYS.slice(0, 12).map((k, i) => (
            <div key={k} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: i <= statusIdx ? STATUS_COLORS[k] : '#ffffff18',
              flexShrink: 0,
            }} />
          ))}
        </div>
      </div>

      {/* Key fields */}
      <div style={{ padding: '6px 12px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
        <Field icon={<Package size={9} />} label="Cantidad" value={fmt(ot.quantity)} />
        <Field icon={<Calendar size={9} />} label="Entrega" value={fmtDate(ot.deadline)} />
        <Field icon={<Ruler size={9} />} label="Medidas" value={ot.width_cm && ot.height_cm ? `${ot.width_cm}×${ot.height_cm} cm` : '—'} />
        <Field icon={<Layers size={9} />} label="Sustrato" value={fmt(ot.substrate_type)} />
        <Field icon={<DollarSign size={9} />} label="Precio total" value={fmtPrice(ot.total_price)} />
        {(ot.color_front || ot.color_back) && (
          <Field icon={<span style={{ fontSize: 8 }}>🎨</span>} label="Colores" value={[ot.color_front, ot.color_back].filter(Boolean).join(' / ')} />
        )}
      </div>
    </div>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--muted-foreground, #888)' }}>
        {icon}
        <span style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</span>
      </div>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--foreground, #fff)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}
