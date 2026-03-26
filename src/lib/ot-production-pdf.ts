'use client';

import type { OTProductionForm } from '@/types/ot-production';

/**
 * Generates a production work order (Orden de Trabajo) PDF that matches
 * the physical workshop form layout with all production-level detail.
 * Uses pure HTML/CSS — no external dependencies.
 */
export function generateProductionOTPDF(form: OTProductionForm): string {
  const {
    ot_number,
    ot_anterior,
    fecha_ot,
    fecha_entrega,
    client_name,
    trabajo,
    cantidad_total,
    unidades_label,
    production_detail,
    tapas,
    items,
    montaje,
    machine,
    process_summary,
    pliegos,
    finishing,
    admin,
  } = form;

  const fmtDate = (d: string) => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return d;
    }
  };

  const fmtNum = (n: number) => n?.toLocaleString('es-CL') ?? '0';

  /* ── Tapas section ─────────────────────────────────────────── */
  const tapasRows = tapas
    .map(
      (t) => `
      <tr>
        <td class="cell">${t.code}).-</td>
        <td class="cell" style="text-align:left;">${t.destination}</td>
        <td class="cell" style="text-align:right;">${fmtNum(t.quantity)} UNID.</td>
      </tr>`
    )
    .join('');

  /* ── Item section (first item shown) ───────────────────────── */
  const item = items[0];

  /* ── Pliegos table ─────────────────────────────────────────── */
  const pliegosRows = pliegos
    .map(
      (p) => `
      <tr>
        <td class="cell center">${p.pliego_number}</td>
        <td class="cell center">${p.unid_pag}</td>
        <td class="cell center">${p.tiro}</td>
        <td class="cell center">${p.retiro}</td>
        <td class="cell">${p.description}</td>
        <td class="cell right">${fmtNum(p.tiraje)}</td>
        <td class="cell right">${p.sobrantes}</td>
        <td class="cell right">${fmtNum(p.cantidad)}${p.nota ? ' ' + p.nota : ''}</td>
      </tr>`
    )
    .join('');

  /* ── Finishing rows ────────────────────────────────────────── */
  const finishingRows = [
    { label: 'CORTE RESMA', active: finishing.corte_resma, qty: finishing.corte_resma_qty },
    { label: 'CORTE FINAL', active: finishing.corte_final, qty: finishing.corte_final_qty },
    { label: 'DOBLADOS', active: finishing.doblados, qty: finishing.doblados_qty },
    { label: 'CORCHETES', active: finishing.corchetes, qty: finishing.corchetes_qty },
    { label: 'CAJAS', active: finishing.cajas, qty: finishing.cajas_qty },
    { label: 'DESPACHO GONSA', active: finishing.despacho_gonsa, qty: undefined, detail: finishing.despacho_gonsa_detail },
  ]
    .map(
      (f) => `
      <tr>
        <td class="cell" style="font-size:9px;">${f.label}</td>
        <td class="cell center">${f.active ? (f.qty ? fmtNum(f.qty) : (f.detail || '✓')) : ''}</td>
      </tr>`
    )
    .join('');

  /* ── Montaje diagram (SVG) ─────────────────────────────────── */
  const montajeDiagram = buildMontajeDiagram(montaje, item);

  /* ── Machine label ─────────────────────────────────────────── */
  const machineLabels: Record<string, string> = {
    impresion_digital: 'IMPRESIÓN DIGITAL',
    offset_1_color: 'OFFSET 1 COLOR',
    offset_2_colores: 'OFFSET 2 COLORES',
    offset_4_colores: 'OFFSET 4 COLORES',
    serigrafia: 'SERIGRAFÍA',
    flexografia: 'FLEXOGRAFÍA',
    otro: 'OTRA',
  };

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>OT ${ot_number} — Orden de Trabajo</title>
  <style>
    @page { margin: 8mm; size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', 'Consolas', monospace;
      color: #000;
      font-size: 10px;
      line-height: 1.3;
      padding: 8px;
      background: #fff;
    }
    
    .ot-container {
      border: 2px solid #000;
      padding: 0;
      max-width: 210mm;
      margin: 0 auto;
    }
    
    /* ── Header ──────────────────────────── */
    .ot-header {
      display: flex;
      border-bottom: 2px solid #000;
    }
    .ot-header-left {
      flex: 1;
      padding: 6px 10px;
    }
    .ot-header-right {
      width: 200px;
      border-left: 2px solid #000;
      text-align: center;
      padding: 4px;
    }
    .ot-title {
      font-size: 16px;
      font-weight: bold;
      text-align: center;
      letter-spacing: 2px;
    }
    .ot-number-box {
      font-size: 28px;
      font-weight: bold;
      border: 2px solid #000;
      padding: 4px 12px;
      display: inline-block;
      margin: 2px 0;
    }
    .ot-field {
      margin: 2px 0;
    }
    .ot-field-label {
      font-weight: bold;
      font-size: 8px;
      text-transform: uppercase;
      color: #333;
    }
    .ot-field-value {
      font-size: 11px;
      font-weight: bold;
    }
    
    /* ── Rows / Sections ─────────────────── */
    .section-row {
      display: flex;
      border-bottom: 1px solid #000;
    }
    .section-full {
      width: 100%;
      border-bottom: 1px solid #000;
      padding: 4px 8px;
    }
    .section-left {
      flex: 1;
      border-right: 1px solid #000;
      padding: 4px 8px;
    }
    .section-right {
      width: 240px;
      padding: 4px 8px;
    }
    .section-title {
      font-size: 8px;
      font-weight: bold;
      text-transform: uppercase;
      color: #555;
      margin-bottom: 2px;
    }
    
    /* ── Tables ───────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
    }
    .cell {
      border: 1px solid #999;
      padding: 2px 4px;
      font-size: 9px;
    }
    .cell.center { text-align: center; }
    .cell.right { text-align: right; }
    .cell.bold { font-weight: bold; }
    .header-cell {
      border: 1px solid #999;
      padding: 2px 4px;
      font-size: 7px;
      font-weight: bold;
      text-transform: uppercase;
      background: #eee;
      text-align: center;
    }
    
    /* ── Item specs grid ─────────────────── */
    .specs-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 0;
      border: 1px solid #999;
    }
    .spec-cell {
      border: 1px solid #999;
      padding: 2px 4px;
      text-align: center;
    }
    .spec-label {
      font-size: 7px;
      font-weight: bold;
      text-transform: uppercase;
      background: #eee;
    }
    .spec-value {
      font-size: 11px;
      font-weight: bold;
    }
    
    /* ── Montaje area ────────────────────── */
    .montaje-area {
      display: flex;
      border-bottom: 1px solid #000;
      min-height: 120px;
    }
    .montaje-diagram-left {
      flex: 1;
      border-right: 1px solid #000;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .montaje-diagram-right {
      flex: 1;
      padding: 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .montaje-info-bar {
      border-bottom: 1px solid #000;
      padding: 2px 8px;
      text-align: center;
      font-size: 9px;
      font-weight: bold;
    }
    
    /* ── Machine row ─────────────────────── */
    .machine-row {
      display: grid;
      grid-template-columns: 180px 80px 60px 80px 60px 1fr;
      border-bottom: 1px solid #000;
    }
    .machine-cell {
      border-right: 1px solid #999;
      padding: 2px 4px;
    }
    .machine-cell:last-child { border-right: none; }
    
    /* ── Pliegos table ───────────────────── */
    .pliegos-section {
      border-bottom: 1px solid #000;
    }
    
    /* ── Footer area ─────────────────────── */
    .footer-area {
      display: flex;
    }
    .footer-left {
      flex: 1;
      border-right: 1px solid #000;
    }
    .footer-right {
      width: 240px;
    }
    .footer-field {
      display: flex;
      border-bottom: 1px solid #999;
      font-size: 9px;
    }
    .footer-field-label {
      width: 140px;
      padding: 2px 4px;
      font-weight: bold;
      font-size: 8px;
      border-right: 1px solid #999;
      background: #f5f5f5;
    }
    .footer-field-value {
      flex: 1;
      padding: 2px 4px;
      font-weight: bold;
    }
    
    /* ── Two-column footer ───────────────── */
    .dual-footer {
      display: flex;
      border-bottom: 1px solid #000;
    }
    .dual-footer-left {
      flex: 1;
      border-right: 1px solid #000;
    }
    .dual-footer-right {
      width: 280px;
    }
    
    .process-summary-box {
      font-size: 9px;
      font-weight: bold;
      text-transform: uppercase;
      padding: 4px;
      line-height: 1.5;
    }
    
    @media print {
      body { padding: 0; }
      .ot-container { border: 2px solid #000; }
    }
  </style>
</head>
<body>
  <div class="ot-container">
  
    <!-- ═══ HEADER ═══ -->
    <div class="ot-header">
      <div class="ot-header-left">
        <div class="ot-title">ORDEN DE TRABAJO</div>
        <div class="ot-field" style="margin-top:4px;">
          <span class="ot-field-label">OT Anterior</span>
          <span class="ot-field-value" style="margin-left:8px;">${ot_anterior || ''}</span>
        </div>
        <div class="ot-field">
          <span class="ot-field-label">CLIENTE</span>
          <span class="ot-field-value" style="margin-left:8px;font-size:12px;">${client_name}</span>
        </div>
        <div class="ot-field">
          <span class="ot-field-label">TRABAJO</span>
          <span class="ot-field-value" style="margin-left:8px;">${trabajo}</span>
        </div>
        <div class="ot-field">
          <span class="ot-field-label">CANTIDAD TOTAL</span>
          <span class="ot-field-value" style="margin-left:8px;font-size:13px;">${fmtNum(cantidad_total)}</span>
          <span style="font-size:9px;margin-left:4px;">${unidades_label}</span>
        </div>
      </div>
      <div class="ot-header-right">
        <div style="font-size:8px;font-weight:bold;">OT</div>
        <div class="ot-number-box">${ot_number}</div>
        <div style="font-size:7px;margin-top:4px;">
          <div><span class="ot-field-label">Fecha O.T.</span></div>
          <div class="ot-field-value">${fmtDate(fecha_ot)}</div>
        </div>
        <div style="font-size:7px;margin-top:4px;">
          <div><span class="ot-field-label">Fecha de Entrega</span></div>
          <div class="ot-field-value" style="font-size:12px;color:#c00;">${fmtDate(fecha_entrega)}</div>
        </div>
      </div>
    </div>
    
    <!-- ═══ PRODUCTION DETAIL + TAPAS ═══ -->
    <div class="section-row">
      <div class="section-left">
        <div class="section-title">Detalle de Producción</div>
        <div style="font-size:10px;font-weight:bold;margin-bottom:2px;">
          ${production_detail.production_description}
        </div>
        ${production_detail.formato ? `<div style="font-size:9px;">Formato: ${production_detail.formato}</div>` : ''}
        ${production_detail.tapas_spec ? `<div style="font-size:9px;">${production_detail.tapas_spec}</div>` : ''}
        ${production_detail.interior_spec ? `<div style="font-size:9px;">${production_detail.interior_spec}</div>` : ''}
        ${production_detail.acabado ? `<div style="font-size:9px;">${production_detail.acabado}</div>` : ''}
      </div>
      <div class="section-right">
        <div class="section-title">Tapas</div>
        ${tapas.length > 0
          ? `<table>${tapasRows}</table>`
          : '<div style="font-size:9px;color:#999;">Sin distribución de tapas</div>'
        }
      </div>
    </div>
    
    <!-- ═══ ITEM SPECS ═══ -->
    ${item ? `
    <div class="section-row">
      <div class="section-left" style="flex:2;">
        <div style="display:flex;gap:8px;align-items:baseline;margin-bottom:4px;">
          <div class="section-title">ITEM ${item.item_number}</div>
          <div style="font-size:10px;font-weight:bold;">${item.description}</div>
        </div>
        <div style="display:flex;gap:8px;font-size:9px;margin-bottom:4px;">
          <div><span class="ot-field-label">A IMPRIMIR</span> <b>${fmtNum(item.a_imprimir)}</b></div>
          <div style="margin-left:16px;"><span class="ot-field-label">UNIDADES</span></div>
        </div>
        <div style="display:flex;gap:8px;font-size:9px;margin-bottom:6px;">
          <div><span class="ot-field-label">PAPEL</span> <b>${typeof item.papel === 'string' ? item.papel.charAt(0).toUpperCase() + item.papel.slice(1) : item.papel}</b></div>
          <div style="margin-left:16px;"><b>${item.grammage_grs}</b> GRS.</div>
        </div>
        
        <!-- Specs grid -->
        <table style="width:100%;">
          <tr>
            <td class="header-cell">ANCHO</td>
            <td class="header-cell">LARGO</td>
            <td class="header-cell">HOJAS SIN CORTAR</td>
            <td class="header-cell">PI/BASE</td>
            <td class="header-cell">PI/SOBRANTE</td>
            <td class="header-cell">PLIEGOS A MÁQUINA</td>
          </tr>
          <tr>
            <td class="cell center bold">${item.sheet_width}</td>
            <td class="cell center bold">${item.sheet_height}</td>
            <td class="cell center bold">${fmtNum(item.hojas_sin_cortar)}</td>
            <td class="cell center bold">${fmtNum(item.pi_base)}</td>
            <td class="cell center bold">${item.pi_sobrante}</td>
            <td class="cell center bold">${fmtNum(item.pliegos_a_maquina)}</td>
          </tr>
        </table>
      </div>
      <div class="section-right">
        <table style="margin-top:16px;">
          <tr><td class="cell" style="font-size:7px;background:#eee;">PLIEGOS</td><td class="cell center bold" style="font-size:14px;">${item.pliegos_count}</td></tr>
          <tr><td class="cell" style="font-size:7px;background:#eee;">PÁGINAS TOTAL</td><td class="cell center bold">${montaje.paginas_total}</td></tr>
          <tr><td class="cell" style="font-size:7px;background:#eee;">FORM. EXTENS.</td><td class="cell center bold">${montaje.forma_extension}</td></tr>
          <tr><td class="cell" style="font-size:7px;background:#eee;">MONTAJE</td><td class="cell center bold">${montaje.montaje_grid}</td></tr>
          <tr><td class="cell" style="font-size:7px;background:#eee;">PLIEGO A MÁQUINA</td><td class="cell center bold" style="font-size:11px;font-weight:bold;">${montaje.pliego_a_maquina}</td></tr>
        </table>
      </div>
    </div>
    ` : ''}
    
    <!-- ═══ MONTAJE DIAGRAM ═══ -->
    <div class="montaje-area">
      ${montajeDiagram}
    </div>
    <div class="montaje-info-bar">
      MONTAJE DE ${montaje.montaje_paginas} páginas
      ${montaje.pinza_cm ? `<span style="margin-left:40px;">pinza ${montaje.pinza_cm}</span>` : ''}
    </div>
    
    <!-- ═══ MACHINE / PRINT CONFIG ═══ -->
    <div style="border-bottom:1px solid #000;">
      <table>
        <tr>
          <td class="header-cell" style="width:160px;">MÁQUINA</td>
          <td class="header-cell" style="width:70px;">COLOR</td>
          <td class="header-cell" style="width:60px;">HORAS</td>
          <td class="header-cell" style="width:70px;">TIRAJE</td>
          <td class="header-cell" style="width:50px;">CTP</td>
          <td class="header-cell">RESUMEN DE PROCESOS</td>
        </tr>
        <tr>
          <td class="cell bold" style="font-size:10px;">${machineLabels[machine.machine_type] || machine.machine_type}</td>
          <td class="cell center bold">${machine.color_config}</td>
          <td class="cell center">${machine.horas || ''}</td>
          <td class="cell center bold">${fmtNum(machine.tiraje)}</td>
          <td class="cell center">${machine.ctp_needed ? (machine.ctp_count || '✓') : ''}</td>
          <td class="cell" rowspan="2">
            <div class="process-summary-box">${process_summary.description}</div>
          </td>
        </tr>
        <tr>
          <td class="cell" style="font-size:7px;">COLORES ESPECIALES</td>
          <td class="cell" colspan="2" style="font-size:9px;">${machine.colores_especiales || ''}</td>
          <td class="cell center" style="font-size:7px;">V°B° PDF</td>
          <td class="cell center">${machine.vb_pdf ? '✓' : ''}</td>
        </tr>
      </table>
    </div>
    
    <!-- ═══ PLIEGOS TABLE ═══ -->
    <div class="pliegos-section">
      <table>
        <tr>
          <td class="header-cell" style="width:55px;">Pliegos</td>
          <td class="header-cell" style="width:55px;">Unid/Pag</td>
          <td class="header-cell" style="width:45px;">TIRO</td>
          <td class="header-cell" style="width:55px;">RETIRO</td>
          <td class="header-cell">DESCRIPCIÓN DEL PLIEGO</td>
          <td class="header-cell" style="width:70px;">TIRAJE</td>
          <td class="header-cell" style="width:70px;">SOBRANTES</td>
          <td class="header-cell" style="width:80px;">CANTIDAD</td>
        </tr>
        ${pliegosRows}
      </table>
    </div>
    
    <!-- ═══ NOTES ═══ -->
    <div class="section-full" style="font-size:8px;font-weight:bold;min-height:20px;">
      NOTAS PARA PRODUCCIÓN Y OBSERVACIONES
      <div style="font-size:9px;font-weight:normal;margin-top:2px;">
        ${admin.notas_produccion || ''}
        ${admin.originales_via ? `<br/>Originales: ${admin.originales_via}` : ''}
      </div>
    </div>
    
    <!-- ═══ FINISHING + ADMIN FOOTER ═══ -->
    <div class="dual-footer">
      <div class="dual-footer-left">
        <table>
          <tr>
            <td class="header-cell" style="width:200px;">ENCUADERNACIÓN Y TERMINACIÓN</td>
            <td class="header-cell" style="width:100px;">CANTIDAD</td>
            <td class="header-cell">DETALLE DE PRODUCCIÓN</td>
          </tr>
          ${finishingRows}
        </table>
      </div>
      <div class="dual-footer-right">
        <!-- Empty production detail column -->
      </div>
    </div>
    
    <!-- ═══ ADMIN FOOTER ═══ -->
    <div class="footer-area">
      <div class="footer-left">
        <div class="footer-field">
          <div class="footer-field-label">Solicitante:</div>
          <div class="footer-field-value">${admin.solicitante}</div>
        </div>
        <div class="footer-field">
          <div class="footer-field-label">Vendedor:</div>
          <div class="footer-field-value">${admin.vendedor}</div>
        </div>
        <div class="footer-field">
          <div class="footer-field-label">RUT</div>
          <div class="footer-field-value">${admin.rut || ''}</div>
        </div>
        <div class="footer-field">
          <div class="footer-field-label">CATEGORÍA</div>
          <div class="footer-field-value">${admin.categoria_pago}</div>
        </div>
      </div>
      <div class="footer-right">
        <div class="footer-field">
          <div class="footer-field-label">FECHA DE ENTREGA:</div>
          <div class="footer-field-value" style="color:#c00;font-size:11px;">${fmtDate(fecha_entrega)}</div>
        </div>
        <div class="footer-field">
          <div class="footer-field-label">Presupuesto N°:</div>
          <div class="footer-field-value">${admin.presupuesto_numero || ''}</div>
        </div>
        <div class="footer-field">
          <div class="footer-field-label">O. Compra:</div>
          <div class="footer-field-value">${admin.orden_compra || ''}</div>
        </div>
        <div class="footer-field">
          <div class="footer-field-label" style="font-size:7px;">CANTIDAD TOTAL</div>
          <div class="footer-field-value" style="font-size:12px;">OT ${ot_number}</div>
        </div>
      </div>
    </div>
    
  </div>
</body>
</html>
  `;

  // Open in a new window for print/save-as-PDF
  const printWindow = window.open('', '_blank', 'width=900,height=1200');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 600);
  }

  return html;
}

/**
 * Returns just the HTML string for embedding/preview without opening a print window.
 */
export function getProductionOTHTML(form: OTProductionForm): string {
  // We temporarily override window.open to prevent side effects
  const origOpen = typeof window !== 'undefined' ? window.open : undefined;
  if (typeof window !== 'undefined') {
    (window as any).open = () => null;
  }
  const html = generateProductionOTPDF(form);
  if (typeof window !== 'undefined' && origOpen) {
    window.open = origOpen;
  }
  return html;
}

/* ─── Montaje diagram builder (SVG) ─────────────────────────── */

function buildMontajeDiagram(
  montaje: OTProductionForm['montaje'],
  item: OTProductionForm['items'][0] | undefined
): string {
  if (!item) return '<div style="flex:1;text-align:center;color:#999;padding:20px;">Sin datos de montaje</div>';

  const sheetW = item.sheet_width || 72;
  const sheetH = item.sheet_height || 102;

  // Parse pliego a maquina dims
  const pam = montaje.pliego_a_maquina.split(/[xX×]/);
  const pamW = parseFloat(pam[0]) || 33;
  const pamH = parseFloat(pam[1]) || 48;

  // Parse forma extension
  const fe = montaje.forma_extension.split(/[xX×]/);
  const feW = parseFloat(fe[0]) || 21.5;
  const feH = parseFloat(fe[1]) || 32;

  // Parse montaje grid
  const mg = montaje.montaje_grid.split(/[xX×]/);
  const mgCols = parseInt(mg[0]) || 1;
  const mgRows = parseInt(mg[1]) || 2;

  // Scale factor for SVG
  const svgScale = 1.8;

  /* Left diagram: Full sheet cut */
  const leftSvg = `
    <svg viewBox="0 0 ${sheetW * svgScale + 20} ${sheetH * svgScale + 30}" 
         width="${sheetW * svgScale + 20}" height="${sheetH * svgScale + 30}" style="max-width:100%;">
      <!-- Full sheet -->
      <rect x="10" y="10" width="${sheetW * svgScale}" height="${sheetH * svgScale}" 
            fill="none" stroke="#000" stroke-width="1.5"/>
      <!-- Dimensions -->
      <text x="${10 + sheetW * svgScale / 2}" y="8" text-anchor="middle" font-size="8" font-weight="bold">${sheetH}</text>
      <text x="6" y="${10 + sheetH * svgScale / 2}" text-anchor="middle" font-size="8" font-weight="bold" 
            transform="rotate(-90,6,${10 + sheetH * svgScale / 2})">${sheetW}</text>
      <!-- Cut indicator -->
      <text x="${10 + sheetW * svgScale / 2}" y="${sheetH * svgScale + 26}" 
            text-anchor="middle" font-size="7">Corte de la Hoja: ${montaje.corte_hoja}</text>
    </svg>
  `;

  /* Right diagram: Montaje layout */
  const gap = 2 * svgScale; // gap between pages
  const pageW = feW * svgScale;
  const pageH = feH * svgScale;
  const totalW = mgRows * pageW + (mgRows - 1) * gap;
  const totalH = pamH * svgScale;
  const offsetX = (pamW * svgScale - totalW) / 2 + 10;

  let pagesRects = '';
  for (let i = 0; i < mgRows; i++) {
    const x = offsetX + i * (pageW + gap);
    pagesRects += `
      <rect x="${x}" y="10" width="${pageW}" height="${pageH}" 
            fill="#f0f0f0" stroke="#000" stroke-width="1"/>
      <text x="${x + pageW / 2}" y="${10 + pageH / 2 - 4}" text-anchor="middle" font-size="7" font-weight="bold">TIRO A</text>
      <text x="${x + pageW / 2}" y="${10 + pageH / 2 + 6}" text-anchor="middle" font-size="6">${feW}</text>
    `;
  }

  // Dimension labels
  const rightSvg = `
    <svg viewBox="0 0 ${pamW * svgScale + 30} ${pamH * svgScale + 30}" 
         width="${pamW * svgScale + 30}" height="${pamH * svgScale + 30}" style="max-width:100%;">
      <!-- Press sheet -->
      <rect x="10" y="10" width="${pamW * svgScale}" height="${pamH * svgScale}" 
            fill="none" stroke="#000" stroke-width="1.5" stroke-dasharray="4,2"/>
      ${pagesRects}
      <!-- Gripper (pinza) -->
      <line x1="10" y1="${10 + pamH * svgScale - montaje.pinza_cm * svgScale}" 
            x2="${10 + pamW * svgScale}" y2="${10 + pamH * svgScale - montaje.pinza_cm * svgScale}" 
            stroke="#c00" stroke-width="0.5" stroke-dasharray="2,1"/>
      <!-- Dimensions -->
      <text x="${10 + pamW * svgScale / 2}" y="${pamH * svgScale + 26}" text-anchor="middle" font-size="7">${pamW} × ${pamH}</text>
      <text x="${pamW * svgScale + 18}" y="${10 + feH * svgScale / 2}" text-anchor="middle" font-size="7" font-weight="bold"
            transform="rotate(90,${pamW * svgScale + 18},${10 + feH * svgScale / 2})">${feH}</text>
    </svg>
  `;

  return `
    <div class="montaje-diagram-left">
      ${leftSvg}
    </div>
    <div class="montaje-diagram-right">
      ${rightSvg}
    </div>
  `;
}

// End of file
