import type { NextRequest } from 'next/server';

/**
 * La IP del cliente, sin confiar en lo que el cliente mismo puede escribir.
 *
 * `X-Forwarded-For` lo puede setear cualquiera que arme el request a mano —
 * `x-forwarded-for.split(',')[0]` (la versión que vivía triplicada en
 * api-rate-limit.ts, proxy.ts y la ruta de NextAuth) toma exactamente el
 * extremo equivocado: el primer salto es lo que el cliente escribió: un
 * proxy de confianza APPENDEA el suyo al final, no lo antepone. Con eso, el
 * rate limit de login (`login:${ip}`, 5/60s) se esquivaba mandando un
 * `X-Forwarded-For` distinto en cada intento — cero costo, cero credenciales
 * (auditoría 2026-09-07).
 *
 * Esto es un parche, no la solución de fondo: `NextRequest.ip`/`.geo` se
 * sacaron en Next 15, y el reemplazo que Next documenta para Vercel —donde
 * corre esta app— es `ipAddress()` de `@vercel/functions`, que lee la
 * conexión real que ve el edge de Vercel en vez de parsear cabeceras. Preferir
 * eso cuando se agregue esa dependencia; esto tapa el hueco mientras tanto,
 * confiando en el ÚLTIMO salto (el que un proxy de un solo salto delante de
 * esta app —Vercel— habría agregado) en vez del primero.
 */
export function getClientIp(req: NextRequest): string {
	const real = req.headers.get('x-real-ip');
	if (real) return real.trim();

	const xff = req.headers.get('x-forwarded-for');
	if (xff) {
		const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
		if (hops.length > 0) return hops[hops.length - 1];
	}
	return 'unknown';
}
