#!/usr/bin/env node
/**
 * Corre las pruebas de integración contra el stack local de Supabase.
 *
 * ── Por qué un script y no variables en el package.json ───────────────────
 *
 * Porque de dónde salen las credenciales ES la garantía de seguridad. Estas
 * pruebas escriben, cierran órdenes de mantención y mueven fechas de la próxima
 * mantención de una máquina. Apuntadas a producción ensuciarían registros que
 * bajo FSSC 22000 son evidencia, y «mover la fecha» es justamente el cambio que
 * se nota recién cuando un equipo falla antes de lo previsto.
 *
 * Las credenciales las da `supabase status`, que sólo sabe del stack que corre
 * en esta máquina. No hay forma de que esto apunte a produccón por un typo en
 * un `.env`: si el stack local no está levantado, el script no corre nada.
 *
 * La prueba además verifica por su cuenta que el host sea local y aborta si no
 * lo es. Dos candados, porque uno solo invita a saltearlo.
 *
 * ── Uso ───────────────────────────────────────────────────────────────────
 *
 *   npx supabase start
 *   npm run test:integracion
 *
 * Se le pueden pasar argumentos a vitest:
 *
 *   npm run test:integracion -- --reporter=verbose
 */
import { execFileSync, spawnSync } from 'node:child_process';

const esWindows = process.platform === 'win32';
const npx = esWindows ? 'npx.cmd' : 'npx';

// Node 24 en Windows no lanza un `.cmd` sin shell: devuelve EINVAL.
const conShell = { shell: esWindows };

function estadoDelStack() {
	try {
		return execFileSync(npx, ['supabase', 'status', '-o', 'env'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			...conShell,
		});
	} catch (err) {
		const detalle = (err.stderr || err.stdout || err.message || '').toString().trim();
		console.error('\nNo se pudo leer el estado del stack local de Supabase.');
		console.error(detalle.split('\n').slice(0, 4).join('\n'));
		console.error('\nLevantalo primero:\n\n  npx supabase start\n');
		process.exit(1);
	}
}

const env = {};
for (const linea of estadoDelStack().split('\n')) {
	const m = linea.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
	if (m) env[m[1]] = m[2];
}

const url = env.API_URL ?? '';
const key = env.SERVICE_ROLE_KEY ?? '';

if (!url || !key) {
	console.error('\nEl stack local no reportó API_URL y SERVICE_ROLE_KEY. ¿Está levantado?\n');
	process.exit(1);
}

// Cinturón además del tirante: lo que devuelve `supabase status` ya es local,
// pero esto deja el criterio escrito acá también.
const host = new URL(url).hostname;
if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') {
	console.error(`\nAPI_URL del stack local apunta a ${host}, que no es local. Se aborta.\n`);
	process.exit(1);
}

console.log(`Stack local: ${url}`);

const extra = process.argv.slice(2);
const r = spawnSync(
	npx,
	['vitest', 'run', 'src/__tests__/cierre-desde-la-etiqueta.test.ts', ...extra],
	{
		stdio: 'inherit',
		...conShell,
		env: {
			...process.env,
			TEST_SUPABASE_URL: url,
			TEST_SUPABASE_SERVICE_ROLE_KEY: key,
		},
	},
);

process.exit(r.status ?? 1);
