import { describe, it, expect } from 'vitest';
import type { NextRequest } from 'next/server';
import { buildRateLimitActor, enforceRouteRateLimit } from '../api-rate-limit';

let counter = 0;
function uniqueKey(label: string): string {
	counter += 1;
	return `${label}:${counter}`;
}

function reqWith(headers: Record<string, string>): NextRequest {
	return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe('buildRateLimitActor', () => {
	it('un usuario autenticado se identifica por su id, no por la IP', () => {
		const req = reqWith({ 'x-real-ip': '203.0.113.9' });
		expect(buildRateLimitActor(req, 'user-42')).toBe('user:user-42');
	});

	it('sin userId cae a la IP del cliente', () => {
		const req = reqWith({ 'x-real-ip': '203.0.113.9' });
		expect(buildRateLimitActor(req)).toBe('ip:203.0.113.9');
	});

	it('userId null o vacío también cae a la IP (no "user:null")', () => {
		const req = reqWith({ 'x-real-ip': '203.0.113.9' });
		expect(buildRateLimitActor(req, null)).toBe('ip:203.0.113.9');
	});
});

describe('enforceRouteRateLimit', () => {
	it('devuelve null (deja pasar) mientras está dentro del límite', () => {
		const req = reqWith({});
		const res = enforceRouteRateLimit({ req, key: uniqueKey('ok'), limit: 3, windowMs: 60_000 });
		expect(res).toBeNull();
	});

	it('devuelve 429 con los headers de rate-limit al superar el límite', async () => {
		const key = uniqueKey('bloqueo');
		const req = reqWith({});
		enforceRouteRateLimit({ req, key, limit: 1, windowMs: 60_000 });
		const res = enforceRouteRateLimit({ req, key, limit: 1, windowMs: 60_000 });

		expect(res).not.toBeNull();
		expect(res!.status).toBe(429);
		expect(res!.headers.get('X-RateLimit-Limit')).toBe('1');
		expect(res!.headers.get('X-RateLimit-Remaining')).toBe('0');
		expect(Number(res!.headers.get('Retry-After'))).toBeGreaterThan(0);

		const body = await res!.json();
		expect(body.error).toBe('Too Many Requests');
	});

	it('usa el mensaje personalizado cuando se provee', async () => {
		const key = uniqueKey('mensaje-custom');
		const req = reqWith({});
		enforceRouteRateLimit({ req, key, limit: 1, windowMs: 60_000, message: 'Demasiados intentos de login' });
		const res = enforceRouteRateLimit({ req, key, limit: 1, windowMs: 60_000, message: 'Demasiados intentos de login' });

		const body = await res!.json();
		expect(body.error).toBe('Demasiados intentos de login');
	});
});
