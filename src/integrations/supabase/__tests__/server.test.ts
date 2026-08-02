import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// El cliente real haría red en el import; aquí sólo interesa CUÁNDO se construye.
const createClient = vi.fn((url: string) => ({
	tag: url,
	from(table: string) {
		// Método, no flecha: si el proxy pierde el `this`, esto revienta.
		return `${this.tag}:${table}`;
	},
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

const ENV = { ...process.env };

beforeEach(() => {
	vi.resetModules();
	createClient.mockClear();
	process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://taller.supabase.co';
	process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
});

afterEach(() => {
	process.env = { ...ENV };
});

describe('el cliente de servidor se construye al usarlo, no al importarlo', () => {
	it('importar el módulo no construye nada', async () => {
		// Es lo que rompía `next build`: recoger los datos de cada ruta evalúa el
		// módulo, y sin secretos la construcción tumbaba la compilación entera.
		await import('../server');
		expect(createClient).not.toHaveBeenCalled();
	});

	it('la primera consulta lo construye y reenvía la llamada', async () => {
		const { supabaseAdmin } = await import('../server');
		expect(createClient).not.toHaveBeenCalled();

		expect(supabaseAdmin.from('ots' as never)).toBe('https://taller.supabase.co:ots');
		expect(createClient).toHaveBeenCalledTimes(1);
	});

	it('se construye una sola vez, por muchas consultas que haya', async () => {
		const { supabaseAdmin } = await import('../server');
		supabaseAdmin.from('ots' as never);
		supabaseAdmin.from('employees' as never);
		supabaseAdmin.from('machines' as never);
		expect(createClient).toHaveBeenCalledTimes(1);
	});

	it('sin variables de entorno falla la consulta, no el build', async () => {
		delete process.env.NEXT_PUBLIC_SUPABASE_URL;
		delete process.env.SUPABASE_URL;
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;

		const { supabaseAdmin } = await import('../server');
		// El import sigue siendo inocuo: el error llega al primer uso, y nombra
		// la variable que falta.
		expect(() => supabaseAdmin.from('ots' as never)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
	});

	it('SUPABASE_URL sirve de alternativa a la pública', async () => {
		delete process.env.NEXT_PUBLIC_SUPABASE_URL;
		process.env.SUPABASE_URL = 'https://interno.supabase.co';

		const { supabaseAdmin } = await import('../server');
		expect(supabaseAdmin.from('ots' as never)).toBe('https://interno.supabase.co:ots');
	});
});
