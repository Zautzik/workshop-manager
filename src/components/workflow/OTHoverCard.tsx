'use client';

import { useRef, useState } from 'react';
import { ArrowRight, Calendar, Layers, Package, Ruler, DollarSign, Image as ImageIcon, Scissors, Edit2, Share2, Check } from 'lucide-react';
import { formatCLP } from '@/lib/format';
import { OTStatusSchema } from '@/lib/ot-state-machine';
import { otStatusLabel, otStatusHex } from '@/lib/status-labels';

// Single source: the ordered enum + the shared Spanish labels / phase hexes
// (this card used to carry its own drifting copies — 2026-07 audit).
const STATUS_FLOW_KEYS = OTStatusSchema.options;

interface OTHoverCardProps {
  ot: any;
  anchorRect: DOMRect;
  onClose: () => void;
  onAdvance?: (ot: any, key: string, label: string) => void;
  onSplit?: (ot: any, key: string, label: string) => void;
  onEdit?: (ot: any) => void;
  nextStatuses?: { key: string; labelEs: string }[];
}

export function OTHoverCard({ ot, anchorRect, onClose, onAdvance, onSplit, onEdit, nextStatuses = [] }: OTHoverCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Position: try right of anchor, fall back to left if near viewport edge
  const CARD_W = 300;
  const CARD_H = 420;
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
  const statusColor = otStatusHex(ot.status);

  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle');
  const copyShareLink = async () => {
    try {
      const res = await fetch(`/api/ots/${ot.id}/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({}),
      });
      const d = await res.json();
      if (!res.ok || !d.share_token) return;
      await navigator.clipboard.writeText(`${window.location.origin}/track/${d.share_token}`);
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 1800);
    } catch { /* clipboard/red — silencioso, el usuario puede reintentar */ }
  };

  const priColor = ot.priority >= 8 ? '#ef4444' : ot.priority >= 5 ? '#f59e0b' : '#3b82f6';
  const priLabel = ot.priority >= 8 ? 'Urgente' : ot.priority >= 5 ? 'Media' : 'Normal';

  const fmt = (v: any) => (v !== null && v !== undefined && v !== '') ? v : '—';
  const fmtPrice = (v: any) => typeof v === 'number' ? formatCLP(v) : '—';
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
        background: 'hsl(var(--card))',
        border: `1.5px solid ${statusColor}88`,
        borderRadius: 12,
        boxShadow: `0 12px 40px rgba(0,0,0,0.70), 0 0 0 1px ${statusColor}44`,
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
        <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ot.client_name}
        </div>
        {ot.product_name && (
          <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: 0.5 }}>
            <ImageIcon size={28} color="hsl(var(--muted-foreground))" />
            <span style={{ fontSize: 9, color: 'hsl(var(--muted-foreground))' }}>Sin imagen</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ padding: '8px 12px 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 9, color: 'hsl(var(--muted-foreground))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Progreso</span>
          <span style={{ fontSize: 9, color: statusColor, fontWeight: 700 }}>{progressPct}% · {otStatusLabel(ot.status)}</span>
        </div>
        <div style={{ height: 5, background: '#ffffff18', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ width: `${progressPct}%`, height: '100%', background: statusColor, borderRadius: 99, transition: 'width 0.3s' }} />
        </div>
        {/* Mini status dots */}
        <div style={{ display: 'flex', gap: 2, marginTop: 5, flexWrap: 'wrap' }}>
          {STATUS_FLOW_KEYS.slice(0, 12).map((k, i) => (
            <div key={k} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: i <= statusIdx ? otStatusHex(k) : '#ffffff18',
              flexShrink: 0,
            }} />
          ))}
        </div>
      </div>

      {/* Key fields */}
      <div style={{ padding: '6px 12px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
        <Field icon={<Package size={9} />} label="Cantidad" value={fmt(ot.quantity)} />
        <Field icon={<Calendar size={9} />} label="Entrega" value={fmtDate(ot.deadline)} />
        <Field icon={<Ruler size={9} />} label="Medidas" value={ot.width_cm && ot.height_cm ? `${ot.width_cm}×${ot.height_cm} cm` : '—'} />
        <Field icon={<Layers size={9} />} label="Sustrato" value={fmt(ot.substrate_type)} />
        <Field icon={<DollarSign size={9} />} label="Precio total" value={fmtPrice(ot.total_price)} />
        {(ot.color_front || ot.color_back) && (
          <Field icon={<span style={{ fontSize: 8 }}>🎨</span>} label="Colores" value={[ot.color_front, ot.color_back].filter(Boolean).join(' / ')} />
        )}
      </div>

      {/* Action buttons */}
      <div style={{
        padding: '6px 8px 8px',
        borderTop: `1px solid ${statusColor}33`,
        display: 'flex', flexWrap: 'wrap', gap: 4,
      }}>
          {/* Share: copy the public tracker link for this OT */}
          <button
            onClick={e => { e.stopPropagation(); copyShareLink(); }}
            title="Copiar enlace público de seguimiento"
            style={{
              fontSize: 9, fontWeight: 700, cursor: 'pointer',
              border: shareState === 'copied' ? '1px solid #22c55e66' : '1px solid #06b6d466',
              background: shareState === 'copied' ? '#22c55e22' : '#06b6d422',
              color: shareState === 'copied' ? '#22c55e' : '#06b6d4', borderRadius: 4,
              padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            {shareState === 'copied' ? <><Check size={8} /> Copiado</> : <><Share2 size={8} /> Compartir</>}
          </button>
          {nextStatuses.slice(0, 2).map(ns => (
            <button
              key={ns.key}
              onClick={e => { e.stopPropagation(); onAdvance?.(ot, ns.key, ns.labelEs); onClose(); }}
              style={{
                fontSize: 9, fontWeight: 700, cursor: 'pointer', border: `1px solid ${statusColor}66`,
                background: `${statusColor}22`, color: statusColor, borderRadius: 4,
                padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <ArrowRight size={8} /> {ns.labelEs}
            </button>
          ))}
          {nextStatuses.slice(0, 1).map(ns => (
            <button
              key={`split-${ns.key}`}
              onClick={e => { e.stopPropagation(); onSplit?.(ot, ns.key, ns.labelEs); onClose(); }}
              style={{
                fontSize: 9, fontWeight: 700, cursor: 'pointer', border: '1px solid #f59e0b66',
                background: '#f59e0b22', color: '#f59e0b', borderRadius: 4,
                padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <Scissors size={8} /> Dividir
            </button>
          ))}
          {onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(ot); onClose(); }}
              style={{
                fontSize: 9, fontWeight: 700, cursor: 'pointer', border: '1px solid #6b728066',
                background: '#6b728022', color: 'hsl(var(--muted-foreground))', borderRadius: 4,
                padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <Edit2 size={8} /> Editar
            </button>
          )}
      </div>
    </div>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'hsl(var(--muted-foreground))' }}>
        {icon}
        <span style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</span>
      </div>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}
