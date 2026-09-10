/**
 * @fileoverview Matriz de mantención por máquina -- componente/sección
 * (filas) × frecuencia (columnas), igual estructura que la hoja de
 * mantención en papel que ya usa el taller para la Ryobi (ver
 * MachineMaintenanceMatrix.tsx). Puro y testeado, como el resto de la
 * lógica de negocio del proyecto -- lo único que hace un componente es
 * pasarle los ítems ya aplanados y pintar el resultado.
 */

import { compareFrequency } from './maintenance-checklist-meta';

export interface MatrixEntry {
  /** section del ítem, tal cual viene de la DB -- puede venir vacío o ser en realidad una frecuencia mal migrada (ver normalizeSection). */
  section: string | null | undefined;
  frequency: string;
  actionType: string | null | undefined;
  /** Nombre del checklist que trajo este ítem -- línea de respaldo si section no es un componente real. */
  checklistName: string;
}

export interface MatrixRow {
  section: string;
  /** Tipos de acción presentes en esa sección para esa frecuencia, sin duplicar. Ausente = celda vacía de verdad. */
  cells: Record<string, string[]>;
}

export interface MaintenanceMatrix {
  rows: MatrixRow[];
  frequencies: string[];
}

/**
 * Casi todas las secciones migradas de manuales técnicos siguen el patrón
 * "Componente — Subcomponente" (el separador em-dash "—"). Un puñado de
 * ítems del manual japonés de la Ryobi 524GS quedaron con la frecuencia
 * como section ("Anual", "Cada 2 semanas", "Cada 6 meses" -- ninguna de
 * las tres ni siquiera coincide con las etiquetas canónicas de
 * FREQUENCY_LABEL, así que compararlas contra esa lista no las habría
 * atrapado). No tener el separador es la señal real: no es un componente,
 * es una frecuencia reusada por error -- se usa el nombre del checklist
 * como fila en su lugar, así la matriz no queda con filas como "Anual" que
 * no dicen a qué parte de la máquina se refieren.
 */
function normalizeSection(section: string | null | undefined, checklistName: string): string {
  const trimmed = (section ?? '').trim();
  if (trimmed && trimmed.includes('—')) return trimmed;
  return checklistName;
}

export function buildMaintenanceMatrix(entries: MatrixEntry[]): MaintenanceMatrix {
  const rowOrder: string[] = [];
  const rowsByKey = new Map<string, Map<string, Set<string>>>();
  const frequencySet = new Set<string>();

  for (const entry of entries) {
    const rowKey = normalizeSection(entry.section, entry.checklistName);
    frequencySet.add(entry.frequency);

    if (!rowsByKey.has(rowKey)) {
      rowsByKey.set(rowKey, new Map());
      rowOrder.push(rowKey);
    }
    const row = rowsByKey.get(rowKey)!;

    if (!row.has(entry.frequency)) row.set(entry.frequency, new Set());
    if (entry.actionType) row.get(entry.frequency)!.add(entry.actionType);
  }

  const frequencies = [...frequencySet].sort(compareFrequency);
  const rows: MatrixRow[] = rowOrder.map((section) => {
    const freqMap = rowsByKey.get(section)!;
    const cells: Record<string, string[]> = {};
    for (const [freq, actionTypes] of freqMap) cells[freq] = [...actionTypes];
    return { section, cells };
  });

  return { rows, frequencies };
}
