import { z } from 'zod';
import type { AppRole } from '@/types/app-role';
import { missingFor, quoteDrift, type Gap, type OTSpec } from '@/lib/ot-spec';
import {
  ETAPAS_DE_SALIDA,
  firstProblem,
  openPassesMessage,
  promptsStageReport,
  validateStageReport,
  type OpenPass,
  type StageReportContext,
  type StageReportInput,
} from '@/lib/stage-report';
import { otStatusLabel } from '@/lib/status-labels';

/** Single source of truth for all valid OT workflow statuses. */
export const OTStatusSchema = z.enum([
  'pre_press',
  'visto_bueno',
  'paper_purchase',
  'in_storage',
  'guillotine_first_cut',
  'offset_printing',
  'digital_printing',
  'die_cutting',
  'guillotine_final_cut',
  'workshop',
  'outsourced',
  'workshop_revision',
  'ready_for_delivery',
  'in_delivery',
  'completed',
]);

export type OTWorkflowStatus = z.infer<typeof OTStatusSchema>;

/** Ordered list of statuses — derived from the schema so it never drifts. */
const STATUS_ORDER: OTWorkflowStatus[] = OTStatusSchema.options;

/**
 * Statuses that represent an OT actively moving through the workflow —
 * everything except `completed`, derived from the schema so a new status can
 * never silently fall out of the active boards. (The old hand-maintained
 * copies in ots/route.ts and use-workflow-queries.ts both omitted
 * `digital_printing`, making digital jobs vanish from the kanban — 2026-07 audit.)
 */
export const ACTIVE_OT_STATUSES: OTWorkflowStatus[] = STATUS_ORDER.filter(
  (status) => status !== 'completed'
);

const FORWARD_TRANSITIONS = new Map<OTWorkflowStatus, OTWorkflowStatus[]>(
  STATUS_ORDER.map((status, index) => [status, STATUS_ORDER.slice(index + 1)])
);

const ROLE_ACCESS: Record<AppRole, OTWorkflowStatus[]> = {
  admin: STATUS_ORDER,
  supervisor: STATUS_ORDER,
  manager: ['pre_press', 'visto_bueno', 'ready_for_delivery', 'in_delivery', 'completed'],
  hr_manager: ['pre_press', 'visto_bueno'],
  technician: ['guillotine_first_cut', 'offset_printing', 'digital_printing', 'die_cutting', 'guillotine_final_cut', 'workshop', 'outsourced', 'workshop_revision'],
  vendedor: [], // sales role — no OT workflow transitions
};

export interface TransitionValidationInput {
  fromStatus: OTWorkflowStatus;
  toStatus: OTWorkflowStatus;
  role: AppRole;
  hasApprovedApproval: boolean;
  hasAnyRealCosts: boolean;
  rollback?: boolean;
  /**
   * La ficha de la OT, para las compuertas de completitud.
   *
   * Opcional a propósito: quien no la pasa conserva el comportamiento anterior.
   * Una compuerta que rompe todos los llamadores existentes no se despliega.
   */
  spec?: OTSpec;
  /** Precio cotizado y precio firme, para la compuerta de compra de papel. */
  quotedPrice?: number | null;
  firmPrice?: number | null;
  /** El cliente reconfirmó el precio nuevo. */
  repriceApproved?: boolean;
  /**
   * Lo que la OT necesita, para la compuerta de salida de Compras.
   *
   * Opcional como el resto: sin esto la compuerta no corre, y una OT cuyos
   * requisitos nadie cargó no queda trabada. Es deliberado — frenar por «no se
   * sabe» enseña a cargar una lista vacía para poder avanzar.
   */
  requirements?: readonly { description: string; status: string }[];
  /**
   * El cierre de la etapa que termina: cuántas horas tomó y qué pasó.
   *
   * Opcional como todo lo demás. Su ausencia no frena el movimiento —deja la
   * pasada abierta—; lo que sí frena es un dato imposible, y la deuda se cobra
   * al despachar.
   */
  stageReport?: StageReportInput | null;
  /** Pliegos entrados y horas estimadas, para juzgar el cierre. */
  stageReportContext?: StageReportContext;
  /**
   * Pasadas que la OT dejó atrás sin declarar horas.
   *
   * `undefined` es «no se consultó» y la compuerta no corre, igual que con los
   * requisitos: quien no lo pasa conserva el comportamiento anterior. Una lista
   * vacía sí afirma algo —no queda nada abierto— y deja pasar.
   */
  openPasses?: readonly OpenPass[];
}

export interface TransitionValidationResult {
  ok: boolean;
  code?:
    | 'INVALID_TRANSITION'
    | 'ROLE_FORBIDDEN'
    | 'APPROVAL_REQUIRED'
    | 'COSTS_REQUIRED'
    | 'SPEC_INCOMPLETE'
    | 'REPRICE_REQUIRED'
    | 'REQUISITOS_PENDIENTES'
    | 'STAGE_REPORT_INVALID'
    | 'PASADAS_ABIERTAS';
  message?: string;
  /** Lo que falta, cuando el motivo es una ficha incompleta. */
  gaps?: Gap[];
  /** Lo que falta conseguir, cuando la compuerta de Compras frena. */
  pending?: readonly { description: string; status: string }[];
}

export function isValidStatus(value: string): value is OTWorkflowStatus {
  return OTStatusSchema.safeParse(value).success;
}

export function getAllowedNextStatuses(current: OTWorkflowStatus): OTWorkflowStatus[] {
  return FORWARD_TRANSITIONS.get(current) ?? [];
}

/**
 * A dónde sigue REALMENTE una OT desde acá.
 *
 * `getAllowedNextStatuses` responde qué está permitido —todo lo que esté más
 * adelante— y eso sirve para validar, no para proponer. El recorrido de verdad
 * no es una fila india: después del primer corte hay una bifurcación (offset o
 * digital), las dos impresiones vuelven a juntarse en el troquel, y taller y
 * tercerizado son opcionales.
 *
 * Ese grafo vivía dentro del Kanban, donde dibujaba los botones de avance. Sale
 * acá porque dejó de tener un solo lector: cuando el prensista manda «fin OT
 * 40879, entro OT 40965», alguien tiene que decidir a qué etapa va la OT que
 * termina, y esa decisión tiene que ser la misma que toma el tablero. Dos copias
 * del recorrido se separan en cuanto alguien agregue una máquina.
 *
 * Devuelve varias opciones sólo donde hay una elección real. Un único elemento
 * significa que no hay nada que preguntar.
 */
export function naturalNextStatuses(current: OTWorkflowStatus): OTWorkflowStatus[] {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx < 0 || idx >= STATUS_ORDER.length - 1) return [];

  // Del primer corte se sale a una prensa, y cuál es una decisión de verdad.
  if (current === 'guillotine_first_cut') return ['offset_printing', 'digital_printing'];
  // Las dos impresiones se juntan otra vez en el troquel.
  if (current === 'offset_printing' || current === 'digital_printing') return ['die_cutting'];
  // Después del corte final: taller propio, un tercero, o directo a revisión.
  if (current === 'guillotine_final_cut') return ['workshop', 'outsourced', 'workshop_revision'];
  if (current === 'workshop' || current === 'outsourced') return ['workshop_revision'];

  const next = STATUS_ORDER[idx + 1];
  // `digital_printing`, `workshop` y `outsourced` son ramas, no el paso
  // siguiente de nadie: si el orden lineal cae en una de ellas, el paso real es
  // la revisión, que es donde vuelven a converger.
  if (next === 'digital_printing' || next === 'workshop' || next === 'outsourced') {
    return ['workshop_revision'];
  }
  return [next];
}

export function validateTransition(input: TransitionValidationInput): TransitionValidationResult {
  const { fromStatus, toStatus, role, hasApprovedApproval, hasAnyRealCosts, rollback } = input;

  // Rollback: only admin/supervisor can move backwards; skip forward-only and cost/approval guards
  if (rollback) {
    if (role !== 'admin' && role !== 'supervisor') {
      return {
        ok: false,
        code: 'ROLE_FORBIDDEN',
        message: 'Solo administradores y supervisores pueden hacer retrocesos.',
      };
    }
    if (!isValidStatus(toStatus)) {
      return { ok: false, code: 'INVALID_TRANSITION', message: 'Estado destino inválido.' };
    }
    return { ok: true };
  }

  const roleAllowedStatuses = ROLE_ACCESS[role] ?? [];
  if (!roleAllowedStatuses.includes(toStatus)) {
    return {
      ok: false,
      code: 'ROLE_FORBIDDEN',
      message: 'Tu rol no puede mover la OT a este estado.',
    };
  }

  const allowedForward = getAllowedNextStatuses(fromStatus);
  if (!allowedForward.includes(toStatus)) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      message: 'El flujo solo permite avanzar de estado (retroceso requiere rollback).',
    };
  }

  // ── Compuerta 1: no se sale de Pre-Prensa con la ficha a medias ──────────
  //
  // `visto_bueno` es la prueba que el cliente firma, y firmar una prueba es el
  // punto de no retorno: después se compra papel y se graban planchas. Mandar a
  // firmar una orden que todavía no sabe qué papel lleva ni cómo se monta es
  // pedirle al cliente que apruebe algo que no existe.
  //
  // El mensaje NOMBRA lo que falta. «Ficha incompleta» obliga a adivinar; «falta
  // la marca del sustrato, el montaje y el arte» se puede accionar.
  if (input.spec && fromStatus === 'pre_press' && toStatus === 'visto_bueno') {
    const gaps = missingFor(2, input.spec);
    if (gaps.length > 0) {
      return {
        ok: false,
        code: 'SPEC_INCOMPLETE',
        message:
          `${gaps.length === 1 ? 'Falta un dato' : `Faltan ${gaps.length} datos`} para poder mandar la prueba: ` +
          gaps.map((g) => g.label.toLowerCase()).join(', ') + '.',
        gaps,
      };
    }
  }

  // ── Compuerta 2: el precio firme no puede alejarse en silencio ───────────
  //
  // Comprar papel y grabar planchas es donde el trabajo queda comprometido. Si
  // Pre-Prensa descubrió que cuesta bastante más de lo cotizado, el cliente
  // firmó una prueba con un precio que ya no es. No se bloquea para siempre:
  // se pide que alguien lo reconfirme.
  if (toStatus === 'paper_purchase' && input.quotedPrice != null && input.firmPrice != null) {
    const drift = quoteDrift({ quoted: input.quotedPrice, firm: input.firmPrice });
    if (drift.direction === 'sube' && !input.repriceApproved) {
      return {
        ok: false,
        code: 'REPRICE_REQUIRED',
        message:
          `${drift.note} Comprar papel compromete el trabajo, así que hace falta ` +
          'reconfirmar el precio con el cliente antes de seguir.',
      };
    }
  }

  // ── Compuerta 3: no se entra a producción sin tener con qué ─────────────
  //
  // `ot_compras_estado` calculaba el veredicto `completo` y NADIE lo consultaba
  // — el mismo defecto que tenía el visto bueno: la compuerta calculada y sin
  // conectar. Una OT que pasa a bodega con el pantone sin pedir llega a la
  // prensa y ahí se descubre, con el papel ya cortado.
  //
  // No bloquea por falta de carga: si nadie cargó los requisitos, no se puede
  // afirmar que falte algo. Frenar por «no se sabe» enseñaría a cargar una
  // lista vacía para poder avanzar, que es peor que no tener la compuerta.
  if (toStatus === 'in_storage' && input.requirements) {
    const faltan = input.requirements.filter((r) => r.status !== 'resuelto' && r.status !== 'no_aplica');
    if (faltan.length > 0) {
      return {
        ok: false,
        code: 'REQUISITOS_PENDIENTES',
        message:
          `Falta conseguir ${faltan.length === 1 ? 'una cosa' : `${faltan.length} cosas`}: ` +
          faltan.map((r) => r.description).join(', ') +
          '. Marcá lo que ya esté o declaralo «no aplica».',
        pending: faltan,
      };
    }
  }

  if (toStatus === 'ready_for_delivery' && !hasApprovedApproval) {
    return {
      ok: false,
      code: 'APPROVAL_REQUIRED',
      message: 'Se requiere una aprobación de calidad antes de marcar lista para despacho.',
    };
  }

  if ((toStatus === 'in_delivery' || toStatus === 'completed') && !hasAnyRealCosts) {
    return {
      ok: false,
      code: 'COSTS_REQUIRED',
      message: 'Se requieren costos reales registrados antes de despachar o completar.',
    };
  }

  // ── Compuerta 4: un cierre puede faltar, pero no puede mentir ───────────
  //
  // Esta es la única compuerta que mira la etapa que TERMINA y no la que
  // empieza, porque lo que está en juego es la historia del trabajo recién
  // hecho. `machines` sabe lo que cuesta su hora y nunca tuvo por qué
  // multiplicarla: el costo real de una OT sumaba materiales y tercerizados con
  // el tiempo en cero, que es el recurso más caro del taller.
  //
  // Pero NO frena por falta de dato. Frenar la tarjeta no hace que alguien
  // cargue las horas: hace que el trabajo se mueva por fuera del sistema. Sin
  // horas la pasada queda abierta y la deuda se cobra en la compuerta 5, cuando
  // la OT se va a despachar y ya no hay a quién preguntarle.
  //
  // Lo que sí rechaza es lo imposible —480 horas, merma mayor que el tiraje—,
  // porque un número equivocado no se ve: entra al costo de la OT y al promedio
  // de la máquina como si fuera cierto. El vacío se puede completar; el
  // equivocado hay que descubrirlo primero.
  if (input.stageReport && promptsStageReport(fromStatus)) {
    const check = validateStageReport(input.stageReport, input.stageReportContext ?? {});
    if (!check.ok) {
      return {
        ok: false,
        code: 'STAGE_REPORT_INVALID',
        message: firstProblem(check) ?? 'El cierre de la etapa no es válido.',
      };
    }
  }

  // ── Compuerta 5: no se despacha con pasadas sin cerrar ──────────────────
  //
  // Acá vive la exigencia que la compuerta 4 dejó ir. Mientras la OT está en el
  // taller, la persona que sabe cuánto tomó cada etapa sigue estando; una vez
  // despachada, no. Este es el último momento en que preguntar sirve de algo.
  //
  // Es la misma forma que la compuerta de costos reales que ya vive dos líneas
  // más arriba, y por el mismo motivo: lo que no se registra antes de que el
  // trabajo salga por la puerta no se registra nunca.
  if (ETAPAS_DE_SALIDA.includes(toStatus) && input.openPasses) {
    const message = openPassesMessage(input.openPasses, otStatusLabel);
    if (message) {
      return { ok: false, code: 'PASADAS_ABIERTAS', message };
    }
  }

  return { ok: true };
}
