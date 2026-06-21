/**
 * FSSC 22000 compliance logic — pure, testable functions extracted from the
 * Calidad routes so the certification-critical computations can be unit-tested
 * and reused (Expediente dossier, certifications register, mock-recall).
 */

// ─── Certificate validity ────────────────────────────────────────────────────

/** Cert state evaluated at the moment a lot was consumed (used by the dossier). */
export type CertStatusAtUse = 'ok' | 'expired' | 'missing' | 'unverified' | 'not_required';

/** Cert state evaluated *now* (used by the incoming-material register). */
export type CertStatusNow = 'vigente' | 'por_vencer' | 'vencido' | 'faltante' | 'sin_vencimiento';

const ms = (d: string | number | Date) => new Date(d).getTime();

/**
 * Was the food-grade certificate valid when the lot was consumed?
 * Only enforced when the item requires certification.
 */
export function certStatusAtUse(p: {
  certRequired: boolean;
  code: string | null | undefined;
  expiresOn: string | null | undefined;
  consumedAt: string | number | Date;
}): CertStatusAtUse {
  if (!p.certRequired) return 'not_required';
  if (!p.code) return 'missing';
  if (!p.expiresOn) return 'unverified';
  return ms(p.expiresOn) < ms(p.consumedAt) ? 'expired' : 'ok';
}

/** A dossier cert issue = blocks conformity (missing / expired / unverified). */
export function isCertIssueAtUse(s: CertStatusAtUse): boolean {
  return s === 'missing' || s === 'expired' || s === 'unverified';
}

export const CERT_SOON_DAYS = 30;

/** Current validity of a (certification-required) lot's certificate. */
export function certStatusNow(p: {
  code: string | null | undefined;
  expiresOn: string | null | undefined;
  now?: Date;
  soonDays?: number;
}): CertStatusNow {
  if (!p.code) return 'faltante';
  if (!p.expiresOn) return 'sin_vencimiento';
  const now = (p.now ?? new Date()).getTime();
  const soonMs = (p.soonDays ?? CERT_SOON_DAYS) * 86_400_000;
  const exp = ms(p.expiresOn);
  if (exp < now) return 'vencido';
  if (exp - now <= soonMs) return 'por_vencer';
  return 'vigente';
}

// ─── Dossier conformity verdict ─────────────────────────────────────────────

export interface DossierComplianceInput {
  materialCertStatuses: CertStatusAtUse[];
  materialsCount: number;
  attachmentsCount: number;
  hasApproval: boolean;
}

export interface DossierCompliance {
  compliant: boolean;
  certIssues: number;
  reasons: string[];
}

/** Conforme only when certs are valid AND there's a photo AND a sign-off. */
export function evaluateDossierCompliance(input: DossierComplianceInput): DossierCompliance {
  const certIssues = input.materialCertStatuses.filter(isCertIssueAtUse).length;
  const reasons: string[] = [];
  if (certIssues > 0) reasons.push(`${certIssues} insumo(s) con certificación inválida o faltante`);
  if (!input.hasApproval) reasons.push('Sin aprobación de entregable');
  if (input.attachmentsCount === 0) reasons.push('Sin evidencia fotográfica del entregable');
  if (input.materialsCount === 0) reasons.push('Sin insumos trazados a esta OT');
  return { compliant: reasons.length === 0, certIssues, reasons };
}

// ─── Mock-recall (forward trace) ─────────────────────────────────────────────

/** Sum the quantity consumed per work order from raw consumption rows. */
export function consumptionByOt(
  txs: Array<{ work_order_id: string | null; quantity: number | null }>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const tx of txs) {
    if (!tx.work_order_id) continue;
    out.set(tx.work_order_id, (out.get(tx.work_order_id) ?? 0) + Number(tx.quantity ?? 0));
  }
  return out;
}

/** Distinct affected customers + impact summary from the affected OTs. */
export function recallSummary(
  affectedOts: Array<{ client_name: string | null; consumed_quantity: number }>
): { customers: string[]; ot_count: number; customer_count: number; total_consumed: number } {
  const customers = Array.from(
    new Set(affectedOts.map((o) => o.client_name).filter((c): c is string => !!c))
  ).sort();
  const total = affectedOts.reduce((s, o) => s + Number(o.consumed_quantity ?? 0), 0);
  return {
    customers,
    ot_count: affectedOts.length,
    customer_count: customers.length,
    total_consumed: total,
  };
}
