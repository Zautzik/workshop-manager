const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i < 0) continue;
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function q(path) {
  const res = await fetch(url + '/rest/v1/' + path, {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('ERR', path, res.status, data);
    process.exit(1);
  }
  return data;
}

(async () => {
  const workstations = await q('workstations?select=id,name,display_name,machine_id,type&order=type.asc,name.asc');
  const machines = await q('machines?select=id,name,type,status,is_active,workstation_id,updated_at,created_at&order=updated_at.desc');

  const byWs = new Map();
  for (const m of machines) {
    if (!m.workstation_id) continue;
    const arr = byWs.get(m.workstation_id) || [];
    arr.push(m);
    byWs.set(m.workstation_id, arr);
  }

  console.log('Workstations:', workstations.length, 'Machines:', machines.length);
  for (const ws of workstations) {
    const linked = byWs.get(ws.id) || [];
    if (!linked.length && !ws.machine_id) continue;

    console.log('\nWS', ws.id, '|', ws.display_name || ws.name, '| machine_id:', ws.machine_id || 'null');
    if (ws.machine_id) {
      const m = machines.find((x) => x.id === ws.machine_id);
      console.log('  machine_id row:', m ? `${m.name} (${m.id}) active=${m.is_active} updated=${m.updated_at}` : 'NOT FOUND');
    }
    for (const m of linked.slice(0, 8)) {
      console.log('  ws_link row:', `${m.name} (${m.id}) active=${m.is_active} updated=${m.updated_at}`);
    }
    if (linked.length > 8) console.log('  ...', linked.length - 8, 'more');
  }
})();
