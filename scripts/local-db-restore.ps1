# Rebuilds the LOCAL Supabase database as a copy of the cloud project.
# See docs/entorno-local.md. Requires Docker Desktop running.
#
#   powershell -File scripts/local-db-restore.ps1            # reuse last dump
#   powershell -File scripts/local-db-restore.ps1 -Refresh   # dump the cloud first
#
# Reads the cloud (pg_dump through the CLI); never writes to it. Wipes and
# recreates the local stack's database volume.
#
# The dump lands in supabase/.dump/ (gitignored): it holds the auth users'
# password hashes. Never commit it.
param([switch]$Refresh)
# Not 'Stop': Windows PowerShell turns any native stderr line (psql NOTICEs)
# into a fatal error. Native steps check $LASTEXITCODE instead.
$ErrorActionPreference = 'Continue'
function Assert-Ok($what) { if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: $what" -ForegroundColor Red; exit 1 } }
$root = Split-Path -Parent $PSScriptRoot
$dump = Join-Path $root 'supabase/.dump'
$db = 'supabase_db_sgnbbatucphbqhahgczq'
Set-Location $root

if ($Refresh -or -not (Test-Path "$dump/data.sql")) {
	New-Item -ItemType Directory -Force $dump | Out-Null
	Write-Host '== Dumping the cloud project (read-only)'
	npx supabase db dump --linked -f "$dump/schema.sql"; Assert-Ok 'schema dump'
	npx supabase db dump --linked --role-only -f "$dump/roles.sql"; Assert-Ok 'roles dump'
	npx supabase db dump --linked --data-only --use-copy -f "$dump/data.sql"; Assert-Ok 'data dump'
}
node scripts/local-db-fixups.mjs $dump; Assert-Ok 'fixups'

Write-Host '== Recreating the local stack (empty database, migrations off)'
npx supabase stop --no-backup 2>&1 | Out-Null
npx supabase start 2>&1 | Out-Null; Assert-Ok 'supabase start'

# Version skew between the cloud and the local images: newer auth/storage
# tables or columns the local stack doesn't have. Known and harmless (MFA
# recovery codes, SCIM, one-time tokens, bucket lifecycle). Buckets are
# re-inserted by post.sql.
$expected = 'auth\.(mfa_recovery_code|scim_)|one_time_tokens|storage\.|lifecycle|buckets|syntax error at or near "ot"'

foreach ($f in 'roles', 'schema', 'pre', 'data', 'post') {
	docker cp "$dump/$f.sql" "${db}:/tmp/$f.sql" | Out-Null
	$out = docker exec -e PGPASSWORD=postgres $db psql -h 127.0.0.1 -U supabase_admin -d postgres -q -f "/tmp/$f.sql" 2>&1 | ForEach-Object { "$_" }
	# -cmatch: psql's own "error: invalid command \." lines are just the tail of
	# a COPY that already failed with an ERROR: above.
	$errors = @($out | Where-Object { $_ -cmatch 'ERROR:' })
	$unexpected = @($errors | Where-Object { $_ -notmatch $expected })
	Write-Host ("== {0}: {1} errors ({2} unexpected)" -f $f, $errors.Count, $unexpected.Count)
	$unexpected | Select-Object -First 20 | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
}

Write-Host '== Local copy'
docker exec -e PGPASSWORD=postgres $db psql -h 127.0.0.1 -U supabase_admin -d postgres -At `
	-c "select 'ots ' || count(*) from public.ots" `
	-c "select 'purchases ' || count(*) from public.purchases" `
	-c "select 'ot_cost_lines ' || count(*) from public.ot_cost_lines" `
	-c "select 'auth.users ' || count(*) from auth.users" `
	-c "select 'buckets ' || string_agg(id, ',') from storage.buckets"
