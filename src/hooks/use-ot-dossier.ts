'use client';
import { useQuery } from '@tanstack/react-query';

export type CertStatus = 'ok' | 'missing' | 'expired' | 'unverified' | 'not_required';

export interface DossierMaterial {
  tx_id: string;
  quantity: number;
  unit_cost: number | null;
  consumed_at: string;
  item_name: string | null;
  item_sku: string | null;
  unit: string | null;
  cert_required: boolean;
  lot_number: string | null;
  supplier_name: string | null;
  certification_code: string | null;
  certification_expires_on: string | null;
  cert_status: CertStatus;
}

export interface DossierResponse {
  ot: {
    id: string;
    ot_number: string | null;
    client_name: string | null;
    status: string | null;
    created_at: string | null;
    quantity: number | null;
    deadline: string | null;
    description: string | null;
  };
  materials: DossierMaterial[];
  attachments: Array<{ id: string; filename: string; storage_path: string; mime_type: string | null; created_at: string; url: string | null }>;
  approvals: Array<{ id: string; status: string; comments: string | null; resolved_at: string | null; created_at: string }>;
  compliance: {
    compliant: boolean;
    cert_issues: number;
    materials_count: number;
    photo_count: number;
    has_approval: boolean;
    reasons: string[];
  };
}

/** FSSC 22000 traceability dossier for one OT. Disabled until an id is given. */
export function useOTDossier(otId: string | null) {
  return useQuery<DossierResponse>({
    queryKey: ['ot-dossier', otId],
    enabled: !!otId,
    queryFn: async () => {
      const res = await fetch(`/api/ots/${otId}/dossier`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch dossier: ${res.status}`);
      return res.json();
    },
  });
}
