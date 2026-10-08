/**
 * "Couche sheet 115gsm" y "Couche sheet 150gsm" son el mismo producto en dos
 * gramajes — no dos productos que compiten por atención en la grilla. Se
 * corta el nombre en el primer token que empieza con un dígito: todo lo de
 * antes es el producto, todo lo de después es lo que lo distingue de sus
 * hermanos (auditoría 2026-08, feedback directo: "buscar un couche 150 entre
 * couches que se ven idénticos es una misión").
 */
export function splitVariant(name: string): { base: string; spec: string } {
  const tokens = String(name || '').trim().split(/\s+/);
  const idx = tokens.findIndex((t) => /^[0-9]/.test(t));
  if (idx <= 0) return { base: name.trim(), spec: '' };
  const base = tokens.slice(0, idx).join(' ');
  const spec = tokens.slice(idx).join(' ');
  if (base.length < 3) return { base: name.trim(), spec: '' };
  return { base, spec };
}

/**
 * "Couche 200 g" y "Papel Couché 150g 70×100" son el mismo papel — uno
 * catalogado con el prefijo genérico "Papel", el otro sin él, y con/sin
 * tilde en "Couché". Sin normalizar esto quedan como dos productos
 * distintos bajo la misma familia "Papel", que es justo la redundancia que
 * el prefijo debería evitar (feedback directo: "ambos deberían estar bajo
 * el paraguas Couche"). Mismo bug afecta "Papel Bond" / "Bond".
 */
export function normalizeBaseKey(base: string): string {
  const noAccents = base.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const stripped = noAccents.startsWith('papel ') ? noAccents.slice('papel '.length) : noAccents;
  return stripped.trim() || noAccents;
}

export function specNumber(spec: string): number | null {
  const m = spec.match(/[0-9]+(?:[.,][0-9]+)?/);
  return m ? parseFloat(m[0].replace(',', '.')) : null;
}

export function specUnit(spec: string): string {
  const m = spec.match(/[0-9](?:[.,][0-9]+)?\s*([a-zA-Zµ×]+)/);
  return m ? m[1] : '';
}

/**
 * Un tercer nivel, sólo donde el papel realmente lo tiene: gramaje primero,
 * tamaño después ("150g 70×100" → peso "150g", tamaño "70×100"). Lo que no
 * empieza con un número seguido de g/gsm/grs (tubos en mm, cajas en cm,
 * Pantone) se queda en dos niveles — inventar un peso ahí sería ruido, no
 * jerarquía (pedido directo: "de Couche vamos a gramaje, y de ahí a tamaño").
 */
export function parseWeight(spec: string): { weight: string | null; rest: string | null } {
  const m = spec.match(/^([0-9]+(?:[.,][0-9]+)?\s*(?:gsm|grs|gr|g))(?=[\s)]|$)/i);
  if (!m) return { weight: null, rest: spec || null };
  const weight = m[1].trim();
  const rest = spec.slice(m[0].length).trim();
  return { weight, rest: rest || null };
}

/**
 * Las tintas no traen un número en el nombre para partir como el papel
 * ("Tinta Black CMYK offset" no tiene dígitos) — se agrupan por lo que son:
 * cuatricromía (los 4 colores de proceso) o Pantone (color directo). Dentro
 * de cuatricromía el mismo color puede venir de más de una marca — la marca
 * real, cuando está registrada, vive en las notas del ítem como
 * "Proveedor: X.", no en el nombre (pedido directo: "manejamos distintas
 * marcas para cada color, primero por cuatricromía, luego color, luego
 * marca").
 */
export function inkColor(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes('yellow')) return 'Yellow';
  if (n.includes('magenta')) return 'Magenta';
  if (n.includes('cyan')) return 'Cyan';
  if (n.includes('black')) return 'Black';
  return null;
}

export function inkBrand(notes?: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/Proveedor:\s*([^.]+)\.?/i);
  return m ? m[1].trim() : null;
}

/**
 * Tres estados, no uno. "Nunca recibido" y "agotado" se ven idénticos en el
 * número (0) pero significan cosas distintas — el primero es estructural
 * (nadie lo ha comprado todavía), el segundo es un evento real (se tenía y se
 * acabó). Tratarlos igual es cómo 29 de 37 ítems terminan con la misma
 * alarma roja y la alarma deja de servir (auditoría 2026-08).
 */
export function stockState(current: number, min: number, everReceived: boolean) {
  if (current <= 0) {
    return everReceived
      ? { key: 'agotado' as const, label: 'Agotado', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' }
      : { key: 'nunca' as const, label: 'Nunca recibido', dot: 'bg-slate-400', text: 'text-muted-foreground' };
  }
  if (current < min) {
    return { key: 'bajo' as const, label: 'Bajo mínimo', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' };
  }
  return { key: 'ok' as const, label: 'Disponible', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' };
}
