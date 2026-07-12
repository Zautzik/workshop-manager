/* ------------------------------------------------------------------ */
/*  WhatsApp Production Tracking — Domain Types                        */
/*                                                                     */
/*  Operators send two messages per job:                                */
/*    START:  "INICIO OT-1234"  or  "inicio 1234"                     */
/*    END:    "FIN OT-1234 500 pliegos, 3 merma, doblado ok"         */
/*                                                                     */
/*  The parser converts these into structured records. A supervisor    */
/*  reviews and approves before data feeds into the cost engine.       */
/* ------------------------------------------------------------------ */

import type { OTMachineType } from './ot-production';

/* ─── Message Direction ──────────────────────────────────────── */
export type WhatsAppMessageType = 'start' | 'end' | 'cancel' | 'unknown';

/* ─── Review Status ──────────────────────────────────────────── */
export type WhatsAppReviewStatus =
  | 'pending'        // Awaiting supervisor review
  | 'approved'       // Supervisor approved → feeds into system
  | 'rejected'       // Supervisor rejected with reason
  | 'needs_revision' // Supervisor asks operator to correct
  | 'auto_approved'; // System auto-approved (optional fast-track)

/* ─── Parsed Production Data from END message ────────────────── */
export interface ParsedProductionData {
  /** Sheets/copies actually produced */
  pliegos_produced: number | null;
  /** Waste/spoilage sheets */
  merma: number | null;
  /** Good units produced */
  buenos: number | null;
  /** Processes mentioned: doblado, corte, corchetes, etc. */
  processes_mentioned: string[];
  /** Machine mentioned (if any) */
  machine_mentioned: string | null;
  /** Paper type mentioned (if any) */
  paper_mentioned: string | null;
  /** Colors mentioned (if any) */
  colors_mentioned: string | null;
  /** Any problems/issues reported */
  problems_reported: string[];
  /** Raw notes that couldn't be parsed */
  unparsed_notes: string;
  /** Confidence score 0-100 */
  confidence: number;
}

/* ─── Inferred Cost Data ─────────────────────────────────────── */
export interface InferredCostData {
  /** Estimated paper cost (CLP) */
  paper_cost: number;
  /** Estimated ink cost */
  ink_cost: number;
  /** Estimated press time cost */
  press_time_cost: number;
  /** Estimated finishing costs */
  finishing_cost: number;
  /** Estimated labour cost */
  labour_cost: number;
  /** Energy cost estimate */
  energy_cost: number;
  /** Total inferred cost */
  total_inferred_cost: number;
  /** Running time in hours */
  running_time_hours: number;
  /** Details of each cost line */
  cost_lines: InferredCostLine[];
}

export interface InferredCostLine {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  source: 'parsed' | 'inferred' | 'default';
}

/* ─── The main WhatsApp Production Log ───────────────────────── */
export interface WhatsAppProductionLog {
  id: string;
  /** OT number referenced in the message */
  ot_number: string;
  /** OT id if matched in the system */
  ot_id: string | null;
  /** The operator's phone number */
  operator_phone: string;
  /** The operator's name (matched from employees table) */
  operator_name: string | null;
  /** Employee id if matched */
  operator_employee_id: string | null;
  /** Whether this is a start or end message */
  message_type: WhatsAppMessageType;
  /** The raw original message text */
  raw_message: string;
  /** Timestamp the WhatsApp message was sent */
  message_timestamp: string;
  /** Parsed production data (only for 'end' messages) */
  parsed_data: ParsedProductionData | null;
  /** Inferred cost data (only for 'end' messages) */
  inferred_costs: InferredCostData | null;
  /** Linked start log id (for end messages) */
  start_log_id: string | null;
  /** Elapsed time between start and end in minutes */
  elapsed_minutes: number | null;
  /** Review status */
  review_status: WhatsAppReviewStatus;
  /** Reviewer (supervisor) user id */
  reviewed_by: string | null;
  /** Review timestamp */
  reviewed_at: string | null;
  /** Supervisor comments */
  review_comments: string | null;
  /** Supervisor's corrected data (if they modify before approving) */
  corrected_data: Partial<ParsedProductionData> | null;
  /** Supervisor's corrected costs */
  corrected_costs: Partial<InferredCostData> | null;
  /** Whether this log has been fed into ot_real_costs */
  fed_to_system: boolean;
  /** Created at */
  created_at: string;
  /** Updated at */
  updated_at: string;
}

/* ─── Summary for dashboard cards ────────────────────────────── */
export interface WhatsAppProductionSummary {
  pending_reviews: number;
  approved_today: number;
  rejected_today: number;
  active_sessions: number; // started but not ended
  total_today: number;
  avg_confidence: number;
}

/* ─── Operator Session (start → end pair) ────────────────────── */
export interface OperatorSession {
  start_log: WhatsAppProductionLog;
  end_log: WhatsAppProductionLog | null;
  ot_number: string;
  operator_name: string;
  status: 'active' | 'completed' | 'pending_review' | 'approved' | 'rejected';
  elapsed_minutes: number | null;
  inferred_costs: InferredCostData | null;
}

/* ─── Constants ──────────────────────────────────────────────── */

/** Keywords that signal a START message.
 * 'entro/entra/sigo/retomo/paso a' cover the plant's real phrasing — the
 * founding example "Fin OT 40879, 7600 pliegos, entro OT 40965" was
 * unparseable because 'entro' was missing (2026-07 audit). Matching is
 * word-bounded in the parser, so 'centro' or 'encuentro' can't false-match. */
export const START_KEYWORDS = [
  'inicio', 'empiezo', 'comienzo', 'arranco', 'start',
  'empezamos', 'comenzamos', 'arrancamos', 'iniciamos',
  'entro', 'entra', 'sigo', 'retomo', 'paso a',
];

/** Keywords that signal an END message */
export const END_KEYWORDS = [
  'fin', 'termino', 'terminé', 'termine', 'listo', 'acabé', 'acabe',
  'end', 'done', 'terminamos', 'acabamos', 'finalizamos',
  'finalizado', 'terminado', 'completado', 'completo',
];

/** Keywords that signal a CANCEL message */
export const CANCEL_KEYWORDS = [
  'cancelar', 'cancelo', 'anular', 'anulo', 'abortar', 'aborto',
  'skip', 'saltar', 'error mio', 'me equivoque',
];

/** Known process keywords for parsing */
export const PROCESS_KEYWORDS: Record<string, string> = {
  'doblado': 'doblado',
  'doblados': 'doblado',
  'doblar': 'doblado',
  'corte': 'corte',
  'cortado': 'corte',
  'cortar': 'corte',
  'guillotina': 'guillotina',
  'corchete': 'corchetes',
  'corchetes': 'corchetes',
  'corchetear': 'corchetes',
  'corcheteo': 'corchetes',
  'pegado': 'pegado',
  'pegar': 'pegado',
  'pegamento': 'pegado',
  'laminado': 'laminado',
  'laminar': 'laminado',
  'barniz': 'barniz',
  'barnizado': 'barniz',
  'troquelado': 'troquelado',
  'troquel': 'troquelado',
  'troquelada': 'troquelado',
  'empaque': 'empaque',
  'empacar': 'empaque',
  'embalar': 'empaque',
  'embalaje': 'empaque',
  'cajas': 'empaque',
  'encuadernado': 'encuadernado',
  'encuadernar': 'encuadernado',
  'impresion': 'impresion',
  'imprimir': 'impresion',
  'impreso': 'impresion',
  'offset': 'impresion_offset',
  'digital': 'impresion_digital',
  'serigrafia': 'serigrafia',
  'hot stamping': 'hot_stamping',
  'uv': 'uv_localizado',
  'perforado': 'perforado',
  'perforar': 'perforado',
  'numerado': 'numeracion',
  'numerar': 'numeracion',
  'alzado': 'alzado',
  'alzar': 'alzado',
  'compaginado': 'compaginado',
  'compaginar': 'compaginado',
};

/** Problem keywords for parsing */
export const PROBLEM_KEYWORDS = [
  'problema', 'error', 'falla', 'fallo', 'defecto', 'mancha',
  'manchas', 'desregistro', 'fuera de registro', 'roto', 'rota',
  'atasco', 'atascado', 'parada', 'detencion', 'mala calidad',
  'rechazo', 'rechazado', 'desperdicio', 'exceso',
];

/** Paper keywords for parsing */
export const PAPER_KEYWORDS: Record<string, string> = {
  'bond': 'bond',
  'couche': 'couche',
  'couché': 'couche',
  'cartulina': 'cartulina',
  'kraft': 'kraft',
  'adhesivo': 'adhesivo',
  'vinilo': 'vinilo',
  'cauche': 'cauche',
};
