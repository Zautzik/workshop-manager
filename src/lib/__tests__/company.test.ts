import { describe, expect, it } from 'vitest';
import { EMPRESA, EMPRESA_PENDIENTE, datoEmpresa, datoPendiente } from '../company';

/**
 * La identidad de la empresa, y qué parte de ella se puede publicar.
 *
 * El 2026-10-14 la política de privacidad decía «Gonsa S.A.» en un archivo
 * estático mientras `company.ts` decía «Imprenta Gons SpA»: dos archivos que
 * nadie lee juntos, y en Chile S.A. y SpA son tipos de sociedad distintos. Al
 * unificarlo apareció el problema siguiente, peor: la razón social ya es real y
 * el RUT sigue siendo de relleno, así que un nombre verdadero quedaba pegado a
 * un identificador inventado — en el documento que identifica al responsable
 * del tratamiento, y en la cotización que sale al cliente.
 *
 * Estas pruebas cuidan el mecanismo que evita eso, no los valores: lo que no
 * está verificado no se imprime.
 */
describe('identidad de la empresa', () => {
	it('la razón social es real y no quedó un marcador', () => {
		expect(EMPRESA.razonSocial).toBe('Inversiones Gonsa S.A.');
		expect(datoPendiente('razonSocial')).toBe(false);
		// Que no vuelva el relleno viejo por un merge descuidado.
		expect(EMPRESA.razonSocial).not.toMatch(/Imprenta Gons SpA/);
	});

	it('razón social y nombre nunca pueden estar pendientes', () => {
		// Son lo único que un documento legal no puede omitir: sin responsable
		// identificado, el documento no sirve. Si alguien los agrega a la lista,
		// esto falla acá y no en una página publicada a medias.
		expect(datoPendiente('razonSocial')).toBe(false);
		expect(datoPendiente('nombre')).toBe(false);
	});

	it('`datoEmpresa` devuelve null para lo pendiente y el valor para lo verificado', () => {
		for (const campo of EMPRESA_PENDIENTE) {
			expect(datoEmpresa(campo)).toBeNull();
		}
		expect(datoEmpresa('razonSocial')).toBe(EMPRESA.razonSocial);
	});

	it('toda clave pendiente existe de verdad en EMPRESA', () => {
		// Una clave mal escrita en la lista haría que un dato de relleno se
		// considere verificado y se imprima.
		for (const campo of EMPRESA_PENDIENTE) {
			expect(Object.keys(EMPRESA)).toContain(campo);
		}
	});

	it('el RUT de relleno no se puede publicar mientras siga pendiente', () => {
		// 76.543.210-K es inventado. Mientras esté pendiente, nadie lo imprime.
		if (EMPRESA.rut === '76.543.210-K') {
			expect(datoPendiente('rut')).toBe(true);
			expect(datoEmpresa('rut')).toBeNull();
		}
	});
});
