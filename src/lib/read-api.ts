/**
 * Client side of GET /api/reads/[name] — the declared server reads that
 * replaced the browser's direct table queries (audit H5).
 */
export async function readApi<T>(name: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/reads/${name}${qs ? `?${qs}` : ''}`, { credentials: 'include' });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `No se pudo leer ${name} (${res.status})`);
  return body.data as T;
}
