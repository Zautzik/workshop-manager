'use client';

import type { OTProductionForm, OTItem, OTMontaje } from '@/types/ot-production';
import { DIE_SHAPE_PATHS } from '@/types/ot-production';

/**
 * Generates a production work order (Orden de Trabajo) PDF that matches
 * the EXACT physical workshop form layout used by guillotine and die-cutting
 * operators. Uses pure HTML/CSS → window.open() → print().
 */
export function generateProductionOTPDF(form: OTProductionForm): string {
  const html = buildOTHTML(form);

  const printWindow = window.open('', '_blank', 'width=900,height=1200');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 600);
  }
  return html;
}

/**
 * Returns just the HTML string (no print dialog).
 */
export function getProductionOTHTML(form: OTProductionForm): string {
  return buildOTHTML(form);
}

/* ══════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════ */

const fmtDate = (d: string) => {
  if (!d) return '';
  try {
    const dt = new Date(d + 'T12:00:00');
    return `${dt.getDate().toString().padStart(2, '0')}-${(dt.getMonth() + 1).toString().padStart(2, '0')}-${dt.getFullYear()}`;
  } catch {
    return d;
  }
};

const fmtNum = (n: number | undefined | null) =>
  n != null ? n.toLocaleString('es-CL') : '';

const MACHINE_LABELS: Record<string, string> = {
  impresion_digital: 'IMPRESION DIGITAL',
  offset_1_color: 'OFFSET 1 COLOR',
  offset_2_colores: 'OFFSET 2 COLORES',
  offset_4_colores: 'OFFSET 4 COLORES',
  serigrafia: 'SERIGRAFIA',
  flexografia: 'FLEXOGRAFIA',
  otro: 'OTRA',
};

/* ══════════════════════════════════════════════════════════════════
   MAIN HTML BUILDER
   ══════════════════════════════════════════════════════════════════ */

function buildOTHTML(form: OTProductionForm): string {
  const {
    ot_number, ot_anterior, fecha_ot, fecha_entrega,
    client_name, trabajo, cantidad_total, unidades_label,
    production_detail, tapas, items, montaje,
    machine, process_summary, pliegos, finishing, admin,
  } = form;

  const item = items[0]; // primary item

  /* ── Dynamic sections ──────────────────────────────────────── */

  // TAPAS list
  const tapasHTML = tapas.length
    ? tapas.map(t =>
        `<div style="display:flex;justify-content:space-between;padding:0 4px;">
           <span><b>${t.code}).-</b> ${t.destination}</span>
           <span><b>: ${fmtNum(t.quantity)} UNID.</b></span>
         </div>`
      ).join('')
    : '<div style="color:#999;padding:4px;">—</div>';

  // PLIEGOS table rows
  const pliegosRows = pliegos.map(p =>
    `<tr>
       <td class="td c">${p.pliego_number}</td>
       <td class="td c">${p.unid_pag}</td>
       <td class="td c">${p.tiro}</td>
       <td class="td c">${p.retiro}</td>
       <td class="td l" style="padding-left:6px;">${p.description}</td>
       <td class="td r">${fmtNum(p.tiraje)}</td>
       <td class="td c">${p.sobrantes}</td>
       <td class="td r">${fmtNum(p.cantidad)}${p.nota ? ' ' + p.nota : ''}</td>
     </tr>`
  ).join('');

  // Finishing rows
  const finItems = [
    { lbl: 'CORTE RESMA', on: finishing.corte_resma, qty: finishing.corte_resma_qty },
    { lbl: 'CORTE FINAL', on: finishing.corte_final, qty: finishing.corte_final_qty },
    { lbl: 'DOBLADOS', on: finishing.doblados, qty: finishing.doblados_qty },
    { lbl: 'CORCHETES', on: finishing.corchetes, qty: finishing.corchetes_qty },
    { lbl: 'CAJAS', on: finishing.cajas, qty: finishing.cajas_qty },
    { lbl: 'DESPACHO GONSA', on: finishing.despacho_gonsa, qty: undefined, detail: finishing.despacho_gonsa_detail },
  ];
  const finRows = finItems.map(f => {
    let val = '';
    if (f.on) {
      if (f.qty != null) val = fmtNum(f.qty);
      else if ((f as any).detail) val = (f as any).detail;
      else val = '✓';
    }
    return `<tr>
      <td class="td l" style="padding-left:6px;font-size:8px;">${f.lbl}</td>
      <td class="td c" style="width:80px;">${val}</td>
    </tr>`;
  }).join('');

  // Montaje diagrams SVG
  const montajeSVG = buildMontajeDiagrams(montaje, item);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>OT ${ot_number} — Orden de Trabajo</title>
<style>
  @page { margin: 5mm 6mm; size: A4 portrait; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9px;
    color: #000;
    background: #fff;
    line-height: 1.3;
  }

  /* ── Container ──────────────────── */
  .ot { border: 2px solid #000; width: 100%; max-width: 780px; margin: 0 auto; }

  /* ── Generic table cell ─────────── */
  .td { border: 1px solid #000; padding: 2px 4px; font-size: 9px; vertical-align: middle; }
  .c  { text-align: center; }
  .l  { text-align: left; }
  .r  { text-align: right; }
  .b  { font-weight: bold; }

  /* ── Header cells (labels) ──────── */
  .th {
    border: 1px solid #000;
    padding: 2px 4px;
    font-size: 7.5px;
    font-weight: bold;
    text-transform: uppercase;
    text-align: center;
    background: #eee;
    vertical-align: middle;
  }

  table { width: 100%; border-collapse: collapse; }

  /* ── Layout helpers ─────────────── */
  .row  { display: flex; border-bottom: 1px solid #000; }
  .col  { padding: 3px 6px; }
  .sep  { border-right: 1px solid #000; }

  /* ── Header ─────────────────────── */
  .hdr { display: flex; border-bottom: 2px solid #000; }
  .hdr-left { flex: 1; padding: 4px 8px; }
  .hdr-right {
    width: 180px; border-left: 2px solid #000;
    display: flex; flex-direction: column; align-items: center;
    padding: 4px 8px;
  }
  .hdr-title {
    text-align: center; font-size: 16px; font-weight: bold;
    letter-spacing: 3px; text-transform: uppercase; margin-bottom: 4px;
  }
  .ot-box {
    font-size: 30px; font-weight: bold;
    border: 3px solid #000; padding: 2px 14px;
    letter-spacing: 1px; line-height: 1;
  }
  .hdr-pair { margin: 2px 0; font-size: 9px; }
  .hdr-pair .lbl { font-size: 7.5px; font-weight: bold; text-transform: uppercase; }
  .hdr-pair .val { font-weight: bold; margin-left: 4px; }

  /* ── Montaje area ───────────────── */
  .mont { display: flex; border-bottom: 1px solid #000; min-height: 160px; }
  .mont-left  { flex: 1; border-right: 1px solid #000; padding: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .mont-right { flex: 1; padding: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .mont-bar   {
    border-bottom: 1px solid #000; padding: 2px 8px;
    font-size: 9px; font-weight: bold;
    display: flex; justify-content: center; gap: 80px;
  }

  /* ── Footer ─────────────────────── */
  .ftr { display: flex; }
  .ftr-left  { flex: 1; border-right: 1px solid #000; }
  .ftr-right { width: 260px; }
  .ftr-row { display: flex; border-bottom: 1px solid #000; }
  .ftr-lbl { padding: 2px 5px; font-size: 8px; font-weight: bold; }
  .ftr-val { padding: 2px 5px; font-weight: bold; font-size: 9px; }

  @media print {
    body { padding: 0; margin: 0; }
    .ot  { border: 2px solid #000; }
  }
</style>
</head>
<body>
<div class="ot">

<!-- ═══════════════════ HEADER ═══════════════════ -->
<div class="hdr">
  <div class="hdr-left">
    <div class="hdr-title">ORDEN DE TRABAJO</div>
    <div class="hdr-pair">
      <span class="lbl">OT Anterior</span>
      <span class="val" style="border-bottom:1px solid #999;min-width:70px;display:inline-block;">${ot_anterior || ''}</span>
    </div>
    <div class="hdr-pair" style="margin-top:3px;">
      <span class="lbl">CLIENTE</span>
      <span class="val" style="font-size:12px;">${client_name}</span>
    </div>
    <div class="hdr-pair">
      <span class="lbl">TRABAJO</span>
      <span class="val">${trabajo}</span>
    </div>
    <div class="hdr-pair">
      <span class="lbl">CANTIDAD TOTAL</span>
      <span class="val" style="font-size:12px;">${fmtNum(cantidad_total)}</span>
      <span style="font-size:9px;margin-left:3px;">${unidades_label || 'UNIDADES'}</span>
    </div>
  </div>
  <div class="hdr-right">
    <div style="font-size:8px;font-weight:bold;margin-bottom:2px;">OT</div>
    <div class="ot-box">${ot_number}</div>
    <div style="margin-top:6px;text-align:center;">
      <div style="font-size:7px;font-weight:bold;">Fecha O.T.</div>
      <div style="font-size:9px;font-weight:bold;">${fmtDate(fecha_ot)}</div>
    </div>
    <div style="margin-top:4px;text-align:center;">
      <div style="font-size:7px;font-weight:bold;">Fecha de Entrega</div>
      <div style="font-size:11px;font-weight:bold;">${fmtDate(fecha_entrega)}</div>
    </div>
  </div>
</div>

<!-- ═══════════════════ PRODUCTION DETAIL + TAPAS ═══════════════════ -->
<div class="row">
  <div class="col sep" style="flex:1;">
    <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
      <span style="font-size:8px;font-weight:bold;text-transform:uppercase;">Detalle de Producción</span>
      <span style="font-size:7px;font-weight:bold;color:#888;">USUARIO DESARROLLO</span>
    </div>
    <div style="font-size:10px;font-weight:bold;">${production_detail.production_description}</div>
    ${production_detail.formato ? `<div style="font-size:9px;margin-top:1px;">Formato : ${production_detail.formato}</div>` : ''}
    ${production_detail.tapas_spec ? `<div style="font-size:9px;">${production_detail.tapas_spec}</div>` : ''}
    ${production_detail.interior_spec ? `<div style="font-size:9px;">${production_detail.interior_spec}</div>` : ''}
    ${production_detail.acabado ? `<div style="font-size:9px;">${production_detail.acabado}</div>` : ''}
  </div>
  <div class="col" style="width:230px;">
    <div style="font-size:8px;font-weight:bold;text-transform:uppercase;margin-bottom:2px;">TAPAS</div>
    ${tapasHTML}
  </div>
</div>

<!-- ═══════════════════ ITEM SPECS ═══════════════════ -->
${item ? `
<div class="row">
  <!-- LEFT: item detail + grid -->
  <div class="col sep" style="flex:1;">
    <div style="margin-bottom:2px;">
      <span style="font-size:9px;font-weight:bold;background:#eee;padding:1px 6px;border:1px solid #000;">ITEM ${item.item_number}</span>
      <span style="font-size:10px;font-weight:bold;margin-left:8px;">${item.description}</span>
    </div>
    <div style="margin-bottom:1px;">
      <span style="font-size:7.5px;font-weight:bold;">A IMPRIMIR</span>
      <span style="font-size:10px;font-weight:bold;margin-left:6px;">${fmtNum(item.a_imprimir)}</span>
      <span style="font-size:8px;margin-left:4px;">UNIDADES</span>
    </div>
    <div style="margin-bottom:4px;">
      <span style="font-size:7.5px;font-weight:bold;">PAPEL</span>
      <span style="font-size:10px;font-weight:bold;margin-left:6px;">${typeof item.papel === 'string' ? item.papel.charAt(0).toUpperCase() + item.papel.slice(1) : item.papel}</span>
      <span style="font-size:10px;font-weight:bold;margin-left:16px;">${item.grammage_grs}</span>
      <span style="font-size:8px;margin-left:2px;">GRS.</span>
    </div>
    <table>
      <tr>
        <td class="th">ANCHO</td>
        <td class="th">LARGO</td>
        <td class="th">HOJAS SIN CORTAR</td>
        <td class="th">PI/BASE</td>
        <td class="th">PI/SOBRANTE</td>
        <td class="th">PLIEGOS A MÁQUINA</td>
      </tr>
      <tr>
        <td class="td c b">${item.sheet_width}</td>
        <td class="td c b">${item.sheet_height}</td>
        <td class="td c b">${fmtNum(item.hojas_sin_cortar)}</td>
        <td class="td c b">${fmtNum(item.pi_base)}</td>
        <td class="td c b">${item.pi_sobrante}</td>
        <td class="td c b">${fmtNum(item.pliegos_a_maquina)}</td>
      </tr>
    </table>
  </div>
  <!-- RIGHT: montaje spec panel -->
  <div class="col" style="width:230px;padding:0;">
    <table>
      <tr>
        <td class="th" style="text-align:left;padding-left:6px;width:110px;">PLIEGOS</td>
        <td class="td c b" style="font-size:16px;" rowspan="1">${item.pliegos_count}</td>
        <td class="th">FORMA DE<br>MONTAJE</td>
      </tr>
      <tr>
        <td class="th" style="text-align:left;padding-left:6px;">PÁGINAS TOTAL</td>
        <td class="td c b" colspan="2">${montaje.paginas_total}</td>
      </tr>
      <tr>
        <td class="th" style="text-align:left;padding-left:6px;">FORM. EXTENS.</td>
        <td class="td c b" colspan="2">${montaje.forma_extension}</td>
      </tr>
      <tr>
        <td class="th" style="text-align:left;padding-left:6px;">MONTAJE</td>
        <td class="td c b" colspan="2">${montaje.montaje_grid}</td>
      </tr>
      <tr>
        <td class="th" style="text-align:left;padding-left:6px;">PLIEGO A MÁQUINA</td>
        <td class="td c b" colspan="2" style="font-size:12px;">${montaje.pliego_a_maquina}</td>
      </tr>
    </table>
  </div>
</div>
` : ''}

<!-- ═══════════════════ MONTAJE DIAGRAM ═══════════════════ -->
<div class="mont">
  ${montajeSVG}
</div>
<div class="mont-bar">
  <span>MONTAJE DE ${montaje.montaje_paginas} páginas</span>
  ${montaje.pinza_cm ? `<span>pinza ${montaje.pinza_cm}</span>` : ''}
</div>

<!-- ═══════════════════ MACHINE / PRINT CONFIG ═══════════════════ -->
<div style="border-bottom:1px solid #000;">
  <table>
    <tr>
      <td class="th" style="width:150px;">MÁQUINA</td>
      <td class="th" style="width:55px;">COLOR</td>
      <td class="th" style="width:50px;">HORAS</td>
      <td class="th" style="width:65px;">TIRAJE</td>
      <td class="th" style="width:45px;">CTP</td>
      <td class="th">RESUMEN DE PROCESOS</td>
    </tr>
    <tr>
      <td class="td b" style="font-size:10px;">${MACHINE_LABELS[machine.machine_type] || machine.machine_type}</td>
      <td class="td c b">${machine.color_config}</td>
      <td class="td c">${machine.horas || ''}</td>
      <td class="td c b">${fmtNum(machine.tiraje)}</td>
      <td class="td c">${machine.ctp_needed ? (machine.ctp_count || '✓') : ''}</td>
      <td class="td" rowspan="2" style="vertical-align:top;font-size:9px;font-weight:bold;text-transform:uppercase;line-height:1.5;padding:3px 6px;">
        ${process_summary.description}
      </td>
    </tr>
    <tr>
      <td class="td c" style="font-size:7px;font-weight:bold;">COLORES ESPECIALES: ${machine.colores_especiales || ''}</td>
      <td class="td c" style="font-size:7px;">
        <span style="font-weight:bold;">V°B° PDF</span><br>
        ${machine.vb_pdf ? '☑' : '☐'}
      </td>
      <td class="td c" style="font-size:7px;font-weight:bold;">MONTAJE</td>
      <td class="td c" style="font-size:7px;font-weight:bold;">T/R<br>APARTE</td>
      <td class="td c"></td>
    </tr>
  </table>
</div>

<!-- ═══════════════════ PLIEGOS TABLE ═══════════════════ -->
<div style="border-bottom:1px solid #000;">
  <table>
    <tr>
      <td class="th" style="width:50px;">Pliegos</td>
      <td class="th" style="width:50px;">Unid/Pag</td>
      <td class="th" style="width:40px;">TIRO</td>
      <td class="th" style="width:50px;">RETIRO</td>
      <td class="th">DESCRIPCION DEL PLIEGO</td>
      <td class="th" style="width:65px;">TIRAJE</td>
      <td class="th" style="width:65px;">SOBRANTES</td>
      <td class="th" style="width:80px;">CANTIDAD</td>
    </tr>
    ${pliegosRows}
    ${pliegos.length < 8 ? Array(8 - pliegos.length).fill('<tr>' + Array(8).fill('<td class="td" style="height:14px;">&nbsp;</td>').join('') + '</tr>').join('') : ''}
  </table>
</div>

<!-- ═══════════════════ NOTES ═══════════════════ -->
<div style="border-bottom:1px solid #000;padding:3px 6px;min-height:28px;">
  <div style="font-size:7.5px;font-weight:bold;text-transform:uppercase;margin-bottom:1px;">
    NOTAS PARA PRODUCCION Y OBSERVACIONES
  </div>
  <div style="font-size:9px;">
    ${admin.notas_produccion || ''}${admin.originales_via ? (admin.notas_produccion ? ' / ' : '') + 'Originales ' + admin.originales_via : ''}
  </div>
</div>

<!-- ═══════════════════ FINISHING ═══════════════════ -->
<div style="display:flex;border-bottom:1px solid #000;">
  <div style="flex:1;border-right:1px solid #000;">
    <table>
      <tr>
        <td class="th" style="text-align:left;padding-left:6px;">ENCUADERNACIÓN Y TERMINACIÓN</td>
        <td class="th" style="width:80px;">CANTIDAD</td>
      </tr>
      ${finRows}
    </table>
  </div>
  <div style="flex:1;">
    <table>
      <tr><td class="th">DETALLE DE PRODUCCION</td></tr>
      <tr><td class="td" style="height:100px;vertical-align:top;font-size:8px;">${finishing.otros || ''}</td></tr>
    </table>
  </div>
</div>

<!-- ═══════════════════ ADMIN FOOTER ═══════════════════ -->
<div class="ftr">
  <div class="ftr-left">
    <div class="ftr-row">
      <div class="ftr-lbl sep" style="width:155px;">Solicitante: ${admin.solicitante}</div>
      <div class="ftr-val" style="flex:1;"></div>
    </div>
    <div class="ftr-row">
      <div class="ftr-lbl sep" style="width:155px;">Vendedor: ${admin.vendedor}</div>
      <div class="ftr-val" style="flex:1;">${admin.telefono || ''}</div>
    </div>
    <div class="ftr-row">
      <div class="ftr-lbl sep" style="width:155px;">RUT</div>
      <div class="ftr-val" style="flex:1;">${admin.rut || ''}</div>
    </div>
    <div class="ftr-row" style="border-bottom:0;">
      <div class="ftr-lbl sep" style="width:155px;">CATEGORÍA</div>
      <div class="ftr-val" style="flex:1;">${admin.categoria_pago || ''}</div>
    </div>
  </div>
  <div class="ftr-right">
    <div class="ftr-row">
      <div class="ftr-lbl sep" style="flex:1;">FECHA DE ENTREGA:</div>
      <div class="ftr-val" style="width:110px;font-size:10px;">${fmtDate(fecha_entrega)}</div>
    </div>
    <div class="ftr-row">
      <div class="ftr-lbl sep" style="flex:1;">Presupuesto N°:</div>
      <div class="ftr-val" style="width:110px;">${admin.presupuesto_numero || ''}</div>
    </div>
    <div class="ftr-row">
      <div class="ftr-lbl sep" style="flex:1;">O. Compra:</div>
      <div class="ftr-val" style="width:110px;">${admin.orden_compra || ''}</div>
    </div>
    <div class="ftr-row" style="border-bottom:0;">
      <div class="ftr-lbl sep" style="flex:1;">CANTIDAD TOTAL</div>
      <div class="ftr-val b" style="width:110px;font-size:11px;">OT ${ot_number}</div>
    </div>
  </div>
</div>

</div>
</body>
</html>`;
}

/* ══════════════════════════════════════════════════════════════════
   MONTAJE DIAGRAM BUILDER
   Produces precise SVG schematics matching the physical OT form
   that guillotine and die-cutting operators rely on.
   Supports custom die-cut shapes (wavy, rounded, scalloped, etc.)
   via normalised SVG paths that scale to page dimensions.
   ══════════════════════════════════════════════════════════════════ */

function buildMontajeDiagrams(montaje: OTMontaje, item: OTItem | undefined): string {
  if (!item) {
    return `
      <div class="mont-left"><span style="color:#999;">Sin datos de ítem</span></div>
      <div class="mont-right"><span style="color:#999;">Sin datos de montaje</span></div>`;
  }

  // ── Parse all numeric dimensions ──
  const sheetW = item.sheet_width || 72;
  const sheetH = item.sheet_height || 102;

  // Pliego a máquina dims (e.g. "33 x 48")
  const pamParts = montaje.pliego_a_maquina.split(/\s*[xX×]\s*/);
  const pamW = parseFloat(pamParts[0]) || 33;
  const pamH = parseFloat(pamParts[1]) || 48;

  // Forma extension dims (e.g. "21.5 x 32")
  const feParts = montaje.forma_extension.split(/\s*[xX×]\s*/);
  const feW = parseFloat(feParts[0]) || 21.5;
  const feH = parseFloat(feParts[1]) || 32;

  // Grid (e.g. "1 x 2")
  const gridParts = montaje.montaje_grid.split(/\s*[xX×]\s*/);
  const gridCols = parseInt(gridParts[0]) || 1;
  const gridRows = parseInt(gridParts[1]) || 2;

  const pinza = montaje.pinza_cm || 0.8;

  // ── Resolve die-cut shape path ──
  const dieShape = item.die_shape || 'rectangle';
  let shapePath: string;
  if (dieShape === 'custom' && item.die_shape_path) {
    shapePath = item.die_shape_path;
  } else if (dieShape !== 'custom' && DIE_SHAPE_PATHS[dieShape]) {
    shapePath = DIE_SHAPE_PATHS[dieShape];
  } else {
    shapePath = DIE_SHAPE_PATHS.rectangle;
  }

  const isCustomShape = dieShape !== 'rectangle';
  const shapeLabel = item.die_shape_label || (isCustomShape ? dieShape.toUpperCase() : '');

  // ── LEFT DIAGRAM: Full RESMA sheet ──
  const leftSVG = buildLeftDiagram(sheetW, sheetH, pamW, pamH, montaje.corte_hoja, item.pliegos_count, shapePath, isCustomShape);

  // ── RIGHT DIAGRAM: Montaje / Imposition detail ──
  const rightSVG = buildRightDiagram(pamW, pamH, feW, feH, gridCols, gridRows, pinza, shapePath, isCustomShape, shapeLabel);

  return `
    <div class="mont-left">${leftSVG}</div>
    <div class="mont-right">${rightSVG}</div>`;
}

/**
 * Transforms a normalised 0–100 SVG path to fit within a target rectangle.
 * The source path is assumed to be in a 0–100 × 0–100 coordinate space.
 */
function scalePath(path: string, x: number, y: number, w: number, h: number): string {
  // Replace coordinate pairs: scale 0–100 → target rect
  return path.replace(
    /(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g,
    (_match: string, rawX: string, rawY: string) => {
      const nx = x + (parseFloat(rawX) / 100) * w;
      const ny = y + (parseFloat(rawY) / 100) * h;
      return `${nx.toFixed(2)} ${ny.toFixed(2)}`;
    }
  );
}

/* ────────────────────────────────────────────────────────────────
   LEFT: Full parent RESMA sheet
   ──────────────────────────────────────────────────────────────── */
function buildLeftDiagram(
  sheetW: number, sheetH: number,
  pamW: number, pamH: number,
  corteHoja: string, pliegosCount: number,
  shapePath: string, isCustomShape: boolean,
): string {
  // Scale to fit nicely (max ~130px tall)
  const scale = Math.min(120 / sheetH, 140 / sheetW, 1.6);
  const sw = sheetW * scale;
  const sh = sheetH * scale;
  const pw = pamW * scale;
  const ph = pamH * scale;

  const ox = 28; // offset x
  const oy = 14; // offset y
  const W = sw + 50;
  const H = sh + 36;

  // Die-cut preview inside the sheet (small silhouette in center)
  let shapePreview = '';
  if (isCustomShape) {
    // Draw a small version of the die shape centred inside the sheet
    const previewW = Math.min(sw * 0.35, 50);
    const previewH = Math.min(sh * 0.35, 50);
    const previewX = ox + (sw - previewW) / 2;
    const previewY = oy + (sh - previewH) / 2;
    const scaledPath = scalePath(shapePath, previewX, previewY, previewW, previewH);
    shapePreview = `
      <path d="${scaledPath}" fill="rgba(0,100,200,0.08)" stroke="#0066cc" stroke-width="0.8" stroke-dasharray="2,1"/>
      <text x="${previewX + previewW / 2}" y="${previewY + previewH + 9}" text-anchor="middle"
            font-size="5" fill="#0066cc" font-weight="bold">TROQUEL</text>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;">
    <!-- Sheet border -->
    <rect x="${ox}" y="${oy}" width="${sw}" height="${sh}" fill="none" stroke="#000" stroke-width="1.5"/>
    <!-- RESMA label inside top-left -->
    <text x="${ox + 3}" y="${oy + 10}" font-size="6.5" font-weight="bold" fill="#333">RESMA</text>
    <!-- Pliego number inside center -->
    ${!isCustomShape ? `<text x="${ox + sw / 2}" y="${oy + sh / 2 + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="#ccc">${pliegosCount}</text>` : ''}
    <!-- Dashed cut line for press sheet -->
    <rect x="${ox}" y="${oy}" width="${pw}" height="${ph}"
          fill="rgba(0,0,0,0.03)" stroke="#000" stroke-width="0.8" stroke-dasharray="4,2"/>
    <!-- Die-cut shape preview -->
    ${shapePreview}
    <!-- Width label (top) -->
    <line x1="${ox}" y1="${oy - 4}" x2="${ox + sw}" y2="${oy - 4}" stroke="#000" stroke-width="0.5"/>
    <line x1="${ox}" y1="${oy - 7}" x2="${ox}" y2="${oy - 1}" stroke="#000" stroke-width="0.5"/>
    <line x1="${ox + sw}" y1="${oy - 7}" x2="${ox + sw}" y2="${oy - 1}" stroke="#000" stroke-width="0.5"/>
    <text x="${ox + sw / 2}" y="${oy - 6}" text-anchor="middle" font-size="8" font-weight="bold">${sheetH}</text>
    <!-- Height label (left) -->
    <line x1="${ox - 4}" y1="${oy}" x2="${ox - 4}" y2="${oy + sh}" stroke="#000" stroke-width="0.5"/>
    <line x1="${ox - 7}" y1="${oy}" x2="${ox - 1}" y2="${oy}" stroke="#000" stroke-width="0.5"/>
    <line x1="${ox - 7}" y1="${oy + sh}" x2="${ox - 1}" y2="${oy + sh}" stroke="#000" stroke-width="0.5"/>
    <text x="${ox - 8}" y="${oy + sh / 2}" text-anchor="middle" font-size="8" font-weight="bold"
          transform="rotate(-90,${ox - 8},${oy + sh / 2})">${sheetW}</text>
    <!-- Corte de la Hoja label bottom -->
    <text x="${ox + sw / 2}" y="${oy + sh + 12}" text-anchor="middle" font-size="7" font-weight="bold">
      Corte de la Hoja: ${corteHoja || ''}
    </text>
  </svg>`;
}

/* ────────────────────────────────────────────────────────────────
   RIGHT: Montaje / Imposition layout (critical for operators)
   Supports arbitrary die-cut shapes via SVG paths.
   When a non-rectangular shape is specified, the page outlines
   render as the custom path instead of plain rectangles.
   ──────────────────────────────────────────────────────────────── */
function buildRightDiagram(
  pamW: number, pamH: number,
  feW: number, feH: number,
  gridCols: number, gridRows: number,
  pinza: number,
  shapePath: string, isCustomShape: boolean, shapeLabel: string,
): string {
  // Scale to fit (max ~140px tall)
  const scale = Math.min(130 / pamH, 160 / pamW, 2.5);
  const pw = pamW * scale;
  const ph = pamH * scale;
  const pgW = feW * scale;
  const pgH = feH * scale;
  const pinzaPx = pinza * scale;

  const ox = 22; // offset x
  const oy = 22; // offset y
  const W = pw + 52;
  const H = ph + 38;

  // Calculate gap
  const gapCm = gridRows > 1 ? (pamW - gridRows * feW) / (gridRows > 1 ? 1 : 2) : pamW - feW;

  // Build page shapes
  let pages = '';
  const pagePositions: number[] = [];

  for (let col = 0; col < gridRows; col++) {
    let px: number;
    if (gridRows === 1) {
      px = ox + (pw - pgW) / 2;
    } else if (gridRows === 2) {
      px = col === 0 ? ox : ox + pw - pgW;
    } else {
      const spacing = (pw - gridRows * pgW) / (gridRows + 1);
      px = ox + spacing + col * (pgW + spacing);
    }
    pagePositions.push(px);

    for (let row = 0; row < gridCols; row++) {
      const py = oy + row * pgH;

      if (isCustomShape) {
        // Render the custom die-cut shape scaled to the page dimensions
        const scaledPath = scalePath(shapePath, px, py, pgW, pgH);
        pages += `
          <!-- Custom die-cut page outline -->
          <path d="${scaledPath}"
                fill="#f0f0ff" stroke="#000" stroke-width="1"
                stroke-dasharray="none"/>
          <!-- Bounding box (light reference) -->
          <rect x="${px}" y="${py}" width="${pgW}" height="${pgH}"
                fill="none" stroke="#999" stroke-width="0.3" stroke-dasharray="2,2"/>
          <!-- TIRO label -->
          <text x="${px + pgW / 2}" y="${py + pgH / 2}"
                text-anchor="middle" dominant-baseline="central"
                font-size="7.5" font-weight="bold"
                transform="rotate(-90,${px + pgW / 2},${py + pgH / 2})">TIRO A</text>`;
      } else {
        // Standard rectangle page
        pages += `
          <rect x="${px}" y="${py}" width="${pgW}" height="${pgH}"
                fill="#f5f5f5" stroke="#000" stroke-width="0.8"/>
          <text x="${px + pgW / 2}" y="${py + pgH / 2}"
                text-anchor="middle" dominant-baseline="central"
                font-size="7.5" font-weight="bold"
                transform="rotate(-90,${px + pgW / 2},${py + pgH / 2})">TIRO A</text>`;
      }
    }
  }

  // Pinza line (gripper at bottom)
  const pinzaY = oy + ph - pinzaPx;

  // Bottom dimension annotations
  let bottomDims = '';
  if (gridRows === 2 && pagePositions.length === 2) {
    const p1Left = pagePositions[0];
    const p1Right = p1Left + pgW;
    const p2Left = pagePositions[1];
    const p2Right = p2Left + pgW;
    const dimY = oy + ph + 6;
    const tickTop = oy + ph + 3;
    const tickBot = oy + ph + 9;
    const gapWidth = p2Left - p1Right;

    bottomDims += `
      <line x1="${ox}" y1="${tickTop}" x2="${ox}" y2="${tickBot}" stroke="#000" stroke-width="0.5"/>
      <line x1="${p1Right}" y1="${tickTop}" x2="${p1Right}" y2="${tickBot}" stroke="#000" stroke-width="0.5"/>
      <line x1="${p2Left}" y1="${tickTop}" x2="${p2Left}" y2="${tickBot}" stroke="#000" stroke-width="0.5"/>
      <line x1="${p2Right}" y1="${tickTop}" x2="${p2Right}" y2="${tickBot}" stroke="#000" stroke-width="0.5"/>
      <line x1="${ox}" y1="${dimY}" x2="${p2Right}" y2="${dimY}" stroke="#000" stroke-width="0.5"/>
      <text x="${(ox + p1Right) / 2}" y="${dimY + 10}" text-anchor="middle" font-size="7.5" font-weight="bold">${feW}</text>
      ${gapWidth > 2 ? `<text x="${(p1Right + p2Left) / 2}" y="${dimY + 10}" text-anchor="middle" font-size="7" font-weight="bold">${gapCm.toFixed(1)}</text>` : ''}
      <text x="${(p2Left + p2Right) / 2}" y="${dimY + 10}" text-anchor="middle" font-size="7.5" font-weight="bold">${feW}</text>`;
  } else if (gridRows === 1) {
    const dimY = oy + ph + 6;
    bottomDims += `
      <text x="${ox + pw / 2}" y="${dimY + 10}" text-anchor="middle" font-size="7.5" font-weight="bold">${feW}</text>`;
  }

  // Shape type label (only for non-rectangular shapes)
  const shapeLabelSVG = isCustomShape && shapeLabel
    ? `<text x="${ox + pw / 2}" y="${oy - 6}" text-anchor="middle" font-size="6" font-weight="bold" fill="#0066cc">
         TROQUEL: ${shapeLabel}
       </text>`
    : '';

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;">
    <!-- Shape type label -->
    ${shapeLabelSVG}

    <!-- CONTRAPINZA label top-right -->
    <text x="${ox + pw + 6}" y="${oy + 4}" font-size="5.5" font-weight="bold" fill="#666"
          writing-mode="tb" dominant-baseline="central">CONTRAPINZA</text>

    <!-- Press sheet border -->
    <rect x="${ox}" y="${oy}" width="${pw}" height="${ph}"
          fill="none" stroke="#000" stroke-width="1.5"/>

    <!-- Page shapes with TIRO labels -->
    ${pages}

    <!-- Pinza (gripper) line -->
    <line x1="${ox}" y1="${pinzaY}" x2="${ox + pw}" y2="${pinzaY}"
          stroke="#cc0000" stroke-width="0.6" stroke-dasharray="3,1"/>
    <text x="${ox + pw / 2}" y="${pinzaY - 2}" text-anchor="middle"
          font-size="5" fill="#cc0000" font-weight="bold">${pinza}</text>

    <!-- Left dimension: pamW -->
    <line x1="${ox - 4}" y1="${oy}" x2="${ox - 4}" y2="${oy + ph}" stroke="#000" stroke-width="0.5"/>
    <line x1="${ox - 7}" y1="${oy}" x2="${ox - 1}" y2="${oy}" stroke="#000" stroke-width="0.5"/>
    <line x1="${ox - 7}" y1="${oy + ph}" x2="${ox - 1}" y2="${oy + ph}" stroke="#000" stroke-width="0.5"/>
    <text x="${ox - 10}" y="${oy + ph / 2}" text-anchor="middle" font-size="8" font-weight="bold"
          transform="rotate(-90,${ox - 10},${oy + ph / 2})">${pamW}</text>

    <!-- Right dimension: feH -->
    <text x="${ox + pw + 4}" y="${oy + pgH / 2}" text-anchor="middle" font-size="7.5" font-weight="bold"
          transform="rotate(90,${ox + pw + 4},${oy + pgH / 2})">${feH}</text>

    <!-- Bottom dimensions -->
    ${bottomDims}
  </svg>`;
}
