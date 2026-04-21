import type { AppRole } from '@/types/app-role';

export type OTWorkflowStatus =
  | 'pre_press'
  | 'visto_bueno'
  | 'paper_purchase'
  | 'in_storage'
  | 'guillotine_first_cut'
  | 'offset_printing'
  | 'die_cutting'
  | 'guillotine_final_cut'
  | 'workshop'
  | 'outsourced'
  | 'workshop_revision'
  | 'ready_for_delivery'
  | 'in_delivery'
  | 'completed';

const STATUS_ORDER: OTWorkflowStatus[] = [
  'pre_press',
  'visto_bueno',
  'paper_purchase',
  'in_storage',
  'guillotine_first_cut',
  'offset_printing',
  'die_cutting',
  'guillotine_final_cut',
  'workshop',
  'outsourced',
  'workshop_revision',
  'ready_for_delivery',
  'in_delivery',
  'completed',
];

const FORWARD_TRANSITIONS = new Map<OTWorkflowStatus, OTWorkflowStatus[]>(
  STATUS_ORDER.map((status, index) => [status, STATUS_ORDER.slice(index + 1)])
);

const ROLE_ACCESS: Record<AppRole, OTWorkflowStatus[]> = {
  admin: STATUS_ORDER,
  supervisor: STATUS_ORDER,
  manager: ['pre_press', 'visto_bueno', 'ready_for_delivery', 'in_delivery', 'completed'],
  hr_manager: ['pre_press', 'visto_bueno'],
  technician: ['guillotine_first_cut', 'offset_printing', 'die_cutting', 'guillotine_final_cut', 'workshop', 'outsourced', 'workshop_revision'],
};

export interface TransitionValidationInput {
  fromStatus: OTWorkflowStatus;
  toStatus: OTWorkflowStatus;
  role: AppRole;
  hasApprovedApproval: boolean;
  hasAnyRealCosts: boolean;
}

export interface TransitionValidationResult {
  ok: boolean;
  code?: 'INVALID_TRANSITION' | 'ROLE_FORBIDDEN' | 'APPROVAL_REQUIRED' | 'COSTS_REQUIRED';
  message?: string;
}

export function isValidStatus(value: string): value is OTWorkflowStatus {
  return STATUS_ORDER.includes(value as OTWorkflowStatus);
}

export function getAllowedNextStatuses(current: OTWorkflowStatus): OTWorkflowStatus[] {
  return FORWARD_TRANSITIONS.get(current) ?? [];
}

export function validateTransition(input: TransitionValidationInput): TransitionValidationResult {
  const { fromStatus, toStatus, role, hasApprovedApproval, hasAnyRealCosts } = input;

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
