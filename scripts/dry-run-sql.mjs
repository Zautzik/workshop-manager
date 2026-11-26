#!/usr/bin/env node
/**
 * Dry-run a data change before anyone is asked to approve it.
 *
 *   npm run db:dry-run -- path/to/change.sql
 *
 * Runs the SQL on the LOCAL database (a restore of the cloud, same tables,
 * constraints and triggers) inside a transaction that is always rolled back,
 * and prints what each statement did — or the exact rule that rejected it.
 *
 * Why: twice on 2026-11-26 a data change was proposed and approved after a
 * preview that checked the business rule but not the database's own:
 *  - the Roland counter could not be NULL (usage_counter is NOT NULL);
 *  - the 218 settled OCs could not change status (check
 *    purchases_emitida_esta_completa wants number, issuer and date).
 * Both were rolled back by Postgres, but the approval was asked for something
 * that could not be done. A dry run surfaces NOT NULL, CHECK, FK, unique and
 * trigger errors before the question is asked.
 *
 * Nothing is written: the script wraps the file in BEGIN … ROLLBACK and runs
 * psql with ON_ERROR_STOP. It only talks to the local Docker container.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const CONTAINER = 'supabase_db_sgnbbatucphbqhahgczq';
const file = process.argv[2];
if (!file) {
  console.error('Uso: npm run db:dry-run -- ruta/al/cambio.sql');
  process.exit(2);
}

const sql = readFileSync(file, 'utf8');
if (/\b(commit|rollback|begin)\b\s*;/i.test(sql)) {
  console.error('El archivo no debe manejar su propia transacción: el dry-run la abre y la deshace.');
  process.exit(2);
}

const wrapped = `\\set ON_ERROR_STOP on\nBEGIN;\n${sql}\n;\nROLLBACK;\n`;
const r = spawnSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
  input: wrapped,
  encoding: 'utf8',
  env: { ...process.env, MSYS_NO_PATHCONV: '1' },
});

if (r.error) {
  console.error(`No se pudo ejecutar docker (${r.error.message}). ¿Docker Desktop y el stack local están arriba?`);
  process.exit(1);
}
process.stdout.write(r.stdout ?? '');
if (r.status !== 0) {
  console.error('\n✗ El cambio NO se puede aplicar tal como está — la base lo rechaza:\n');
  console.error(r.stderr);
  process.exit(1);
}
console.log('\n✓ El cambio se aplica sin errores en la copia local (y se deshizo). Recién ahora se pide la aprobación.');
