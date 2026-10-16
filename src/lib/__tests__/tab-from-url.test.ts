import { describe, expect, it } from 'vitest';

/**
 * La regla que decide la pestaña inicial, probada sin React.
 *
 * `useTabFromUrl` es dos cosas: leer `?tab=` (eso lo hace Next) y validar el
 * valor contra las pestañas que la pantalla realmente tiene. La segunda es la
 * que puede estar mal y la que importa: `Tabs` con un `defaultValue` que no
 * corresponde a ningún `TabsTrigger` no abre ninguna pestaña — la pantalla
 * queda en blanco. Un enlace viejo, un typo o alguien probando a mano
 * alcanzaba para eso.
 *
 * Se prueba la regla y no el hook para no montar un router en un test de
 * `src/lib`. La función es la misma expresión que usa el hook.
 */
function resolveTab<T extends string>(allowed: readonly T[], fallback: T, requested: string | null): T {
	return allowed.includes(requested as T) ? (requested as T) : fallback;
}

const CONSOLA = ['equipo', 'contratos', 'retribucion', 'asistencia'] as const;
const TALENTO = ['habilidades', 'capacitacion', 'certificaciones', 'incentivos'] as const;

describe('qué pestaña abre ?tab=', () => {
	it('abre la pestaña pedida cuando existe', () => {
		expect(resolveTab(CONSOLA, 'equipo', 'contratos')).toBe('contratos');
		expect(resolveTab(CONSOLA, 'equipo', 'asistencia')).toBe('asistencia');
		expect(resolveTab(TALENTO, 'habilidades', 'certificaciones')).toBe('certificaciones');
		expect(resolveTab(TALENTO, 'habilidades', 'incentivos')).toBe('incentivos');
	});

	it('cae en la pestaña por defecto sin parámetro', () => {
		expect(resolveTab(CONSOLA, 'equipo', null)).toBe('equipo');
		expect(resolveTab(TALENTO, 'habilidades', null)).toBe('habilidades');
	});

	it('cae en la por defecto con un valor que no es una pestaña', () => {
		// Si esto devolviera el valor crudo, `Tabs` no encontraría el trigger y
		// la pantalla se vería vacía en vez de abrir algo.
		for (const basura of ['contrato', 'CONTRATOS', '', ' ', 'nomina', '../x', '1']) {
			expect(resolveTab(CONSOLA, 'equipo', basura)).toBe('equipo');
		}
	});

	it('no acepta una pestaña de la otra pantalla', () => {
		// `/personas/consola?tab=incentivos` no existe: incentivos es de talento.
		expect(resolveTab(CONSOLA, 'equipo', 'incentivos')).toBe('equipo');
		expect(resolveTab(TALENTO, 'habilidades', 'contratos')).toBe('habilidades');
	});

	it('los destinos de los ocho redirects son pestañas válidas', () => {
		// Ocho rutas de /personas se plegaron en dos pantallas con pestañas, y
		// cada una dejó un redirect con un ?tab= concreto. Si alguien renombra
		// una pestaña y olvida su redirect, esto falla acá en vez de aparecer
		// como una pantalla en blanco que nadie reporta.
		const destinos: Array<[readonly string[], string, string]> = [
			[CONSOLA, 'contratos',      '/personas/contratos'],
			[CONSOLA, 'asistencia',     '/personas/licencias'],
			[CONSOLA, 'equipo',         '/personas/empleados'],
			[CONSOLA, 'retribucion',    '/personas/nomina'],
			[TALENTO, 'certificaciones', '/personas/certificaciones'],
			[TALENTO, 'incentivos',     '/personas/incentivos'],
			[TALENTO, 'habilidades',    '/personas/habilidades'],
			[TALENTO, 'capacitacion',   '/personas/capacitacion'],
		];
		for (const [pantalla, tab, rutaVieja] of destinos) {
			const base = pantalla === CONSOLA ? 'equipo' : 'habilidades';
			expect(resolveTab(pantalla as readonly string[], base, tab), rutaVieja).toBe(tab);
		}
	});
});
