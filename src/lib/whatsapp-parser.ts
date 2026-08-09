/**
 * @fileoverview WhatsApp Message Parser
 *
 * Parses free-form Spanish text messages from operators into structured
 * production data. Handles variations in spelling, slang, abbreviations,
 * and informal workshop language.
 *
 * Examples of messages this handles:
 *   START: "inicio ot 1234"
 *   START: "empiezo la 1234"
 *   END:   "fin 1234 hice 500 pliegos 3 de merma doblado listo"
 *   END:   "terminé la OT-1234. 1200 pliegos, merma 15, offset 4 colores, bond 140"
 *   END:   "listo 1234 - 800 buenos de 850 total, corte y doblado ok"
 */

import type {
  WhatsAppMessageType,
  ParsedProductionData,
} from '@/types/whatsapp-production';

import {
  START_KEYWORDS,
  END_KEYWORDS,
  CANCEL_KEYWORDS,
  PROCESS_KEYWORDS,
  PROBLEM_KEYWORDS,
  PAPER_KEYWORDS,
} from '@/types/whatsapp-production';

/* ─── Normalize text ─────────────────────────────────────────── */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[;:!¡¿?()[\]{}]/g, ' ') // remove punctuation (keep . and , for numbers)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse Chilean-style numbers: "1.500" → 1500, "2,5" → 2.5
 * Handles: 1.500, 10.000, 500, 1,200 (but not 1.5 which is likely a decimal)
 */
function parseChileanNumber(raw: string): number {
  // If has dot as thousands separator (e.g. "1.500", "10.000")
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    return parseInt(raw.replace(/\./g, ''));
  }
  // Standard integer
  return parseInt(raw.replace(/[.,]/g, ''));
}

/* ─── Extract OT Number ─────────────────────────────────────── */

/**
 * Extract OT number from message. Handles formats:
 *  - OT-1234, OT 1234, ot1234
 *  - #1234
 *  - la 1234
 *  - Just a standalone number at the start
 */
export function extractOTNumber(raw: string): string | null {
  const text = normalize(raw);

  // Pattern: OT-1234, OT 1234, OT1234, ot-1234
  const otPattern = /\bot[\s\-_]*(\d{1,6})\b/;
  const otMatch = text.match(otPattern);
  if (otMatch) return otMatch[1];

  // Pattern: #1234
  const hashPattern = /#(\d{1,6})\b/;
  const hashMatch = text.match(hashPattern);
  if (hashMatch) return hashMatch[1];

  // Pattern: "la 1234" or "el 1234" (informal reference)
  const articlePattern = /\b(?:la|el|orden)\s+(\d{1,6})\b/;
  const articleMatch = text.match(articlePattern);
  if (articleMatch) return articleMatch[1];

  // Pattern: keyword followed by a number (e.g. "inicio 1234")
  const keywordsThen = [...START_KEYWORDS, ...END_KEYWORDS].join('|');
  const kNumPattern = new RegExp(`(?:${keywordsThen})\\s+(\\d{1,6})\\b`);
  const kNumMatch = text.match(kNumPattern);
  if (kNumMatch) return kNumMatch[1];

  // Fallback: first standalone number in the message
  const firstNum = text.match(/\b(\d{3,6})\b/);
  if (firstNum) return firstNum[1];

  return null;
}

/* ─── Classify Message Type ──────────────────────────────────── */

/** Word-bounded keyword test: 'entro' must not match inside 'centro',
 * nor 'fin' inside 'finde'. Multi-word keywords ('paso a') work too. */
function hasKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

export function classifyMessage(raw: string): WhatsAppMessageType {
  const text = normalize(raw);
  const words = text.split(/\s+/);

  // Check first 4 words for keywords (most operators start with the action)
  const firstWords = words.slice(0, 4).join(' ');

  // Cancel check first (highest priority to allow aborting)
  for (const kw of CANCEL_KEYWORDS) {
    if (hasKeyword(firstWords, kw)) return 'cancel';
  }

  for (const kw of START_KEYWORDS) {
    if (hasKeyword(firstWords, kw)) return 'start';
  }

  for (const kw of END_KEYWORDS) {
    if (hasKeyword(firstWords, kw)) return 'end';
  }

  // Check entire message if not found in first words
  for (const kw of CANCEL_KEYWORDS) {
    if (hasKeyword(text, kw)) return 'cancel';
  }
  for (const kw of END_KEYWORDS) {
    if (hasKeyword(text, kw)) return 'end';
  }
  for (const kw of START_KEYWORDS) {
    if (hasKeyword(text, kw)) return 'start';
  }

  // If there are production numbers (pliegos, merma, etc.) it's likely an end message.
  //
  // Las HORAS cuentan como cifra de producción: «OT 40494 lista, 6 horas offset»
  // es un parte de término aunque no diga «fin». Es además la cifra que más
  // aparece en los mensajes reales, y sin esto quedaban como 'unknown', que no
  // extrae nada.
  if (/\b\d+([.,]\d+)?\s*(pliegos?|merma|buenos?|unidades?|hojas?|h\b|hrs?\b|horas?)\b/.test(text)) {
    return 'end';
  }

  return 'unknown';
}

/* ─── Parse Quantities ───────────────────────────────────────── */

interface QuantityMatch {
  value: number;
  label: string;
  position: number;
}

/**
 * Horas de trabajo declaradas por el operario: «6 horas offset», «5 hrs»,
 * «3.5 horas», «4 hrs».
 *
 * Se acepta el decimal con coma o con punto porque el taller escribe de las dos
 * formas. Se descarta cualquier cosa sobre 24: una jornada más larga que un día
 * es un número mal tipeado, y meterla al costo laboral lo dispara sin que nadie
 * lo note.
 */
function extractHours(text: string): number | null {
  const normalized = normalize(text);
  const re = /(\d+(?:[.,]\d+)?)\s*(?:h\b|hrs?\b|horas?\b)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    const value = parseFloat(match[1].replace(',', '.'));
    if (Number.isFinite(value) && value > 0 && value <= 24) return value;
  }
  return null;
}

function extractQuantities(text: string): QuantityMatch[] {
  const matches: QuantityMatch[] = [];
  const normalized = normalize(text);

  // Palabras con que el taller nombra el papel perdido. «8000 pliegos FALLADOS»
  // no son ocho mil pliegos producidos: son ocho mil perdidos, y contarlos como
  // producción mete la merma dentro de lo que se cobra.
  //
  // Se arma con RegExp y cadenas escapadas —no con plantillas— porque en una
  // plantilla `\d` colapsa a `d` y el patrón termina buscando la letra.
  const PERDIDO = '(?:fallad|malogr|perdid|desechad|arruinad)[oa]s?|desperdicio|desecho';

  // El orden importa: lo perdido se reconoce ANTES que la producción, y el
  // patrón de pliegos lleva una mirada adelante que lo excluye cuando viene
  // calificado como perdido.
  const qtyPatterns = [
    { re: new RegExp('([\\d.]+)\\s*(?:de\\s+)?(?:pliegos?|hojas?)\\b\\s+(?:' + PERDIDO + ')', 'g'), label: 'merma' },
    { re: new RegExp('([\\d.]+)\\s*(?:de\\s+)?(?:' + PERDIDO + ')', 'g'), label: 'merma' },
    // El `\b` es lo que impide que `pliegos?` retroceda a «pliego» y deje la
    // «s» suelta: sin él la mirada adelante no encontraba el espacio, daba por
    // buena la exclusión, y «8000 pliegos fallados» entraba como producción.
    { re: new RegExp('([\\d.]+)\\s*(?:de\\s+)?pliegos?\\b(?!\\s+(?:' + PERDIDO + '))', 'g'), label: 'pliegos' },
    { re: /([\d.]+)\s*(?:de\s+)?merma/g, label: 'merma' },
    { re: /([\d.]+)\s*(?:de\s+)?(?:buenos?|buenas?)/g, label: 'buenos' },
    { re: /([\d.]+)\s*(?:de\s+)?(?:unidades?|unid)/g, label: 'unidades' },
    { re: /([\d.]+)\s*(?:de\s+)?hojas?/g, label: 'hojas' },
    { re: /([\d.]+)\s*(?:de\s+)?(?:copias?|impresiones?)/g, label: 'copias' },
    { re: /([\d.]+)\s*(?:de\s+)?(?:total(?:es)?)/g, label: 'total' },
    { re: /([\d.]+)\s*(?:de\s+)?(?:desperdicio|desecho)/g, label: 'merma' },
    { re: /merma\s*(?:de\s+)?([\d.]+)/g, label: 'merma' },
    { re: /pliegos?\s*(?:de\s+)?([\d.]+)/g, label: 'pliegos' },
    { re: /buenos?\s*([\d.]+)/g, label: 'buenos' },
  ];

  for (const { re, label } of qtyPatterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(normalized)) !== null) {
      const value = parseChileanNumber(match[1]);
      if (!isNaN(value) && value > 0) {
        // Only keep first match per label to prevent duplicates
        if (!matches.find(m => m.label === label)) {
          matches.push({
            value,
            label,
            position: match.index,
          });
        }
      }
    }
  }

  return matches;
}

/* ─── Parse Processes ────────────────────────────────────────── */

function extractProcesses(text: string): string[] {
  const normalized = normalize(text);
  const found = new Set<string>();

  for (const [keyword, process] of Object.entries(PROCESS_KEYWORDS)) {
    if (normalized.includes(keyword)) {
      found.add(process);
    }
  }

  return Array.from(found);
}

/* ─── Parse Problems ─────────────────────────────────────────── */

function extractProblems(text: string): string[] {
  const normalized = normalize(text);
  const found: string[] = [];

  for (const keyword of PROBLEM_KEYWORDS) {
    const idx = normalized.indexOf(keyword);
    if (idx !== -1) {
      // Grab context: up to 60 chars after the keyword
      const ctx = normalized.slice(idx, idx + 60).trim();
      found.push(ctx);
    }
  }

  return found;
}

/* ─── Parse Paper Type ───────────────────────────────────────── */

function extractPaper(text: string): string | null {
  const normalized = normalize(text);

  for (const [keyword, paper] of Object.entries(PAPER_KEYWORDS)) {
    if (normalized.includes(keyword)) {
      // Try to grab grammage: "bond 140", "couche 300 grs"
      const grammagePattern = new RegExp(`${keyword}\\s*(\\d{2,3})(?:\\s*(?:grs?|gramos?))?`);
      const grMatch = normalized.match(grammagePattern);
      if (grMatch) {
        return `${paper} ${grMatch[1]} grs`;
      }
      return paper;
    }
  }

  return null;
}

/* ─── Parse Colors ───────────────────────────────────────────── */

function extractColors(text: string): string | null {
  const normalized = normalize(text);

  // "4/4", "4/1", "1/1"
  const colorConfig = normalized.match(/\b(\d)\/(\d)\b/);
  if (colorConfig) return `${colorConfig[1]}/${colorConfig[2]}`;

  // "4 colores", "1 color", "cmyk"
  const colorCount = normalized.match(/(\d)\s*color(?:es)?/);
  if (colorCount) return `${colorCount[1]} color${parseInt(colorCount[1]) > 1 ? 'es' : ''}`;

  if (normalized.includes('cmyk')) return 'CMYK (4/4)';
  if (normalized.includes('full color')) return 'CMYK (4/4)';

  return null;
}

/* ─── Parse Machine Type ─────────────────────────────────────── */

function extractMachine(text: string): string | null {
  const normalized = normalize(text);

  const machinePatterns: [RegExp, string][] = [
    [/offset\s*4\s*color/, 'offset_4_colores'],
    [/offset\s*2\s*color/, 'offset_2_colores'],
    [/offset\s*1\s*color/, 'offset_1_color'],
    [/offset/, 'offset'],
    [/digital/, 'impresion_digital'],
    [/serigrafia/, 'serigrafia'],
    [/flexo(?:grafia)?/, 'flexografia'],
    [/gto\s*52/, 'offset_2_colores'],  // Heidelberg GTO 52
    [/speed\s*master/, 'offset_4_colores'], // Heidelberg Speedmaster
    [/kord/, 'offset_1_color'],  // Heidelberg Kord
  ];

  for (const [pattern, machine] of machinePatterns) {
    if (pattern.test(normalized)) return machine;
  }

  return null;
}

/* ─── Main Parser ────────────────────────────────────────────── */

export interface ParseResult {
  message_type: WhatsAppMessageType;
  ot_number: string | null;
  production_data: ParsedProductionData | null;
}

/**
 * Parse a raw WhatsApp message into structured production data.
 */
export function parseWhatsAppMessage(rawMessage: string): ParseResult {
  const messageType = classifyMessage(rawMessage);
  const otNumber = extractOTNumber(rawMessage);

  // START messages don't have production data
  if (messageType === 'start') {
    return {
      message_type: 'start',
      ot_number: otNumber,
      production_data: null,
    };
  }

  // CANCEL messages — operator wants to abort the current session
  if (messageType === 'cancel') {
    return {
      message_type: 'cancel',
      ot_number: otNumber,
      production_data: null,
    };
  }

  // UNKNOWN messages — try to extract what we can
  if (messageType === 'unknown') {
    return {
      message_type: 'unknown',
      ot_number: otNumber,
      production_data: null,
    };
  }

  // END messages — full parse
  const quantities = extractQuantities(rawMessage);
  const processes = extractProcesses(rawMessage);
  const problems = extractProblems(rawMessage);
  const paper = extractPaper(rawMessage);
  const colors = extractColors(rawMessage);
  const machine = extractMachine(rawMessage);

  // Map quantities
  const pliegos = quantities.find(q => q.label === 'pliegos' || q.label === 'hojas');
  const merma = quantities.find(q => q.label === 'merma');
  const buenos = quantities.find(q => q.label === 'buenos' || q.label === 'unidades' || q.label === 'copias');

  // Calculate confidence
  let confidence = 30; // base
  if (otNumber) confidence += 20;
  if (pliegos || buenos) confidence += 20;
  if (processes.length > 0) confidence += 10;
  if (paper) confidence += 5;
  if (colors) confidence += 5;
  if (machine) confidence += 5;
  if (merma !== undefined) confidence += 5;

  // Conflict detection: if both pliegos and buenos exist, check consistency
  if (pliegos && buenos && merma) {
    const expectedBuenos = pliegos.value - merma.value;
    if (Math.abs(expectedBuenos - buenos.value) > 5) {
      confidence -= 10; // penalize inconsistent numbers
    }
  }

  confidence = Math.max(0, Math.min(confidence, 100));

  // Build unparsed notes — anything we didn't consume
  const normalized = normalize(rawMessage);
  let unparsed = normalized;
  // Remove known patterns from unparsed
  for (const kw of [...END_KEYWORDS, ...START_KEYWORDS]) {
    unparsed = unparsed.replace(new RegExp(`\\b${kw}\\b`, 'g'), '');
  }
  if (otNumber) {
    unparsed = unparsed.replace(new RegExp(`\\bot[\\s\\-_]*${otNumber}\\b`, 'g'), '');
    unparsed = unparsed.replace(new RegExp(`\\b${otNumber}\\b`), '');
  }
  unparsed = unparsed.replace(/\s+/g, ' ').trim();

  const productionData: ParsedProductionData = {
    pliegos_produced: pliegos?.value ?? null,
    merma: merma?.value ?? null,
    buenos: buenos?.value ?? null,
    hours_reported: extractHours(rawMessage),
    processes_mentioned: processes,
    machine_mentioned: machine,
    paper_mentioned: paper,
    colors_mentioned: colors,
    problems_reported: problems,
    unparsed_notes: unparsed,
    confidence,
  };

  return {
    message_type: 'end',
    ot_number: otNumber,
    production_data: productionData,
  };
}

/* ─── Compound messages ──────────────────────────────────────── */

/**
 * Parse a message that may contain SEVERAL actions into one event per action.
 *
 * The plant's canonical report is compound: "Fin OT 40879, 7600 pliegos,
 * entro OT 40965" — one END (with production data) plus one START. The single
 * parser can only represent one action, so the START half was silently lost
 * (2026-07 audit).
 *
 * Approach: find every action anchor (a word-bounded start/end/cancel keyword
 * that has an OT number between itself and the next anchor). Two or more
 * anchors with OT numbers → split the normalized text at the anchors and
 * parse each segment independently. Anything else falls back to the single
 * parser, so simple messages behave exactly as before.
 */
export function parseWhatsAppEvents(rawMessage: string): ParseResult[] {
  const text = normalize(rawMessage);

  type Anchor = { index: number; kind: WhatsAppMessageType };
  const anchors: Anchor[] = [];
  const kwSets: Array<[readonly string[], WhatsAppMessageType]> = [
    [CANCEL_KEYWORDS, 'cancel'],
    [END_KEYWORDS, 'end'],
    [START_KEYWORDS, 'start'],
  ];
  for (const [keywords, kind] of kwSets) {
    for (const kw of keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        anchors.push({ index: m.index, kind });
      }
    }
  }
  anchors.sort((a, b) => a.index - b.index);

  // Drop overlapping anchors of the same segment start (e.g. 'termine' also
  // matching 'termino' variants at the same position).
  const distinct: Anchor[] = [];
  for (const a of anchors) {
    if (distinct.length === 0 || a.index > distinct[distinct.length - 1].index) {
      distinct.push(a);
    }
  }

  // Keep only anchors whose segment (up to the next anchor) contains an OT
  // number — a bare "listo" inside a sentence is not a second action.
  const otInSegment = (from: number, to: number) =>
    extractOTNumber(text.slice(from, to)) !== null;
  const actionable = distinct.filter((a, i) =>
    otInSegment(a.index, distinct[i + 1]?.index ?? text.length)
  );

  if (actionable.length < 2) {
    return [parseWhatsAppMessage(rawMessage)];
  }

  const events: ParseResult[] = [];
  for (let i = 0; i < actionable.length; i++) {
    const from = actionable[i].index;
    const to = actionable[i + 1]?.index ?? text.length;
    const segment = text.slice(from, to).replace(/[,;.\s]+$/, '');
    events.push(parseWhatsAppMessage(segment));
  }

  // Same OT reported twice in one message (e.g. "fin 100 listo 100") is one
  // event, not two — collapse consecutive duplicates of the same type + OT.
  return events.filter(
    (e, i) =>
      i === 0 ||
      e.message_type !== events[i - 1].message_type ||
      e.ot_number !== events[i - 1].ot_number
  );
}

/**
 * Generate a human-readable summary of the parsed data (for supervisor preview).
 */
export function summarizeParsedData(data: ParsedProductionData): string {
  const parts: string[] = [];

  if (data.pliegos_produced !== null) {
    parts.push(`📄 ${data.pliegos_produced.toLocaleString('es-CL')} pliegos`);
  }
  if (data.buenos !== null) {
    parts.push(`✅ ${data.buenos.toLocaleString('es-CL')} buenos`);
  }
  if (data.merma !== null) {
    parts.push(`⚠️ ${data.merma.toLocaleString('es-CL')} merma`);
  }
  if (data.machine_mentioned) {
    parts.push(`🖨️ ${data.machine_mentioned}`);
  }
  if (data.paper_mentioned) {
    parts.push(`📋 ${data.paper_mentioned}`);
  }
  if (data.colors_mentioned) {
    parts.push(`🎨 ${data.colors_mentioned}`);
  }
  if (data.processes_mentioned.length > 0) {
    parts.push(`⚙️ ${data.processes_mentioned.join(', ')}`);
  }
  if (data.problems_reported.length > 0) {
    parts.push(`🔴 Problemas: ${data.problems_reported.join('; ')}`);
  }

  return parts.join('\n');
}
