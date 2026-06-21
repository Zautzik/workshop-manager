import { describe, it, expect } from 'vitest';
import {
  certStatusAtUse,
  certStatusNow,
  isCertIssueAtUse,
  evaluateDossierCompliance,
  consumptionByOt,
  recallSummary,
} from '@/lib/fssc';

const NOW = new Date('2026-06-21T00:00:00Z');

describe('certStatusAtUse (dossier — validity at consumption)', () => {
  it('returns not_required when the item does not require certification', () => {
    expect(certStatusAtUse({ certRequired: false, code: null, expiresOn: null, consumedAt: NOW })).toBe('not_required');
  });
  it('missing when cert required but no code', () => {
    expect(certStatusAtUse({ certRequired: true, code: null, expiresOn: '2030-01-01', consumedAt: NOW })).toBe('missing');
  });
  it('unverified when code present but no expiry', () => {
    expect(certStatusAtUse({ certRequired: true, code: 'C1', expiresOn: null, consumedAt: NOW })).toBe('unverified');
  });
  it('expired when the cert lapsed before consumption', () => {
    expect(certStatusAtUse({ certRequired: true, code: 'C1', expiresOn: '2026-01-01', consumedAt: '2026-02-01' })).toBe('expired');
  });
  it('ok when valid at consumption (and at the exact boundary)', () => {
    expect(certStatusAtUse({ certRequired: true, code: 'C1', expiresOn: '2026-12-01', consumedAt: '2026-02-01' })).toBe('ok');
    expect(certStatusAtUse({ certRequired: true, code: 'C1', expiresOn: '2026-02-01', consumedAt: '2026-02-01' })).toBe('ok');
  });
});

describe('isCertIssueAtUse', () => {
  it('flags missing/expired/unverified as issues', () => {
    expect(isCertIssueAtUse('missing')).toBe(true);
    expect(isCertIssueAtUse('expired')).toBe(true);
    expect(isCertIssueAtUse('unverified')).toBe(true);
  });
  it('does not flag ok / not_required', () => {
    expect(isCertIssueAtUse('ok')).toBe(false);
    expect(isCertIssueAtUse('not_required')).toBe(false);
  });
});

describe('certStatusNow (incoming-material register)', () => {
  it('faltante when no code', () => {
    expect(certStatusNow({ code: null, expiresOn: '2030-01-01', now: NOW })).toBe('faltante');
  });
  it('sin_vencimiento when code but no expiry', () => {
    expect(certStatusNow({ code: 'C1', expiresOn: null, now: NOW })).toBe('sin_vencimiento');
  });
  it('vencido when expiry is in the past', () => {
    expect(certStatusNow({ code: 'C1', expiresOn: '2026-06-01', now: NOW })).toBe('vencido');
  });
  it('por_vencer within the soon window (≤30d)', () => {
    expect(certStatusNow({ code: 'C1', expiresOn: '2026-07-10', now: NOW })).toBe('por_vencer');
  });
  it('vigente when comfortably valid', () => {
    expect(certStatusNow({ code: 'C1', expiresOn: '2026-12-01', now: NOW })).toBe('vigente');
  });
});

describe('evaluateDossierCompliance', () => {
  it('Conforme when certs valid, photo present and signed off', () => {
    const r = evaluateDossierCompliance({
      materialCertStatuses: ['ok', 'not_required'],
      materialsCount: 2, attachmentsCount: 1, hasApproval: true,
    });
    expect(r.compliant).toBe(true);
    expect(r.certIssues).toBe(0);
    expect(r.reasons).toEqual([]);
  });
  it('No conforme without a deliverable photo', () => {
    const r = evaluateDossierCompliance({ materialCertStatuses: ['ok'], materialsCount: 1, attachmentsCount: 0, hasApproval: true });
    expect(r.compliant).toBe(false);
    expect(r.reasons).toContain('Sin evidencia fotográfica del entregable');
  });
  it('counts cert issues and reports them', () => {
    const r = evaluateDossierCompliance({ materialCertStatuses: ['expired', 'missing', 'ok'], materialsCount: 3, attachmentsCount: 1, hasApproval: true });
    expect(r.certIssues).toBe(2);
    expect(r.compliant).toBe(false);
    expect(r.reasons.some((x) => x.includes('certificación'))).toBe(true);
  });
  it('flags an empty dossier on every axis', () => {
    const r = evaluateDossierCompliance({ materialCertStatuses: [], materialsCount: 0, attachmentsCount: 0, hasApproval: false });
    expect(r.compliant).toBe(false);
    expect(r.reasons).toContain('Sin aprobación de entregable');
    expect(r.reasons).toContain('Sin insumos trazados a esta OT');
  });
});

describe('mock-recall aggregation', () => {
  it('sums consumed quantity per OT and ignores null work orders', () => {
    const m = consumptionByOt([
      { work_order_id: 'a', quantity: 2 },
      { work_order_id: 'a', quantity: 3 },
      { work_order_id: 'b', quantity: 1 },
      { work_order_id: null, quantity: 9 },
    ]);
    expect(m.size).toBe(2);
    expect(m.get('a')).toBe(5);
    expect(m.get('b')).toBe(1);
  });

  it('produces distinct sorted customers and a correct impact summary', () => {
    const s = recallSummary([
      { client_name: 'Zeta', consumed_quantity: 2 },
      { client_name: 'Alfa', consumed_quantity: 3 },
      { client_name: 'Alfa', consumed_quantity: 1 },
      { client_name: null, consumed_quantity: 5 },
    ]);
    expect(s.customers).toEqual(['Alfa', 'Zeta']);
    expect(s.customer_count).toBe(2);
    expect(s.ot_count).toBe(4);
    expect(s.total_consumed).toBe(11);
  });
});
