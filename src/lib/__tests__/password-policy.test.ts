import { describe, it, expect } from 'vitest';
import {
	checkPassword,
	MIN_PASSWORD_LENGTH,
	MAX_PASSWORD_LENGTH,
	COMMON_PASSWORD_COUNT,
} from '../password-policy';

describe('checkPassword — largo', () => {
	it('rechaza por debajo del mínimo', () => {
		const r = checkPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1));
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(String(MIN_PASSWORD_LENGTH));
	});

	it('acepta exactamente el mínimo (si no es común)', () => {
		expect(checkPassword('a'.repeat(MIN_PASSWORD_LENGTH))).toEqual({ ok: true });
	});

	it('acepta exactamente el máximo', () => {
		expect(checkPassword('a'.repeat(MAX_PASSWORD_LENGTH))).toEqual({ ok: true });
	});

	it('rechaza por encima del máximo', () => {
		const r = checkPassword('a'.repeat(MAX_PASSWORD_LENGTH + 1));
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(String(MAX_PASSWORD_LENGTH));
	});
});

describe('checkPassword — lista de comunes', () => {
	it('rechaza una contraseña común tal cual', () => {
		expect(checkPassword('password123')).toEqual({
			ok: false,
			reason: expect.stringContaining('common'),
		});
	});

	it('la comparación contra la lista es insensible a mayúsculas', () => {
		expect(checkPassword('PASSWORD123').ok).toBe(false);
		expect(checkPassword('QwErTy123').ok).toBe(false);
	});

	it('acepta una contraseña no común que cumple el largo', () => {
		expect(checkPassword('xk9$vLm2#qRz')).toEqual({ ok: true });
	});

	it('la lista no está vacía (la política existe de verdad)', () => {
		expect(COMMON_PASSWORD_COUNT).toBeGreaterThan(50);
	});

	it('el chequeo de largo gana sobre el de la lista para strings cortos', () => {
		// 'abc123' no está en la lista Y además es corto; el mensaje debe ser
		// el de largo, no el de "común" — importa para no confundir al usuario
		// con el motivo real del rechazo.
		const r = checkPassword('abc123');
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(String(MIN_PASSWORD_LENGTH));
	});
});
