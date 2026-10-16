#!/usr/bin/env node
/**
 * ¿Qué ve alguien que sólo tiene la publishable key?
 *
 * La publishable key viaja en el bundle del navegador y este repositorio es
 * público. Lo único que impide que lea la base entera es RLS. Este script lo
 * pregunta en vez de suponerlo: lee cada objeto DOS veces —una con la service
 * role (la verdad de cuántas filas hay) y otra con la publishable key (lo que
 * ve un desconocido)— y compara.
 *
 * Contesta dos preguntas distintas con la misma pasada:
 *
 *   1. ¿Hay una filtración?  Una fila FILTRA cuando la key pública devuelve
 *      datos. Eso es el hallazgo que importa, y es por lo que el script sale
 *      con código 1.
 *
 *   2. ¿Por qué las pantallas de Personas aparecen vacías?  (Q-1 del plan de
 *      remediación.) Las policies de esas tablas cuelgan de `auth.uid()`, que
 *      en esta aplicación es SIEMPRE NULL: se entra por NextAuth y el cliente
 *      del navegador nunca obtiene un JWT de Supabase. Si la service role
 *      cuenta filas y la pública devuelve cero, la pantalla está vacía por RLS
 *      y no porque falten datos — que son dos problemas con arreglos muy
 *      distintos.
 *
 *      Sin esta comparación una pantalla vacía es ambigua: puede ser RLS o
 *      puede ser que el taller no haya cargado nada todavía. Por eso se leen
 *      las dos y no sólo una.
 *
 * ── Esto LEE LA BASE DE PRODUCCIÓN ────────────────────────────────────────
 *
 * Sólo SELECT, nada se escribe. Pero son datos reales: no imprime ni una fila,
 * sólo cuenta, y los nombres de columna aparecen únicamente cuando algo filtra
 * —que es justo cuando hay que saber qué quedó expuesto.
 *
 * Uso:   node scripts/check-anon-visibility.mjs
 *        node scripts/check-anon-visibility.mjs --verbose
 * Env:   lee .env (o .env.local si existe). Necesita
 *        NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *        y SUPABASE_SERVICE_ROLE_KEY.
 * Salida: 0 = nada filtra · 1 = algo filtra o falta configuración
 */

import { readFileSync, existsSync } from 'node:fs';

const VERBOSE = process.argv.includes('--verbose');

/* ── env ─────────────────────────────────────────────────────────── */

function loadEnv() {
  const file = existsSync('.env.local') ? '.env.local' : '.env';
  if (!existsSync(file)) {
    console.error(`No se encontró ${file}. Copiá .env.example y completalo.`);
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return { env, file };
}

const { env, file } = loadEnv();
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const PUB_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
const SVC_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

for (const [name, value] of [
  ['NEXT_PUBLIC_SUPABASE_URL', URL_BASE],
  ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', PUB_KEY],
  ['SUPABASE_SERVICE_ROLE_KEY', SVC_KEY],
]) {
  if (!value) {
    console.error(`Falta ${name} en ${file}.`);
    process.exit(1);
  }
}

/* ── qué se mira ─────────────────────────────────────────────────── */

// Las cuatro tablas detrás de las pantallas de Personas, una por pantalla.
// Cada página lee EXACTAMENTE una de estas y nada más, así que la relación
// pantalla ↔ tabla es uno a uno y el resultado no es ambiguo.
const PERSONAS = [
  ['employment_contracts', '/personas/contratos'],
  ['incentive_rules', '/personas/incentivos'],
  ['leave_requests', '/personas/licencias'],
  ['employee_skills', '/personas/certificaciones'],
];

// Dato personal y remuneración: si algo de acá filtra, es lo más grave.
const SENSIBLES = [
  'employees',
  'compensation_rates',
  'hr_documents',
  'employee_incentives',
  'attendance_events',
];

// Las doce que la migración 20261014120000 pone bajo RLS. Antes de aplicarla se
// espera que filtren TODAS; después, ninguna. Es la verificación de esa
// migración además de un diagnóstico.
const SIN_RLS = [
  'clients', 'dies', 'ot_templates', 'ot_drafts', 'ot_attachments',
  'ot_approvals', 'purchase_items', 'certification_requirements',
  'ot_requirements', 'inventory_reservations', 'deprecated_worker_fields',
];

// Las vistas pasan por encima de RLS hasta que 20261014121000 les pone
// `security_invoker`. Tres quedan excluidas a propósito (las lee el navegador).
const VISTAS = [
  'workers_with_compensation', 'workers_full_profile', 'worker_stats',
  'ot_cost_summary', 'planta_live', 'inventory_items_stock_v',
  'inventory_stock_transactions_v', 'inventory_low_stock_alerts_v',
  'oc_billing', 'ot_fulfillment', 'capture_feed', 'material_cost_v',
];

// Las tres con policy permisiva viva que 20261014121000 elimina.
const PERMISIVAS = ['workstations', 'shifts', 'scheduling_cost_models'];

// Protegidas por RLS pero nunca probadas: el navegador las lee y sus policies
// cuelgan de auth.uid(), que en esta aplicación es siempre NULL, así que
// deberían devolver cero filas. Estaban fuera de la sonda, y por eso la frase
// "nada legible con la publishable key" cubría 29 objetos y no los 24 que el
// navegador realmente lee.
const RLS_SIN_PROBAR = [
  'inventory_items', 'user_roles', 'machine_costs', 'equipment_investments',
  'leave_balances', 'employment_contracts',
];

/**
 * Exposición ACEPTADA, no filtración.
 *
 * El dueño decidió el 2026-10-15 no cerrar estas tablas. Siete quedan legibles
 * con la publishable key: seis conservan una policy USING(true) sin cláusula TO
 * —aplicable a PUBLIC, que incluye anon— y batches no tiene RLS en absoluto,
 * porque quedó fuera de la migración 20261014120000.
 *
 * Están acá y no en la lista general porque un riesgo aceptado que hace fallar
 * el chequeo en cada corrida convierte el chequeo en ruido, y entonces nadie lo
 * mira. Es el mismo problema que tenía la prueba que se ponía roja según la
 * carga de la máquina. Se reportan como TOLERADA, con su conteo, y no cambian
 * el código de salida.
 *
 * Lo que SÍ cambia el código de salida es una filtración FUERA de esta lista:
 * eso es una regresión.
 *
 * Por qué es defendible: son datos de operación del taller —qué máquinas hay,
 * qué turnos, qué asignaciones, qué repuestos—, no dato personal ni
 * remuneración. Si alguna empieza a guardar algo personal, sale de acá.
 */
const TOLERADAS = new Map([
  ['machines',                    'policy USING(true) — inventario de máquinas'],
  ['jobs',                        'policy USING(true) — trabajos del taller'],
  ['worker_assignments',          'policy USING(true) — asignaciones de turno'],
  ['maintenance_work_orders',     'policy USING(true) — órdenes de mantención'],
  ['machine_cost_entries',        'policy USING(true) — costos por máquina'],
  ['machine_supply_requirements', 'policy USING(true) — insumos por máquina'],
  ['batches',                     'SIN RLS — quedó fuera de 20261014120000'],
]);

/* ── lectura ─────────────────────────────────────────────────────── */

/** Cuenta filas visibles para una key. `null` = la consulta no fue permitida. */
async function leer(objeto, key) {
  const url = `${URL_BASE}/rest/v1/${objeto}?select=*&limit=1`;
  let res;
  try {
    res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
    });
  } catch (e) {
    return { estado: 'red', detalle: e.message };
  }

  const texto = await res.text();
  // `res.ok` (200-299) y NO `status !== 200`.
  //
  // Con `Prefer: count=exact` y `limit=1`, PostgREST contesta **206 Partial
  // Content** siempre que la tabla tiene más filas que el límite — es un rango
  // parcial, no un error. La primera versión de este script trataba el 206
  // como denegado, así que TODA tabla con 2 o más filas se reportaba como "no
  // existe o no es legible ni con service role". Las únicas que pasaban eran
  // las vacías (200 con `*/0`) y una que tenía exactamente 1 fila. Y como el
  // chequeo de la service role iba primero y cortaba, el resultado de la key
  // pública para esas tablas nunca se evaluaba: el informe decía "1 filtración"
  // cuando en realidad no había mirado casi ninguna.
  if (!res.ok) {
    let msg = texto.slice(0, 120);
    try { msg = JSON.parse(texto).message ?? JSON.parse(texto).hint ?? msg; } catch { /* texto plano */ }
    return { estado: 'denegado', http: res.status, detalle: msg };
  }

  // `content-range` viene como "0-0/1234" (o "*/0" cuando no hay filas).
  const rango = res.headers.get('content-range') ?? '';
  const total = Number((rango.split('/')[1] ?? '').trim());
  let columnas = [];
  try {
    const filas = JSON.parse(texto);
    if (Array.isArray(filas) && filas.length > 0) columnas = Object.keys(filas[0]);
  } catch { /* no es JSON; se trata como vacío */ }

  return { estado: 'ok', total: Number.isFinite(total) ? total : 0, columnas };
}

/* ── informe ─────────────────────────────────────────────────────── */

let filtraciones = 0;
let toleradas = 0;
let bloqueadasConDatos = 0;
let sinVerdad = 0;
const pendientes = [];

/**
 * ¿Sirve la service role key, y qué forma tiene?
 *
 * Si la lectura de referencia falla, todo lo demás es ruido. Se chequea una vez
 * y se dice qué tipo de key es (sin mostrarla): Supabase tiene las legacy en
 * formato JWT (`eyJ…`) y las nuevas `sb_secret_…` / `sb_publishable_…`, y
 * mezclarlas da 401 en todo.
 */
function formaDeKey(k) {
  if (k.startsWith('eyJ')) return 'JWT legacy (eyJ…)';
  if (k.startsWith('sb_secret_')) return 'secret key nueva (sb_secret_…)';
  if (k.startsWith('sb_publishable_')) return 'publishable key nueva (sb_publishable_…)';
  return 'formato desconocido';
}

async function preflight() {
  console.log(`\n■ Preflight de credenciales`);
  console.log(`   service role : ${formaDeKey(SVC_KEY)}, ${SVC_KEY.length} caracteres`);
  console.log(`   publishable  : ${formaDeKey(PUB_KEY)}, ${PUB_KEY.length} caracteres`);

  // Una tabla que seguro existe y que la aplicación lee por service role en
  // producción. Si ESTA falla, el problema es la credencial o el Data API, no
  // una policy.
  const sonda = await leer('ots', SVC_KEY);
  if (sonda.estado === 'ok') {
    console.log(`   lectura de referencia en 'ots': OK (${sonda.total} filas) — la key sirve`);
  } else {
    console.log(
      `   lectura de referencia en 'ots': FALLÓ — ${sonda.estado === 'denegado' ? `HTTP ${sonda.http} ${sonda.detalle}` : sonda.detalle}`
    );
    console.log(
      `   ⚠ Si esto falla, los resultados de abajo NO dicen nada sobre RLS.\n` +
      `     Causas típicas: key vencida o rotada, mezcla de formatos legacy/nuevo,\n` +
      `     o el Data API con el esquema 'public' no expuesto.`
    );
  }
}

async function revisar(objeto, nota) {
  const [svc, pub] = await Promise.all([leer(objeto, SVC_KEY), leer(objeto, PUB_KEY)]);

  const verdad = svc.estado === 'ok' ? svc.total : null;
  const etiqueta = objeto.padEnd(30);
  const sufijo = nota ? `  ${nota}` : '';

  if (svc.estado === 'red' || pub.estado === 'red') {
    console.log(`  ?  ${etiqueta} sin red (${(svc.detalle ?? pub.detalle ?? '').slice(0, 60)})`);
    return;
  }

  if (svc.estado === 'denegado') {
    // Sin verdad de referencia no se puede concluir NADA sobre este objeto: no
    // se sabe si la key pública no ve filas porque RLS la frenó o porque no
    // hay filas. El status y el mensaje de PostgREST se imprimen completos —
    // la primera versión de este script los tragaba y decía "no existe",
    // que es justo la conclusión que no se podía sacar.
    sinVerdad++;
    console.log(`  ?  ${etiqueta} SIN VERDAD — service role: HTTP ${svc.http} ${svc.detalle}${sufijo}`);
    return;
  }

  if (pub.estado === 'denegado') {
    console.log(
      `  ✓  ${etiqueta} bloqueado (HTTP ${pub.http}: ${pub.detalle}) · hay ${verdad} fila(s)${sufijo}`
    );
    if (verdad > 0) { bloqueadasConDatos++; pendientes.push([objeto, verdad, nota]); }
    return;
  }

  if (pub.total > 0) {
    // Riesgo aceptado: se informa y NO cuenta como filtración ni cambia el
    // código de salida. Ver TOLERADAS.
    if (TOLERADAS.has(objeto)) {
      toleradas++;
      console.log(
        `  ~  ${etiqueta} TOLERADA — legible, ${pub.total} de ${verdad} fila(s)${sufijo}`,
      );
      return;
    }
    filtraciones++;
    const cols = VERBOSE && pub.columnas.length
      ? `\n       columnas expuestas: ${pub.columnas.join(', ')}`
      : pub.columnas.length ? `  (${pub.columnas.length} columnas)` : '';
    console.log(`  ✗  ${etiqueta} FILTRA ${pub.total} fila(s) de ${verdad}${sufijo}${cols}`);
    return;
  }

  // 200 con cero filas: la consulta se permitió y RLS filtró todo.
  if (verdad > 0) {
    bloqueadasConDatos++;
    pendientes.push([objeto, verdad, nota]);
    console.log(`  ✓  ${etiqueta} 0 de ${verdad} fila(s) — RLS filtró todo${sufijo}`);
  } else {
    console.log(`  ·  ${etiqueta} vacía en ambas lecturas (sin datos que comparar)${sufijo}`);
  }
}

async function bloque(titulo, objetos) {
  console.log(`\n■ ${titulo}`);
  for (const o of objetos) {
    const [nombre, nota] = Array.isArray(o) ? o : [o, ''];
    await revisar(nombre, nota);
  }
}

console.log(`Proyecto: ${URL_BASE.replace(/https:\/\/([a-z0-9]+)\..*/, '$1')}   (env: ${file})`);
console.log('Dos lecturas por objeto: service role = la verdad, publishable key = lo que ve un desconocido.');

await preflight();

await bloque('Pantallas de Personas (Q-1)', PERSONAS);
await bloque('Dato personal y remuneración', SENSIBLES);
await bloque('Tablas sin RLS (las cierra 20261014120000)', SIN_RLS);
await bloque('Vistas (security_invoker: 20261014121000)', VISTAS);
await bloque('Policy permisiva (la quitó 20261014121000)', PERMISIVAS);
await bloque('Protegidas por RLS, antes sin probar', RLS_SIN_PROBAR);
await bloque(
  'Exposición ACEPTADA por decisión del dueño',
  [...TOLERADAS.entries()].map(([t, porque]) => [t, porque]),
);

/* ── veredicto ───────────────────────────────────────────────────── */

console.log('\n' + '─'.repeat(72));

if (sinVerdad > 0) {
  console.log(
    `\nQ-1 — NO SE PUEDE RESPONDER CON ESTA CORRIDA.\n` +
    `  ${sinVerdad} objeto(s) no se pudieron leer ni con la service role, así que para ellos\n` +
    `  no hay verdad de referencia: "la pública ve cero" no distingue entre RLS y tabla vacía.\n` +
    `  Mirá el HTTP y el mensaje que quedó impreso en cada línea con "?" y el preflight de\n` +
    `  arriba. Hasta que la lectura de referencia funcione, esta corrida no es evidencia\n` +
    `  sobre Q-1 — ni a favor ni en contra.`
  );
} else if (bloqueadasConDatos > 0) {
  console.log(
    `\nQ-1 — RESPONDIDA: SÍ.\n` +
    `  ${bloqueadasConDatos} objeto(s) tienen filas que la publishable key no ve.\n` +
    `  Entre ellos: ${pendientes.slice(0, 4).map(([o, n]) => `${o} (${n})`).join(', ')}.\n` +
    `  Las pantallas que los leen desde el navegador están vacías por RLS, no por falta de datos:\n` +
    `  sus policies cuelgan de auth.uid(), que acá es siempre NULL. La Fase 2 del plan\n` +
    `  (mover esas lecturas a rutas de API) arregla un bug visible, no sólo la arquitectura.`
  );
} else {
  console.log(
    `\nQ-1 — SIN RESPUESTA CONCLUYENTE.\n` +
    `  Ningún objeto mostró "la service role cuenta filas y la pública ve cero".\n` +
    `  Si además salieron vacíos en ambas lecturas, esas tablas simplemente no tienen datos:\n` +
    `  las pantallas se ven vacías por eso, y RLS igual las bloquearía cuando se carguen.\n` +
    `  La Fase 2 sigue siendo correcta, pero hoy no hay un bug visible que mostrar.`
  );
}

if (toleradas > 0) {
  console.log(
    [
      String.fromCharCode(10) + String.fromCharCode(126) + " " + toleradas +" objeto(s) legibles con la publishable key POR DECISION,",
      "  no por descuido: datos de operacion del taller, sin dato personal ni",
      "  remuneracion. No afectan el codigo de salida. Si alguno empieza a",
      "  guardar algo personal, hay que sacarlo de TOLERADAS y cerrarlo.",
    ].join(String.fromCharCode(10)),
  );
}

if (filtraciones > 0) {
  console.error(
    `\n✗ ${filtraciones} objeto(s) LEGIBLES con la publishable key.\n` +
    `  Esa key está en el bundle del navegador y el repositorio es público: esto es\n` +
    `  legible por cualquiera. Correr con --verbose para ver qué columnas quedan expuestas.\n` +
    `  Las migraciones 20261014120000 (RLS) y 20261014121000 (vistas) son el cierre.`
  );
  process.exit(1);
}

console.log('\n✓ Ninguna filtración fuera de lo aceptado.');
