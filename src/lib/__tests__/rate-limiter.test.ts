import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkRateLimit, retryAfterSeconds } from '../rate-limiter';

/**
 * El store es un Map a nivel de módulo — persiste entre tests de este mismo
 * archivo. Cada test usa su propia key (vía `uniqueKey()`) para no pisarse
 * con los demás, en vez de confiar en que el orden de ejecución no cambie.
 */
let counter = 0;
function uniqueKey(label: string): string {
	counter += 1;
	return `${label}:${counter}`;
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('checkRateLimit', () => {
	it('permite requests por debajo del límite y cuenta remaining correctamente', () => {
		const key = uniqueKey('bajo-limite');
		const r1 = checkRateLimit(key, 3, 60_000);
		expect(r1).toMatchObject({ ok: true, limit: 3, remaining: 2 });

		const r2 = checkRateLimit(key, 3, 60_000);
		expect(r2).toMatchObject({ ok: true, remaining: 1 });
	});

	it('bloquea apenas se supera el límite', () => {
		const key = uniqueKey('supera-limite');
		checkRateLimit(key, 2, 60_000);
		checkRateLimit(key, 2, 60_000);
		const r3 = checkRateLimit(key, 2, 60_000);
		expect(r3).toMatchObject({ ok: false, remaining: 0 });
	});

	it('sigue contando (y bloqueando) más allá del límite', () => {
		const key = uniqueKey('sigue-contando');
		checkRateLimit(key, 1, 60_000);
		const r2 = checkRateLimit(key, 1, 60_000);
		const r3 = checkRateLimit(key, 1, 60_000);
		expect(r2.ok).toBe(false);
		expect(r3.ok).toBe(false);
		expect(r3.remaining).toBe(0);
	});

	it('la ventana expira y el contador vuelve a partir de cero', () => {
		const key = uniqueKey('ventana-expira');
		checkRateLimit(key, 1, 60_000);
		const bloqueado = checkRateLimit(key, 1, 60_000);
		expect(bloqueado.ok).toBe(false);

		vi.advanceTimersByTime(60_001);

		const nuevaVentana = checkRateLimit(key, 1, 60_000);
		expect(nuevaVentana.ok).toBe(true);
		expect(nuevaVentana.remaining).toBe(0);
	});

	it('keys distintas no se pisan entre sí', () => {
		const a = uniqueKey('key-a');
		const b = uniqueKey('key-b');
		checkRateLimit(a, 1, 60_000);
		const rb = checkRateLimit(b, 1, 60_000);
		expect(rb.ok).toBe(true);
	});

	it('resetAt queda fijo en el primer hit de la ventana, no se mueve con hits siguientes', () => {
		const key = uniqueKey('reset-fijo');
		const r1 = checkRateLimit(key, 5, 60_000);
		vi.advanceTimersByTime(1_000);
		const r2 = checkRateLimit(key, 5, 60_000);
		expect(r2.resetAt).toBe(r1.resetAt);
	});
});

describe('retryAfterSeconds', () => {
	it('redondea hacia arriba el tiempo restante hasta resetAt', () => {
		const key = uniqueKey('retry-after');
		const r = checkRateLimit(key, 1, 60_000);
		vi.advanceTimersByTime(1_000); // quedan 59.0s exactos
		expect(retryAfterSeconds(r)).toBe(59);
	});

	it('nunca es negativo si resetAt ya pasó', () => {
		const key = uniqueKey('retry-after-vencido');
		const r = checkRateLimit(key, 1, 1_000);
		vi.advanceTimersByTime(5_000);
		expect(retryAfterSeconds(r)).toBeLessThanOrEqual(0);
	});
});
