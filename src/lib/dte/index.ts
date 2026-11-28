import type { DteProvider } from './types';
import { NuboxProvider } from './nubox';

export * from './types';
export { validateDte, isValidRut, normalizeRut, rutCheckDigit } from './validate';

/**
 * El proveedor de DTE configurado, o null si la emisión está apagada.
 *
 * Apagada es el estado por defecto y es seguro: las facturas se siguen
 * registrando como hoy (registro interno), y nada se manda al SII. Se enciende
 * con DTE_PROVIDER=nubox y las tres credenciales; si falta alguna, se queda
 * apagada y `dteConfigStatus` dice cuál.
 */
export function getDteProvider(env: NodeJS.ProcessEnv = process.env): DteProvider | null {
  const st = dteConfigStatus(env);
  if (!st.enabled || st.missing.length > 0) return null;
  return new NuboxProvider({
    baseUrl: env.NUBOX_BASE_URL!,
    secretKey: env.NUBOX_SECRET_KEY!,
    apiKey: env.NUBOX_API_KEY!,
  });
}

export interface DteConfigStatus {
  provider: 'nubox' | null;
  enabled: boolean;
  /** Nombres de variables que faltan — nunca sus valores. */
  missing: string[];
  /** Certificación (UAT) o producción, deducido de la URL. */
  environment: 'certificacion' | 'produccion' | null;
}

export function dteConfigStatus(env: NodeJS.ProcessEnv = process.env): DteConfigStatus {
  const provider = (env.DTE_PROVIDER ?? '').trim().toLowerCase();
  if (provider !== 'nubox') return { provider: null, enabled: false, missing: [], environment: null };
  const missing = ['NUBOX_BASE_URL', 'NUBOX_SECRET_KEY', 'NUBOX_API_KEY'].filter((k) => !env[k]?.trim());
  const url = env.NUBOX_BASE_URL ?? '';
  const environment = !url ? null : /(cert|uat|sandbox|test|qa)/i.test(url) ? 'certificacion' : 'produccion';
  return { provider: 'nubox', enabled: true, missing, environment };
}
