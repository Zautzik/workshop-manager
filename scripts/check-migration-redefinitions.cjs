#!/usr/bin/env node
/**
 * Lista toda función/trigger que más de una migración define.
 *
 * NOTES.md §7 documenta el incidente que este script existe para prevenir:
 * una migración reemplazó `receive_oc_into_lot` mirando la primera
 * definición que encontró por grep, sin saber que había una más nueva —
 * y esa más nueva perdió tres cosas, entre ellas el asiento en
 * `ot_real_costs` que hace que recibir papel cuente como costo real. La
 * lección que quedó escrita: "antes de reemplazar una función hay que
 * buscar TODAS las migraciones que la definen ... `grep -l` sobre el
 * directorio, no memoria."
 *
 * Este script es esa búsqueda, hecha una vez y no de memoria. No falla el
 * build — no puede saber si una redefinición es la mejora que se quería o
 * el olvido que borra algo. Es la lista que hay que mirar antes de tocar
 * cualquiera de estos nombres, la misma consulta que antes vivía sólo en
 * la cabeza de quien la escribió.
 *
 * Uso: node scripts/check-migration-redefinitions.cjs
 */
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

// `CREATE [OR REPLACE] FUNCTION public.nombre(` o `CREATE [OR REPLACE] FUNCTION nombre(`
const DEFINITION_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?("?[\w]+"?)\s*\(/gi;

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // el nombre empieza con timestamp — el orden alfabético es el orden cronológico
}

function findDefinitions(file) {
  const text = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const names = new Set();
  let m;
  DEFINITION_RE.lastIndex = 0;
  while ((m = DEFINITION_RE.exec(text)) !== null) {
    names.add(m[1].replace(/"/g, '').toLowerCase());
  }
  return [...names];
}

function main() {
  const files = listMigrationFiles();
  /** @type {Map<string, string[]>} */
  const byFunction = new Map();

  for (const file of files) {
    for (const name of findDefinitions(file)) {
      const list = byFunction.get(name) ?? [];
      list.push(file);
      byFunction.set(name, list);
    }
  }

  const redefined = [...byFunction.entries()]
    .filter(([, files]) => files.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  if (redefined.length === 0) {
    console.log('Ninguna función se define en más de una migración.');
    return;
  }

  console.log(
    `${redefined.length} función(es) definidas en más de una migración — revisa la ÚLTIMA columna antes de tocarlas, no la primera que aparezca en un grep:\n`
  );
  for (const [name, defs] of redefined) {
    console.log(`  ${name}  (${defs.length}×)`);
    for (const f of defs) console.log(`    - ${f}`);
    console.log(`    → última: ${defs[defs.length - 1]}`);
    console.log('');
  }
}

main();
