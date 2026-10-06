import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * Las tres constantes se calculan UNA vez, al importar el módulo, a partir
 * de process.env — por eso cada caso necesita su propio `vi.resetModules()`
 * + import dinámico después de fijar el env, no un simple cambio de
 * `process.env` sobre el módulo ya cargado.
 *
 * Esto es el mecanismo exacto detrás del hallazgo auditado dos veces en esta
 * sesión: NEXT_PUBLIC_DEV_BYPASS=true sólo es inofensivo si NODE_ENV es
 * realmente 'development' — cualquier otro valor (producción, o un 'test'
 * que alguien pise sin querer) debe hacer fallar el arranque, no abrir la
 * puerta en silencio.
 */

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

async function loadGuard(nodeEnv: string | undefined, devBypass: string | undefined) {
	vi.resetModules();
	if (nodeEnv === undefined) vi.stubEnv('NODE_ENV', '');
	else vi.stubEnv('NODE_ENV', nodeEnv);
	if (devBypass === undefined) vi.stubEnv('NEXT_PUBLIC_DEV_BYPASS', '');
	else vi.stubEnv('NEXT_PUBLIC_DEV_BYPASS', devBypass);
	return import('../dev-bypass-guard');
}

describe('en desarrollo real', () => {
	it('bypass pedido + NODE_ENV=development → habilitado, sin throw', async () => {
		const g = await loadGuard('development', 'true');
		expect(g.isDevEnvironment).toBe(true);
		expect(g.isDevBypassRequested).toBe(true);
		expect(g.isDevBypassEnabled).toBe(true);
		expect(() => g.assertDevBypassConfigSafe()).not.toThrow();
	});

	it('sin pedir bypass en desarrollo → deshabilitado, sin throw', async () => {
		const g = await loadGuard('development', undefined);
		expect(g.isDevBypassEnabled).toBe(false);
		expect(() => g.assertDevBypassConfigSafe()).not.toThrow();
	});
});

describe('fuera de desarrollo — el caso que importa', () => {
	it('bypass pedido en producción → deshabilitado Y lanza (no abre en silencio)', async () => {
		const g = await loadGuard('production', 'true');
		expect(g.isDevEnvironment).toBe(false);
		expect(g.isDevBypassEnabled).toBe(false);
		expect(() => g.assertDevBypassConfigSafe()).toThrow(/NEXT_PUBLIC_DEV_BYPASS/);
	});

	it('bypass pedido en un NODE_ENV que no es ni "development" ni "production" también lanza', async () => {
		// El caso real: algo que no sea exactamente 'development' (p. ej. un
		// 'test' mal propagado) es, para este chequeo, "no development".
		const g = await loadGuard('test', 'true');
		expect(g.isDevBypassEnabled).toBe(false);
		expect(() => g.assertDevBypassConfigSafe()).toThrow();
	});

	it('producción sin pedir bypass → todo deshabilitado, sin throw (el caso normal)', async () => {
		const g = await loadGuard('production', undefined);
		expect(g.isDevBypassEnabled).toBe(false);
		expect(() => g.assertDevBypassConfigSafe()).not.toThrow();
	});
});

describe('valores que no son el literal "true"', () => {
	it('NEXT_PUBLIC_DEV_BYPASS="1" no cuenta como pedido (sólo el string "true" exacto)', async () => {
		const g = await loadGuard('development', '1');
		expect(g.isDevBypassRequested).toBe(false);
		expect(g.isDevBypassEnabled).toBe(false);
	});
});
