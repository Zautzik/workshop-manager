/**
 * One-off script to seed the initial admin user in a Supabase project.
 *
 * Usage (requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env):
 *   npx tsx scripts/seed-admin.ts
 *
 * Never expose these credentials in an HTTP response or commit them to source control.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@printpress.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error(
    'SEED_ADMIN_PASSWORD is required — set it in your environment before running this script.',
  );
  process.exit(1);
}

async function main() {
  const { error: createError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD as string,
    email_confirm: true,
  });

  if (createError && !createError.message.includes('already registered')) {
    throw createError;
  }

  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;

  const adminUser = list?.users?.find((u) => u.email === ADMIN_EMAIL);
  if (!adminUser) throw new Error('Could not find user after creation');

  const { error: roleError } = await supabase
    .from('user_roles')
    .upsert({ user_id: adminUser.id, role: 'admin' });

  if (roleError) throw roleError;

  console.log(`Admin user ready: ${ADMIN_EMAIL} (id: ${adminUser.id})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
