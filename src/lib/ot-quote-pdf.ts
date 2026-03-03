'use client';

import type { OTFormData, MultiQuantityQuote } from '@/types/ot';
import { PRODUCT_TYPES, SUBSTRATE_TYPES, PRIORITY_LEVELS, OPERATION_CATEGORIES } from '@/types/ot';

/**
 * Generates a printable quotation HTML document and opens it in a new window for printing/saving as PDF.
 * Uses pure HTML/CSS — no external dependencies.
 */
export function generateQuotePDF(
  form: OTFormData,
  otNumber: string | null,
  multiQuotes: MultiQuantityQuote[]
) {
  const { pricing, operations, quantity } = form;

  const fmt = (val: number) =>
    `$${val.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const fmtUnit = (val: number) =>
    `$${val.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const productTypeLabel = PRODUCT_TYPES.find((p) => p.value === form.product_type)?.label || form.product_type || '-';
  const substrateLabel = SUBSTRATE_TYPES.find((s) => s.value === form.substrate_type)?.label || form.substrate_type || '-';
  const priorityLabel = PRIORITY_LEVELS.find((p) => p.value === form.priority_level)?.label || form.priority_level;

  const getCategoryLabel = (cat: string) =>
    OPERATION_CATEGORIES.find((c) => c.value === cat)?.label || cat;

  const operationRows = operations
    .map(
      (op) => `
        <tr>
          <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;">${getCategoryLabel(op.category)}</td>
          <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;">${op.name}</td>
          <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:center;">${op.quantity} ${op.unit}</td>
          <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:right;">${fmt(op.unit_cost)}</td>
          <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:right;font-weight:600;">${fmt(op.total_cost)}</td>
        </tr>
      `
    )
    .join('');

  const multiRows = multiQuotes.length > 0
    ? `
      <h3 style="margin-top:24px;font-size:13px;color:#333;">Cotización Multi-Cantidad</h3>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:left;">Cantidad</th>
            <th style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:right;">Total</th>
            <th style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:right;">Unitario</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:#e8f4fd;">
            <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;font-weight:700;">${quantity.toLocaleString()} ★</td>
            <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:right;font-weight:700;">${fmt(pricing.total_price)}</td>
            <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:right;font-weight:700;">${fmtUnit(pricing.unit_price)}</td>
          </tr>
          ${multiQuotes
            .map(
              (q) => `
            <tr>
              <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;">${q.quantity.toLocaleString()}</td>
              <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:right;">${fmt(q.total_price)}</td>
              <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:right;">${fmtUnit(q.unit_price)}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `
    : '';

  const today = new Date().toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Cotización ${otNumber || 'OT'} — ${form.client_name}</title>
  <style>
    @page { margin: 20mm; size: A4; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; margin: 0; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px; }
    .logo { font-size: 22px; font-weight: 800; color: #2563eb; }
    .doc-info { text-align: right; font-size: 11px; color: #666; }
    .doc-info strong { color: #222; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 13px; font-weight: 700; color: #2563eb; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 8px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; font-size: 11px; }
    .info-grid dt { color: #666; }
    .info-grid dd { font-weight: 600; margin: 0; }
    .totals { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-top: 16px; }
    .total-row { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; }
    .total-row.final { font-size: 18px; font-weight: 800; color: #2563eb; border-top: 2px solid #2563eb; padding-top: 8px; margin-top: 8px; }
    .footer { margin-top: 32px; font-size: 10px; color: #999; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">Workshop Manager</div>
      <div style="font-size:11px;color:#666;margin-top:4px;">Cotización de Trabajo</div>
    </div>
    <div class="doc-info">
      ${otNumber ? `<div><strong>OT:</strong> ${otNumber}</div>` : ''}
      <div><strong>Fecha:</strong> ${today}</div>
      <div><strong>Prioridad:</strong> ${priorityLabel}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Información del Cliente</div>
    <dl class="info-grid">
      <dt>Cliente:</dt><dd>${form.client_name || '-'}</dd>
      <dt>Producto:</dt><dd>${form.product_name || '-'}</dd>
      <dt>Cantidad:</dt><dd>${quantity.toLocaleString()} unidades</dd>
      <dt>Fecha Entrega:</dt><dd>${form.deadline ? new Date(form.deadline).toLocaleDateString('es-CL') : 'A convenir'}</dd>
    </dl>
  </div>

  <div class="section">
    <div class="section-title">Especificaciones Técnicas</div>
    <dl class="info-grid">
      <dt>Tipo:</dt><dd>${productTypeLabel}</dd>
      <dt>Dimensiones:</dt><dd>${form.width_cm || 0}×${form.height_cm || 0} cm</dd>
      <dt>Sustrato:</dt><dd>${substrateLabel} ${form.grammage_gsm || ''}g</dd>
      <dt>Colores:</dt><dd>Tiro: ${form.color_front} / Retiro: ${form.color_back}</dd>
    </dl>
  </div>

  <div class="section">
    <div class="section-title">Detalle de Operaciones</div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:left;">Categoría</th>
          <th style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:left;">Operación</th>
          <th style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:center;">Cantidad</th>
          <th style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:right;">Costo Unit.</th>
          <th style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${operationRows}
      </tbody>
    </table>
  </div>

  <div class="totals">
    <div class="total-row"><span>Subtotal (Costo Base)</span><span>${fmt(pricing.subtotal)}</span></div>
    <div class="total-row"><span>Margen (${pricing.margin_pct}%)</span><span>+ ${fmt(pricing.margin_amount)}</span></div>
    <div class="total-row"><span>Incremento (${pricing.increment_pct}%)</span><span>+ ${fmt(pricing.increment_amount)}</span></div>
    <div class="total-row"><span>Comisión (${pricing.commission_pct}%)</span><span>+ ${fmt(pricing.commission_amount)}</span></div>
    <div class="total-row final"><span>TOTAL</span><span>${fmt(pricing.total_price)}</span></div>
    <div class="total-row" style="font-size:11px;color:#666;"><span>Precio Unitario (${quantity.toLocaleString()} uds)</span><span>${fmtUnit(pricing.unit_price)}</span></div>
  </div>

  ${multiRows}

  <div class="footer">
    <p>Cotización válida por 15 días. Precios en pesos chilenos (CLP). IVA no incluido.</p>
    <p>Generado por Workshop Manager — ${today}</p>
  </div>
</body>
</html>
  `;

  // Open in a new window for print/save-as-PDF
  const printWindow = window.open('', '_blank', 'width=800,height=1100');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }
}
