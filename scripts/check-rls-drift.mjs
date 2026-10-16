#!/usr/bin/env node
/**
 * ¿Lo que dicen las migraciones es lo que tiene la base?
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Porque «todas aplicadas» en el historial significa REGISTRADAS, no
 * ejecutadas, y este proyecto trae `scripts/repair-migration-history.sh`, que
 * marca una migración como aplicada sin correrla. El dueño confirmó el
 * 2026-10-15 que más de una es ficción.
 *
 * La sesión del 2026-10 desmintió cinco supuestos sacados de parsear .sql, uno
 * por uno y por accidente:
 *
 *   · `deprecated_worker_fields` — en las migraciones, no en la base. Hizo
 *     abortar la migración de RLS en su primera corrida.
 *   · `workstations` — fusionada en `machines`; su DROP POLICY tiró 42P01 y se
 *     llevó la migración de vistas.
 *   · `workers_with_compensation` y `workers_full_profile` — vistas que no
 *     existen.
 *   · `user_roles` — la migración dice `ENABLE ROW LEVEL SECURITY` y la base
 *     tenía RLS APAGADO. Resultado: 4 filas del mapa de roles legibles con la
 *     publishable key.
 *
 * Los cuatro primeros costaron tiempo. El quinto era un agujero de seguridad, y
 * se encontró de casualidad. Este script es la forma de no depender de la
 * casualidad: compara lo que las migraciones AFIRMAN contra lo que el servidor
 * TIENE, y falla cuando no coinciden.
 *
 * ── Qué compara ───────────────────────────────────────────────────────────
 *
 *   1. Tablas: toda tabla con `ENABLE ROW LEVEL SECURITY` en alguna migración
 *      tiene que tener `relrowsecurity` en la base.
 *   2. Vistas: toda vista de `public` tiene que tener `security_invoker`, porque
 *      20261014121000 se las puso a todas sin excepción.
 *   3. Fantasmas: objetos que las migraciones crean y la base no tiene. No es
 *      un error —la consolidación borró tablas a mano— pero conviene saber
 *      cuáles son, porque cada conteo del plan de remediación los incluye.
 *
 * Lo que NO hace: adivinar por qué. Dice qué difiere; decidir si falta aplicar
 * una migración o si el objeto se retiró a propósito es de quien lee.
 *
 * Uso:   node scripts/check-rls-drift.mjs
 * Env:   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (de .env.local o .env)
 * Exit:  0 sin deriva · 1 deriva de RLS o de security_invoker
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/* ── env ─────────────────────────────────────────────────────────── */

function loadEnv() {
	const file = existsSync('.env.local') ? '.env.local' : '.env';
	if (!existsSync(file)) {
		console.error(`No se encontró ${file}.`);
		process.exit(1);
	}
	const env = {};
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/);
		if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
	}
	return env;
}

const env = loadEnv();
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SVC_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !SVC_KEY) {
	console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
	process.exit(1);
}

/* ── lo que afirman las migraciones ──────────────────────────────── */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Deja el SQL sin comentarios ni literales de texto.
 *
 * Sin esto el barrido lee prosa. La primera corrida reportó como tablas
 * fantasma a IF, above, for, had, which y without, todas sacadas de
 * comentarios como "-- Create table for OT financials" y "-- la CREATE TABLE
 * IF NOT EXISTS above es...". Seis falsos positivos en una lista de doce:
 * suficiente para que nadie vuelva a leerla.
 *
 * Mismo criterio y misma razón que `strip()` en check-dead-function-refs.cjs,
 * que ya existía para esto. Se reemplaza por espacios y no se borra, para no
 * pegar dos palabras que estaban separadas.
 */
function strip(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const dos = sql.slice(i, i + 2);
    if (dos === '--') {
      const fin = sql.indexOf(String.fromCharCode(10), i);
      const hasta = fin === -1 ? sql.length : fin;
      out += ' '.repeat(hasta - i);
      i = hasta;
    } else if (dos === '/*') {
      const fin = sql.indexOf('*/', i + 2);
      const hasta = fin === -1 ? sql.length : fin + 2;
      out += ' '.repeat(hasta - i);
      i = hasta;
    } else if (sql[i] === String.fromCharCode(39)) {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === String.fromCharCode(39) && sql[j + 1] === String.fromCharCode(39)) j += 2;
        else if (sql[j] === String.fromCharCode(39)) { j += 1; break; }
        else j += 1;
      }
      out += ' '.repeat(j - i);
      i = j;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

function loQueAfirmanLasMigraciones() {
	const archivos = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
	const rlsEsperado = new Set();
	const tablasCreadas = new Set();
	const vistasVivas = new Set();

	for (const f of archivos) {
		const sql = strip(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));

		for (const m of sql.matchAll(
			/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?["]?([a-z0-9_]+)["]?\s+enable\s+row\s+level\s+security/gi,
		)) {
			rlsEsperado.add(m[1]);
		}

		// Las tablas se acumulan; los DROP las quitan. Importa el orden, y los
		// archivos están ordenados por timestamp.
		for (const m of sql.matchAll(
			/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["]?([a-z0-9_]+)/gi,
		)) {
			tablasCreadas.add(m[1]);
		}
		for (const m of sql.matchAll(
			/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?["]?([a-z0-9_]+)/gi,
		)) {
			tablasCreadas.delete(m[1]);
			rlsEsperado.delete(m[1]);
		}

		for (const m of sql.matchAll(
			/create\s+(?:or\s+replace\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["]?([a-z0-9_]+)/gi,
		)) {
			vistasVivas.add(m[1]);
		}
		for (const m of sql.matchAll(
			/drop\s+view\s+(?:if\s+exists\s+)?(?:public\.)?["]?([a-z0-9_]+)/gi,
		)) {
			vistasVivas.delete(m[1]);
		}
	}

	return { rlsEsperado, tablasCreadas, vistasVivas };
}

/* ── lo que tiene la base ────────────────────────────────────────── */

async function loQueTieneLaBase() {
	const res = await fetch(`${URL_BASE}/rest/v1/rpc/catalogo_para_auditoria`, {
		method: 'POST',
		headers: {
			apikey: SVC_KEY,
			Authorization: `Bearer ${SVC_KEY}`,
			'Content-Type': 'application/json',
		},
		body: '{}',
	});

	const texto = await res.text();
	if (!res.ok) {
		let msg = texto.slice(0, 200);
		try { msg = JSON.parse(texto).message ?? msg; } catch { /* texto plano */ }
		console.error(`\nNo se pudo leer el catálogo: HTTP ${res.status} ${msg}`);
		console.error(
			'\nSi dice que la función no existe o que le faltan claves, falta aplicar\n' +
			'la migración 20261016120000, que es la que le agrega `seguridad` y `vistas`.',
		);
		process.exit(1);
	}

	const cat = JSON.parse(texto);
	if (!cat.seguridad || !cat.vistas) {
		console.error(
			'\nEl catálogo respondió sin las claves `seguridad`/`vistas`: la base tiene\n' +
			'una versión vieja de `catalogo_para_auditoria()`. Falta aplicar la\n' +
			'migración 20261016120000.',
		);
		process.exit(1);
	}
	return cat;
}

/* ── comparación ─────────────────────────────────────────────────── */

const { rlsEsperado, tablasCreadas, vistasVivas } = loQueAfirmanLasMigraciones();
const cat = await loQueTieneLaBase();

const tablasReales = new Set(Object.keys(cat.seguridad));
const vistasReales = new Set(Object.keys(cat.vistas));

console.log(`Proyecto: ${URL_BASE.replace(/https:\/\/([a-z0-9]+)\..*/, '$1')}`);
console.log(
  `Migraciones: ${rlsEsperado.size} tabla(s) con RLS declarado · ` +
  `${tablasCreadas.size} tabla(s) · ${vistasVivas.size} vista(s)`,
);
console.log(
  `Base:        ${tablasReales.size} tabla(s) · ${vistasReales.size} vista(s)`,
);

let deriva = 0;

/* 1 — RLS declarado que no está activo */
console.log('\n■ RLS: declarado en una migración vs activo en la base');
const rlsApagado = [...rlsEsperado]
	.filter((t) => tablasReales.has(t))
	.filter((t) => cat.seguridad[t]?.rls !== true)
	.sort();
if (rlsApagado.length === 0) {
	console.log('  ✓ Todas las tablas con RLS declarado lo tienen activo.');
} else {
	deriva += rlsApagado.length;
	for (const t of rlsApagado) {
		const s = cat.seguridad[t];
		console.log(`  ✗ ${t.padEnd(34)} RLS APAGADO en la base (policies: ${s.policies})`);
	}
	console.log(
		'\n    Una migración dice que lo activó y el servidor dice que no. Si la tabla\n' +
		'    tiene policies, están ahí sin efecto: RLS apagado las ignora por completo.',
	);
}

/* 2 — tablas con policies pero sin RLS: igual de peligroso, y más silencioso */
const policiesSinRls = [...tablasReales]
	.filter((t) => cat.seguridad[t]?.rls !== true && (cat.seguridad[t]?.policies ?? 0) > 0)
	.filter((t) => !rlsApagado.includes(t))
	.sort();
if (policiesSinRls.length > 0) {
	deriva += policiesSinRls.length;
	console.log('\n■ Tablas con policies y sin RLS (las policies no hacen nada)');
	for (const t of policiesSinRls) {
		console.log(`  ✗ ${t.padEnd(34)} ${cat.seguridad[t].policies} policy(s) inertes`);
	}
}

/* 3 — vistas sin security_invoker */
console.log('\n■ Vistas: security_invoker');
const vistasDefiner = [...vistasReales].filter((v) => cat.vistas[v]?.security_invoker !== true).sort();
if (vistasDefiner.length === 0) {
	console.log(`  ✓ Las ${vistasReales.size} vistas corren como quien las invoca.`);
} else {
	deriva += vistasDefiner.length;
	for (const v of vistasDefiner) {
		console.log(`  ✗ ${v.padEnd(34)} sin security_invoker — pasa por encima de RLS`);
	}
	console.log(
		'\n    20261014121000 se las puso a TODAS. Una vista nueva nace sin la opción,\n' +
		'    así que esto además avisa cuando alguien agrega una y se olvida.',
	);
}

/* 4 — fantasmas: en las migraciones, no en la base. Informativo. */
const fantasmasTablas = [...tablasCreadas].filter((t) => !tablasReales.has(t)).sort();
const fantasmasVistas = [...vistasVivas].filter((v) => !vistasReales.has(v)).sort();
if (fantasmasTablas.length > 0 || fantasmasVistas.length > 0) {
	console.log('\n■ Fantasmas: las migraciones los crean, la base no los tiene');
	for (const t of fantasmasTablas) console.log(`  · tabla  ${t}`);
	for (const v of fantasmasVistas) console.log(`  · vista  ${v}`);
	console.log(
		'\n    No falla el chequeo: la consolidación borró objetos a mano y eso es\n' +
		'    legítimo. Importa porque TODO conteo sacado de parsear las migraciones\n' +
		'    los incluye, así que son hipótesis, no hechos.',
	);
}

/* 5 — la deriva inversa: está en la base y no lo crea ninguna migración */
const huerfanasTablas = [...tablasReales].filter((t) => !tablasCreadas.has(t)).sort();
const huerfanasVistas = [...vistasReales].filter((v) => !vistasVivas.has(v)).sort();
if (huerfanasTablas.length > 0 || huerfanasVistas.length > 0) {
  console.log('■ Huérfanos: están en la base y ninguna migración los crea');
  for (const t of huerfanasTablas) {
    const seg = cat.seguridad[t];
    const rls = seg?.rls ? 'RLS on' : 'RLS OFF';
    console.log('  · tabla  ' + t.padEnd(34) + rls + ', ' + (seg?.policies ?? 0) + ' policy(s)');
  }
  for (const v of huerfanasVistas) console.log('  · vista  ' + v);

  // Una huérfana SIN RLS es las dos cosas a la vez: indocumentada y abierta.
  // Así se encontró `public.users`, que exponía dos correos a la publishable
  // key. Esa combinación sí hace fallar el chequeo — el resto de las huérfanas
  // es deuda de documentación, esto es un agujero.
  const huerfanasSinRls = huerfanasTablas.filter((t) => cat.seguridad[t]?.rls !== true);
  if (huerfanasSinRls.length > 0) {
    deriva += huerfanasSinRls.length;
    console.log(
      [
        '',
        '    ✗ ' + huerfanasSinRls.join(', ') + ': huérfana Y sin RLS.',
        '      Legible y ESCRIBIBLE con la publishable key, segun la propia',
        '      documentacion de Supabase. Esto hace fallar el chequeo.',
      ].join(String.fromCharCode(10)),
    );
  }
  console.log(
    [
      '',
      '    Esto es la deriva al revés, y pesa más que los fantasmas: un objeto que',
      '    ninguna migración describe NO se recrea al reconstruir la base desde las',
      '    migraciones. El dump de esquema sí lo tiene, así que el respaldo lo cubre;',
      '    un `supabase db reset` no.',
      '',
      '    Si alguno tiene RLS OFF, además es legible con la publishable key: no pasó',
      '    por 20261014120000 porque esa migración sólo conocía las que estaban en los',
      '    archivos. Correr `npm run check:anon` para ver qué devuelve.',
    ].join(String.fromCharCode(10)),
  );
}

/* ── veredicto ───────────────────────────────────────────────────── */

console.log('\n' + '─'.repeat(72));
if (deriva > 0) {
	console.error(
		`\n✗ ${deriva} caso(s) de deriva entre las migraciones y la base.\n` +
		'  Leer las migraciones no es leer la base.',
	);
	process.exit(1);
}
console.log('\n✓ Sin deriva: lo que afirman las migraciones es lo que tiene la base.');
