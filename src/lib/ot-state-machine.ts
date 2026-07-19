import { z } from 'zod';
import type { AppRole } from '@/types/app-role';

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
}

export interface TransitionValidationResult {
  ok: boolean;
  code?: 'INVALID_TRANSITION' | 'ROLE_FORBIDDEN' | 'APPROVAL_REQUIRED' | 'COSTS_REQUIRED';
  message?: string;
}

export function isValidStatus(value: string): value is OTWorkflowStatus {
  return OTStatusSchema.safeParse(value).success;
}

export function getAllowedNextStatuses(current: OTWorkflowStatus): OTWorkflowStatus[] {
  return FORWARD_TRANSITIONS.get(current) ?? [];
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

  return { ok: true };
}
