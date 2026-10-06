import { describe, it, expect } from 'vitest';
import type { NextRequest } from 'next/server';
import { getClientIp } from '../client-ip';

/**
 * El bug real que esto cierra: `x-forwarded-for.split(',')[0]` tomaba el
 * PRIMER salto, que es exactamente lo que el cliente escribe a mano — con eso
 * el rate limit de login se esquivaba mandando un XFF distinto en cada
 * intento (auditoría 2026-09-07). La corrección es confiar en el ÚLTIMO
 * salto. Las pruebas de abajo existen para que nadie vuelva a tomar `[0]`
 * pensando que es una simplificación inocente.
 */

function reqWith(headers: Record<string, string>): NextRequest {
	return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe('getClientIp', () => {
	it('usa x-real-ip cuando está presente', () => {
		expect(getClientIp(reqWith({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
	});

	it('recorta espacios de x-real-ip', () => {
		expect(getClientIp(reqWith({ 'x-real-ip': '  203.0.113.9  ' }))).toBe('203.0.113.9');
	});

	it('x-real-ip manda por sobre x-forwarded-for', () => {
		const req = reqWith({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' });
		expect(getClientIp(req)).toBe('203.0.113.9');
	});

	it('con x-forwarded-for usa el ÚLTIMO salto, no el primero', () => {
		// 1.1.1.1 es lo que el cliente escribió a mano; 2.2.2.2 es lo que el
		// proxy de confianza (Vercel) le agregó al final. Tomar [0] es el bug.
		const req = reqWith({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' });
		expect(getClientIp(req)).toBe('2.2.2.2');
	});

	it('un spoof distinto en cada intento no cambia la IP resuelta si el último salto es siempre el mismo proxy', () => {
		const intento1 = reqWith({ 'x-forwarded-for': '9.9.9.9, 2.2.2.2' });
		const intento2 = reqWith({ 'x-forwarded-for': '7.7.7.7, 2.2.2.2' });
		expect(getClientIp(intento1)).toBe(getClientIp(intento2));
	});

	it('recorta espacios alrededor de cada salto', () => {
		const req = reqWith({ 'x-forwarded-for': ' 1.1.1.1 ,  2.2.2.2 ' });
		expect(getClientIp(req)).toBe('2.2.2.2');
	});

	it('un solo salto en x-forwarded-for se usa igual', () => {
		expect(getClientIp(reqWith({ 'x-forwarded-for': '1.1.1.1' }))).toBe('1.1.1.1');
	});

	it('x-forwarded-for vacío o sólo comas cae a "unknown"', () => {
		expect(getClientIp(reqWith({ 'x-forwarded-for': ' , , ' }))).toBe('unknown');
	});

	it('sin ninguna cabecera devuelve "unknown"', () => {
		expect(getClientIp(reqWith({}))).toBe('unknown');
	});
});
