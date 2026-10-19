// Generates src/integrations/supabase/types.ts by introspecting the live
// PostgREST schema via the OpenAPI endpoint.
// Usage: node scripts/gen-types.mjs
//
// CUIDADO: desde 2026-10-16 este script produce tipos INCOMPLETOS.
//
// Introspecta el spec OpenAPI de PostgREST, y ese spec refleja lo que el rol
// que pregunta puede ver. La migracion 20261014122000 revoco el EXECUTE de
// PUBLIC/anon/authenticated sobre ~73 funciones, asi que el spec ya no las
// lista: al correrlo el 2026-10-19 el archivo paso de 9.643 a 6.149 lineas y el
// typecheck salto de 0 a 51 errores — se perdieron las relaciones entre tablas
// ("could not find the relation between X and Y") y los nombres de los RPC.
// O sea que el endurecimiento de permisos rompio al generador.
//
// Alternativa que si funciona, porque lee la base y no PostgREST:
//
//   npx supabase gen types typescript --linked --schema public > src/integrations/supabase/types.ts
//
// Da 9.777 lineas con las 121 relaciones intactas y las columnas nuevas. Su
// unico costo: tipa los ARGUMENTOS de los RPC como no nulos (Postgres no tiene
// NOT NULL en parametros), y deja ~10 errores en whatsapp-ingest.ts donde el
// codigo pasa null a proposito y es correcto. Migrar a ese comando es deseable
// y pide castear esas llamadas; no se hizo todavia.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Parse .env.local, o .env si no existe.
//
// Estaba fijo en .env.local, y este repositorio usa .env: el script no se podia
// correr tal cual, fallaba con ENOENT antes de hacer nada. Mismo orden de
// preferencia que check-anon-visibility.mjs y check-rls-drift.mjs.
const envFile = existsSync(resolve(root, '.env.local')) ? '.env.local' : '.env';
const env = {};
for (const line of readFileSync(resolve(root, envFile), 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
}

const url = env['NEXT_PUBLIC_SUPABASE_URL'];
const key = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

console.log('Fetching OpenAPI spec from', url + '/rest/v1/');

const res = await fetch(url + '/rest/v1/', {
  headers: { apikey: key, Authorization: 'Bearer ' + key }
});

if (!res.ok) {
  console.error('HTTP', res.status, await res.text());
  process.exit(1);
}

const spec = await res.json();
const defs = spec.definitions || {};

console.log('Found', Object.keys(defs).length, 'definitions');
Object.keys(defs).forEach(k => console.log(' -', k));

// Map PostgreSQL/OpenAPI types to TypeScript
function toTsType(prop, required) {
  const nullable = !required;
  let base;

  if (prop['$ref']) {
    const ref = prop['$ref'].split('/').pop();
    base = ref; // will be the table Row type
  } else if (prop.format === 'uuid') {
    base = 'string';
  } else if (prop.type === 'string') {
    if (prop.format === 'timestamp with time zone' || prop.format === 'date' || prop.format?.startsWith('time')) {
      base = 'string';
    } else {
      base = 'string';
    }
  } else if (prop.type === 'integer' || prop.type === 'number') {
    base = 'number';
  } else if (prop.type === 'boolean') {
    base = 'boolean';
  } else if (prop.type === 'array') {
    base = 'unknown[]';
  } else if (prop.type === 'object') {
    base = 'Json';
  } else {
    base = 'unknown';
  }

  return nullable ? `${base} | null` : base;
}

function buildRowType(defName, def) {
  const props = def.properties || {};
  const required = new Set(def.required || []);
  const lines = [];
  for (const [col, prop] of Object.entries(props)) {
    const tsType = toTsType(prop, required.has(col));
    const opt = required.has(col) ? '' : '?';
    lines.push(`      ${col}${opt}: ${tsType}`);
  }
  return lines.join('\n');
}

// Build the Database type
const tableEntries = [];
for (const [name, def] of Object.entries(defs)) {
  const props = def.properties || {};
  const required = new Set(def.required || []);

  const rowLines = [];
  const insertLines = [];
  const updateLines = [];

  for (const [col, prop] of Object.entries(props)) {
    const tsType = toTsType(prop, required.has(col));
    const opt = required.has(col) ? '' : '?';
    rowLines.push(`        ${col}: ${tsType}`);
    insertLines.push(`        ${col}?: ${tsType}`);
    updateLines.push(`        ${col}?: ${tsType}`);
  }

  tableEntries.push(`    ${name}: {
      Row: {
${rowLines.join('\n')}
      }
      Insert: {
${insertLines.join('\n')}
      }
      Update: {
${updateLines.join('\n')}
      }
      Relationships: []
    }`);
}

const output = `// Auto-generated by scripts/gen-types.mjs
// Source: PostgREST OpenAPI introspection — ${new Date().toISOString()}
// Regenerate: node scripts/gen-types.mjs

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
${tableEntries.join('\n')}
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] &
        Database["public"]["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][PublicEnumNameOrOptions]
    : never
`;

const outPath = resolve(root, 'src/integrations/supabase/types.ts');
writeFileSync(outPath, output, 'utf8');
console.log('Written to', outPath);
