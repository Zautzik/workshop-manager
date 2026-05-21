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

const FORWARD_TRANSITIONS = new Map<OTWorkflowStatus, OTWorkflowStatus[]>(
  STATUS_ORDER.map((status, index) => [status, STATUS_ORDER.slice(index + 1)])
);

const ROLE_ACCESS: Record<AppRole, OTWorkflowStatus[]> = {
  admin: STATUS_ORDER,
  supervisor: STATUS_ORDER,
  manager: ['pre_press', 'visto_bueno', 'ready_for_delivery', 'in_delivery', 'completed'],
  hr_manager: ['pre_press', 'visto_bueno'],
  technician: ['guillotine_first_cut', 'offset_printing', 'digital_printing', 'die_cutting', 'guillotine_final_cut', 'workshop', 'outsourced', 'workshop_revision'],
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
      message: 'Your role is not allowed to move OT to this status.',
    };
  }

  const allowedForward = getAllowedNextStatuses(fromStatus);
  if (!allowedForward.includes(toStatus)) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      message: 'Only forward transitions are allowed in this workflow.',
    };
  }

  if (toStatus === 'ready_for_delivery' && !hasApprovedApproval) {
    return {
      ok: false,
      code: 'APPROVAL_REQUIRED',
      message: 'An approved OT approval is required before delivery readiness.',
    };
  }

  if ((toStatus === 'in_delivery' || toStatus === 'completed') && !hasAnyRealCosts) {
    return {
      ok: false,
      code: 'COSTS_REQUIRED',
      message: 'Real cost records are required before delivery or completion.',
    };
  }

  return { ok: true };
}
