#!/usr/bin/env node
/**
 * ¿Alguna función nombra una columna que ya no existe?
 *
 * Cuatro veces pasó lo mismo en este repositorio: se borró una columna, alguna
 * función PL/pgSQL siguió nombrándola, y nadie se enteró hasta que una persona
 * intentó usarla. `DROP COLUMN` no valida los cuerpos de las funciones —Postgres
 * resuelve las referencias de una función cuando la EJECUTA, no cuando la crea—
 * así que el despliegue pasa, el `tsc` pasa, las pruebas pasan, y la función
 * queda rota y muda.
 *
 * NOTES §7 ya había dejado escrita la consulta que encuentra esto. Falló igual,
 * porque una consulta que hay que acordarse de correr no es un control.
 *
 * ── Por qué no denuncia «identificadores desconocidos» ──────────────────────
 *
 * La versión fácil de este script buscaría cualquier palabra que no sea una
 * columna conocida. Encontraría los cuatro casos y también doscientos falsos
 * positivos —variables, alias, palabras reservadas, claves de JSON— y un control
 * con doscientos falsos positivos no se lee: se apaga.
 *
 * Así que sólo denuncia referencias que se pueden RESOLVER contra una tabla
 * concreta. Cinco formas, todas exactas:
 *
 *   1. `v  public.ots%ROWTYPE`  →  `v.columna` tiene que ser columna de `ots`
 *   2. `NEW.x` / `OLD.x`        →  contra la tabla del disparador
 *   3. `INSERT INTO t (a, b)`   →  contra las columnas de `t`
 *   4. `UPDATE t SET a = ...`   →  ídem
 *   5. `FROM t alias` → `alias.x`  →  ídem
 *
 * Si una referencia no se puede atar a una tabla, se calla. Prefiere perderse
 * un caso antes que gritar por uno que está bien: el control que sobrevive es
 * el que nunca miente.
 */

const fs = require('node:fs');
const path = require('node:path');

/* ─── Credenciales, del mismo .env.local que usa la app ─────────────── */

function loadEnv() {
	const file = path.join(__dirname, '..', '.env.local');
	if (!fs.existsSync(file)) return;
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
	}
}

/* ─── Limpieza del cuerpo ───────────────────────────────────────────── */

/**
 * Fuera comentarios y literales.
 *
 * Un literal de texto puede contener cualquier cosa —`'no existe la columna x'`,
 * las claves de un `jsonb_build_object`— y todas se leerían como
 * identificadores. Se reemplazan por espacios en vez de borrarse para no pegar
 * dos palabras que estaban separadas.
 */
function strip(sql) {
	let out = '';
	let i = 0;
	while (i < sql.length) {
		const two = sql.slice(i, i + 2);
		if (two === '--') {
			const end = sql.indexOf('\n', i);
			const stop = end === -1 ? sql.length : end;
			out += ' '.repeat(stop - i);
			i = stop;
		} else if (two === '/*') {
			const end = sql.indexOf('*/', i + 2);
			const stop = end === -1 ? sql.length : end + 2;
			out += ' '.repeat(stop - i);
			i = stop;
		} else if (sql[i] === "'") {
			let j = i + 1;
			while (j < sql.length) {
				if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
				else if (sql[j] === "'") { j += 1; break; }
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

/** El cuerpo entre `AS $tag$ … $tag$`, sin la firma. */
function bodyOf(def) {
	const m = def.match(/AS\s+(\$[a-zA-Z_]*\$)/);
	if (!m) return def;
	const tag = m[1];
	const start = def.indexOf(tag) + tag.length;
	const end = def.lastIndexOf(tag);
	return end > start ? def.slice(start, end) : def.slice(start);
}

/* ─── Nombres que NO son columnas ───────────────────────────────────── */

// Alias que no son tablas: CTE y subconsultas. Sus `alias.x` no se juzgan.
function nonTableAliases(body) {
	const out = new Set();
	for (const m of body.matchAll(/\bWITH\s+([a-z_][a-z0-9_]*)\s+AS\s*\(/gi)) out.add(m[1].toLowerCase());
	for (const m of body.matchAll(/,\s*([a-z_][a-z0-9_]*)\s+AS\s*\(\s*SELECT/gi)) out.add(m[1].toLowerCase());
	for (const m of body.matchAll(/\)\s+(?:AS\s+)?([a-z_][a-z0-9_]*)/gi)) out.add(m[1].toLowerCase());
	return out;
}

/* ─── Las cinco reglas ──────────────────────────────────────────────── */

function findingsFor(fn, catalog) {
	const columns = catalog.columns;
	const has = (table, col) => (columns[table] ?? []).includes(col);
	const known = (table) => Object.prototype.hasOwnProperty.call(columns, table);

	const body = strip(bodyOf(fn.def));
	const found = [];
	const skipAlias = nonTableAliases(body);
	const report = (table, col, rule) => {
		if (known(table) && !has(table, col)) {
			found.push({ func: fn.name, table, column: col, rule });
		}
	};

	// 1 · variables %ROWTYPE
	const rowtypes = new Map();
	for (const m of body.matchAll(/\b([a-z_][a-z0-9_]*)\s+(?:public\.)?([a-z_][a-z0-9_]*)%ROWTYPE/gi)) {
		rowtypes.set(m[1].toLowerCase(), m[2].toLowerCase());
	}
	for (const [variable, table] of rowtypes) {
		const re = new RegExp(`\\b${variable}\\.([a-z_][a-z0-9_]*)`, 'gi');
		for (const m of body.matchAll(re)) report(table, m[1].toLowerCase(), `${variable}%ROWTYPE de ${table}`);
	}

	// 2 · NEW / OLD dentro de una función de disparador
	//
	// Una función puede colgar de VARIAS tablas y ramificarse por
	// `TG_TABLE_NAME`: `mirror_legacy_capture` atiende los dos `whatsapp_*_logs`
	// y toca campos que existen sólo en uno. PL/pgSQL resuelve el campo de `NEW`
	// al ejecutar la rama, así que eso es correcto. Un campo se acepta si existe
	// en CUALQUIERA de las tablas del disparador; sólo se denuncia el que no
	// existe en ninguna, que es el único caso que se puede afirmar roto.
	const declaradas = catalog.triggers[fn.name] ?? [];
	const tablasDisparador = (Array.isArray(declaradas) ? declaradas : [declaradas]).filter(known);
	if (tablasDisparador.length > 0) {
		for (const m of body.matchAll(/\b(?:NEW|OLD)\.([a-z_][a-z0-9_]*)/gi)) {
			const col = m[1].toLowerCase();
			if (!tablasDisparador.some((t) => has(t, col))) {
				found.push({
					func: fn.name,
					table: tablasDisparador.join(' / '),
					column: col,
					rule: `NEW/OLD del disparador sobre ${tablasDisparador.join(' y ')}`,
				});
			}
		}
	}

	// 3 · listas de columnas de un INSERT
	for (const m of body.matchAll(/\bINSERT\s+INTO\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([^;]*?)\)\s*(?:VALUES|SELECT|OVERRIDING|DEFAULT)/gi)) {
		const table = m[1].toLowerCase();
		for (const raw of m[2].split(',')) {
			const col = raw.trim().toLowerCase();
			if (/^[a-z_][a-z0-9_]*$/.test(col)) report(table, col, `INSERT INTO ${table}`);
		}
	}

	// 4 · UPDATE … SET
	for (const m of body.matchAll(/\bUPDATE\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+SET\b([\s\S]*?)(?:\bWHERE\b|\bRETURNING\b|;)/gi)) {
		const table = m[1].toLowerCase();
		for (const a of m[2].matchAll(/(?:^|,)\s*([a-z_][a-z0-9_]*)\s*=/gi)) {
			report(table, a[1].toLowerCase(), `UPDATE ${table} SET`);
		}
	}

	// 5 · alias de tabla en FROM / JOIN
	const aliases = new Map();
	const aliasRe = /\b(?:FROM|JOIN)\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+(?:AS\s+)?([a-z_][a-z0-9_]*)/gi;
	const RESERVED = new Set([
		'on', 'using', 'where', 'set', 'group', 'order', 'limit', 'having', 'left',
		'right', 'inner', 'outer', 'full', 'cross', 'join', 'loop', 'for', 'values',
		'select', 'union', 'and', 'or', 'as', 'into', 'return', 'returning', 'when',
	]);
	for (const m of body.matchAll(aliasRe)) {
		const table = m[1].toLowerCase();
		const alias = m[2].toLowerCase();
		if (RESERVED.has(alias) || skipAlias.has(alias) || !known(table)) continue;
		// Un alias repetido con dos tablas distintas se descarta: no se puede
		// afirmar cuál manda dentro del cuerpo sin analizar el alcance.
		if (aliases.has(alias) && aliases.get(alias) !== table) aliases.set(alias, null);
		else if (!aliases.has(alias)) aliases.set(alias, table);
	}
	for (const [alias, table] of aliases) {
		if (!table || rowtypes.has(alias)) continue;
		const re = new RegExp(`\\b${alias}\\.([a-z_][a-z0-9_]*)`, 'gi');
		for (const m of body.matchAll(re)) report(table, m[1].toLowerCase(), `alias ${alias} → ${table}`);
	}

	return found;
}

const byFuncCount = (findings) => new Set(findings.map((f) => f.func)).size;

/* ─── Ejecución ─────────────────────────────────────────────────────── */

async function main() {
	loadEnv();
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.');
		process.exitCode = 2;
		return;
	}

	const res = await fetch(`${url}/rest/v1/rpc/catalogo_para_auditoria`, {
		method: 'POST',
		headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: '{}',
	});
	if (!res.ok) {
		console.error(`No se pudo leer el catálogo (${res.status}). ¿Corriste las migraciones?`);
		process.exitCode = 2;
		return;
	}
	const catalog = await res.json();

	// Once líneas idénticas por la misma columna no informan once veces: informan
	// una vez y entierran al resto del listado.
	const raw = catalog.functions.flatMap((fn) => findingsFor(fn, catalog));
	const byKey = new Map();
	for (const f of raw) {
		const key = `${f.func}|${f.table}|${f.column}`;
		if (byKey.has(key)) byKey.get(key).veces += 1;
		else byKey.set(key, { ...f, veces: 1 });
	}
	const findings = [...byKey.values()];

	// ── Lo ya sabido no bloquea, pero se sigue viendo ────────────────────
	//
	// `get_order_labor_margin` está rota de verdad (`42703` al invocarla) y no
	// se puede arreglar renombrando: `employee_incentives.payment_date` no tiene
	// sucesor obvio y la función calcula un margen de mano de obra cuya
	// definición hay que confirmar con el taller antes de adivinar columnas.
	//
	// Dejarla en rojo para siempre haría exactamente lo que este control existe
	// para evitar: que alguien lo apague. Es el mismo criterio con el que la
	// regla de ESLint de NOTES §12 quedó en `warn` con cincuenta hallazgos
	// preexistentes — contados y visibles, no bloqueando.
	//
	// La lista es nominal a propósito: sólo silencia lo que nombra. Una deriva
	// NUEVA —o una columna nueva rota en la misma función— vuelve a poner el
	// control en rojo.
	const CONOCIDAS = new Set([
		'get_order_labor_margin|worker_assignments|assignment_date',
		'get_order_labor_margin|employment_contracts|regular_hours_limit',
		'get_order_labor_margin|employment_contracts|ot50_hours_limit',
		'get_order_labor_margin|employment_contracts|contract_start_date',
		'get_order_labor_margin|employment_contracts|contract_end_date',
		'get_order_labor_margin|compensation_rates|effective_date',
		'get_order_labor_margin|compensation_rates|end_date',
		'get_order_labor_margin|employee_incentives|payment_date',
		'get_order_labor_margin|ots|order_date',
		'get_order_labor_margin|ots|completion_date',
		'get_order_labor_margin|ots|revenue',
	]);
	const claveDe = (f) => `${f.func}|${f.table}|${f.column}`;
	const conocidas = findings.filter((f) => CONOCIDAS.has(claveDe(f)));
	const nuevas = findings.filter((f) => !CONOCIDAS.has(claveDe(f)));

	if (conocidas.length > 0) {
		const funcs = [...new Set(conocidas.map((f) => f.func))].join(', ');
		console.log(
			`· ${conocidas.length} referencia(s) muerta(s) ya conocida(s) en ${funcs} ` +
			'— ver NOTES «What is still wrong».',
		);
	}

	if (nuevas.length === 0) {
		console.log(
			`✓ ${catalog.functions.length} funciones revisadas contra ` +
			`${Object.keys(catalog.columns).length} tablas: ninguna deriva nueva.`,
		);
		return;
	}

	const veces = nuevas.reduce((n, f) => n + f.veces, 0);
	const funciones = new Set(nuevas.map((f) => f.func)).size;
	console.error(
		`✗ ${nuevas.length} columna(s) inexistente(s) NUEVA(s) en ${funciones} función(es), ` +
		`${veces} referencia(s) en total:\n`,
	);
	const byFunc = new Map();
	for (const f of nuevas) {
		if (!byFunc.has(f.func)) byFunc.set(f.func, []);
		byFunc.get(f.func).push(f);
	}
	for (const [func, list] of byFunc) {
		console.error(`  ${func}`);
		for (const f of list) {
			const veces = f.veces > 1 ? ` ×${f.veces}` : '';
			console.error(`    · ${f.table}.${f.column} — no existe${veces}  (${f.rule})`);
		}
		console.error('');
	}
	console.error(
		'Estas funciones no fallan al desplegarse: fallan cuando alguien las usa.\n' +
		'Ver NOTES §7 y la migración 20260827140000.',
	);
	// `exitCode` y no `process.exit()`: cortar de golpe con los sockets de
	// `fetch` todavía abiertos hace abortar a libuv en Windows, y el script
	// terminaba con un volcado de assert pegado debajo de su propio informe.
	process.exitCode = 1;
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 2;
});
