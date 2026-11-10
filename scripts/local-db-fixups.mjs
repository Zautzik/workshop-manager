// Builds the SQL that bridges a cloud dump and the local Supabase stack.
// scripts/local-db-restore.ps1 runs: roles → schema → pre → data → post.
//
//   node scripts/local-db-fixups.mjs <dump-dir>   → <dump-dir>/pre.sql, post.sql
//
// Why each piece exists:
//   - NOT VALID check constraints. The cloud holds old rows that break them
//     (they were added NOT VALID on purpose). A schema-then-data restore
//     creates them first, so COPY rejects the WHOLE table (purchases did).
//     pre drops them, post re-adds them NOT VALID: the cloud's exact state.
//   - storage.buckets. The local storage image can lag the cloud's columns,
//     so its COPY fails. post inserts the buckets with the columns both share.
//     File blobs are not in a dump: object rows load, the files don't.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/local-db-fixups.mjs <dump-dir>');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
const schema = read('schema.sql');
const data = read('data.sql');

const pre = [];
const post = [];

// ── NOT VALID check constraints ───────────────────────────────────────────
const re = /ALTER TABLE (?:ONLY )?"public"\."(\w+)"\n\s+ADD CONSTRAINT "(\w+)" (CHECK \([^;]*\)) NOT VALID;/g;
for (const [, table, name, check] of schema.matchAll(re)) {
	pre.push(`ALTER TABLE public."${table}" DROP CONSTRAINT "${name}";`);
	post.push(`ALTER TABLE public."${table}" ADD CONSTRAINT "${name}" ${check} NOT VALID;`);
}

// ── storage buckets ───────────────────────────────────────────────────────
const head = 'COPY "storage"."buckets" (';
const a = data.indexOf(head);
if (a >= 0) {
	const [header, ...rows] = data.slice(a, data.indexOf('\n\\.\n', a)).split('\n');
	const cols = header.slice(head.length, header.indexOf(')')).split(', ').map((c) => c.replace(/"/g, ''));
	const at = (r, c) => r.split('\t')[cols.indexOf(c)];
	const lit = (v) => (v === '\\N' || v === undefined ? 'NULL' : `'${v.replace(/'/g, "''")}'`);
	for (const r of rows.filter(Boolean)) {
		const size = at(r, 'file_size_limit');
		const mimes = at(r, 'allowed_mime_types');
		post.push(
			`INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES (` +
				`${lit(at(r, 'id'))}, ${lit(at(r, 'name'))}, ${at(r, 'public') === 't'}, ` +
				`${size === '\\N' ? 'NULL' : Number(size)}, ${mimes === '\\N' ? 'NULL' : `${lit(mimes)}::text[]`}) ` +
				`ON CONFLICT (id) DO NOTHING;`,
		);
	}
}

fs.writeFileSync(path.join(dir, 'pre.sql'), pre.join('\n') + '\n');
fs.writeFileSync(path.join(dir, 'post.sql'), post.join('\n') + '\n');
console.log(`pre.sql: ${pre.length} statements, post.sql: ${post.length}`);
