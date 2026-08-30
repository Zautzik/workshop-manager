import * as XLSX from 'xlsx';

/**
 * Lee el Excel mensual de inventario del sistema anterior.
 *
 * El archivo no es una tabla limpia: las primeras ~60 filas son dos resúmenes
 * dinámicos (Familia→Total, Familia+Categoria→Total) que crecen o se achican
 * según cuántas categorías tuvo ese mes — así que la tabla real ("Detalle",
 * una fila por Código) NO empieza siempre en la misma fila. Se ubica
 * buscando la fila que tiene "Codigo" Y "Descripcion" como encabezado, en vez
 * de asumir una posición fija (auditoría 2026-08: el primer archivo probado
 * la tenía en la fila 63, pero eso es un dato del mes, no una regla).
 *
 * La familia del sistema anterior (Otros Materiales, Materiales
 * Fotomecanica...) es una agrupación contable, no un tipo de material real —
 * "Otros Materiales" mezcla papel, tinta, adhesivo y cajas. La Categoria
 * (PAPEL, TINTA, CAJA...) sí distingue material físico consistentemente, así
 * que es la que se usa para clasificar, no la Familia.
 */

export const MATERIAL_KIND_VALUES = [
  'papel', 'tinta_especial', 'envase', 'servicio', 'insumo', 'herramental', 'otro',
] as const;
export type MaterialKind = (typeof MATERIAL_KIND_VALUES)[number];

export const CATEGORY_VALUES = ['tool', 'supply', 'product_input', 'spare_part'] as const;
export type ItemCategory = (typeof CATEGORY_VALUES)[number];

// Confirmado con el usuario (2026-08-30): PLANCHA es consumible por trabajo,
// no una herramienta durable — va con papel/tinta/tóner, no con
// repuestos/equipos.
const CATEGORIA_TO_MATERIAL_KIND: Record<string, MaterialKind> = {
  PAPEL: 'papel',
  CARTULINA: 'papel',
  TINTA: 'tinta_especial',
  TONER: 'tinta_especial',
  CAJA: 'envase',
  BOLSA: 'envase',
  FILM: 'envase',
  TERMOLAMINADO: 'envase',
  SACO: 'envase',
  SOBRE: 'envase',
  CARTON: 'envase',
  CARTUCHO: 'herramental',
  EQUIPO: 'herramental',
  REPUESTO: 'herramental',
  ALAMBRE: 'herramental',
  ADHESIVO: 'insumo',
  ADITIVO: 'insumo',
  CINTA: 'insumo',
  ETIQUETAS: 'insumo',
  MANTENCION: 'insumo',
  ACEITE: 'insumo',
  SILICONA: 'insumo',
  OFICINA: 'insumo',
  PLANCHA: 'insumo',
};

const CATEGORIA_TO_CATEGORY: Record<string, ItemCategory> = {
  PAPEL: 'product_input',
  CARTULINA: 'product_input',
  TINTA: 'product_input',
  TONER: 'product_input',
  PLANCHA: 'product_input',
  CARTUCHO: 'spare_part',
  EQUIPO: 'spare_part',
  REPUESTO: 'spare_part',
  ALAMBRE: 'spare_part',
};

const REQUIRED_HEADERS = ['Codigo', 'Descripcion', 'Familia', 'Categoria'];

export interface ParsedInventoryRow {
  sku: string;
  name: string;
  familiaOriginal: string;
  categoriaOriginal: string;
  materialKind: MaterialKind;
  category: ItemCategory;
  categoriaUnmapped: boolean;
  unit: string;
  minStock: number;
  maxStock: number | null;
  unitCost: number; // PPM — costo promedio ponderado
  excelStock: number; // Stock Ter — saldo de cierre del período
  periodo: string; // "2025-10" a partir de Año/Mes
}

export interface ParseResult {
  rows: ParsedInventoryRow[];
  sheetName: string;
  warnings: string[];
}

function findHeaderRow(rows: unknown[][]): { rowIndex: number; header: string[] } | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const strs = row.map((c) => (typeof c === 'string' ? c.trim() : ''));
    if (REQUIRED_HEADERS.every((h) => strs.includes(h))) {
      return { rowIndex: i, header: strs };
    }
  }
  return null;
}

function normalizeUnit(raw: string): string {
  const map: Record<string, string> = {
    Litros: 'litro',
    Unidad: 'unit',
    Kilos: 'kg',
    Pliegos: 'pliego',
    Milimetros: 'mm',
    Metros: 'm',
    Gramos: 'g',
  };
  return map[raw] ?? raw.toLowerCase();
}

export function parseInventoryWorkbook(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('El archivo no tiene hojas.');

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });

  const found = findHeaderRow(rows);
  if (!found) {
    throw new Error(
      'No se encontró la tabla de detalle (se buscó una fila con Codigo, Descripcion, Familia y Categoria como encabezado).'
    );
  }

  const idx = (name: string) => found.header.indexOf(name);
  const iCodigo = idx('Codigo');
  const iDesc = idx('Descripcion');
  const iFamilia = idx('Familia');
  const iCategoria = idx('Categoria');
  const iUnidad = idx('Unidad');
  const iStockTer = idx('Stock Ter');
  const iStockMin = idx('Stock Min');
  const iStockMax = idx('Stock Max');
  const iPPM = idx('PPM');
  const iAño = idx('Año') >= 0 ? idx('Año') : idx('A&ntildeo'); // exportado con entidad HTML sin decodificar en algunos meses
  const iMes = idx('Mes');

  const warnings: string[] = [];
  const unmappedCategorias = new Set<string>();
  const parsedRows: ParsedInventoryRow[] = [];

  for (let i = found.rowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[iCodigo]) continue;

    const sku = String(row[iCodigo]).trim();
    const name = String(row[iDesc] ?? '').trim();
    if (!sku || !name) continue;

    const familiaOriginal = String(row[iFamilia] ?? '').trim();
    const categoriaOriginal = String(row[iCategoria] ?? '').trim().toUpperCase();
    const materialKind = CATEGORIA_TO_MATERIAL_KIND[categoriaOriginal] ?? 'otro';
    const category = CATEGORIA_TO_CATEGORY[categoriaOriginal] ?? 'supply';
    const categoriaUnmapped = !(categoriaOriginal in CATEGORIA_TO_MATERIAL_KIND);
    if (categoriaUnmapped) unmappedCategorias.add(categoriaOriginal);

    const unitRaw = iUnidad >= 0 ? String(row[iUnidad] ?? '').trim() : '';
    const año = iAño >= 0 ? row[iAño] : null;
    const mes = iMes >= 0 ? row[iMes] : null;
    const periodo = año && mes ? `${año}-${String(mes).padStart(2, '0')}` : '';

    parsedRows.push({
      sku,
      name,
      familiaOriginal,
      categoriaOriginal,
      materialKind,
      category,
      categoriaUnmapped,
      unit: unitRaw ? normalizeUnit(unitRaw) : 'unit',
      minStock: iStockMin >= 0 ? Number(row[iStockMin] ?? 0) : 0,
      maxStock: iStockMax >= 0 && row[iStockMax] != null ? Number(row[iStockMax]) : null,
      unitCost: iPPM >= 0 ? Number(row[iPPM] ?? 0) : 0,
      excelStock: iStockTer >= 0 ? Number(row[iStockTer] ?? 0) : 0,
      periodo,
    });
  }

  if (unmappedCategorias.size > 0) {
    warnings.push(
      `Categoría(s) sin mapeo conocido, clasificadas como "otro"/"supply": ${[...unmappedCategorias].join(', ')}.`
    );
  }

  // El mismo Código puede repetirse si el Excel trae más de un período —
  // sólo interesa el más reciente por fila (la última que aparece).
  const bySku = new Map<string, ParsedInventoryRow>();
  for (const r of parsedRows) bySku.set(r.sku, r);
  const dedupCount = parsedRows.length - bySku.size;
  if (dedupCount > 0) {
    warnings.push(`${dedupCount} fila(s) con Código repetido — se usó la última ocurrencia de cada una.`);
  }

  return { rows: [...bySku.values()], sheetName, warnings };
}
