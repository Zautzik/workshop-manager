# Points the dev server at the local stack or back at the cloud project.
#
#   npm run db:use:local   → writes .env.local with the local stack's URL + keys
#   npm run db:use:cloud   → removes it, so .env (the cloud project) applies again
#
# Next loads .env.local over .env and reloads both on change: a running
# `npm run dev` switches without a restart. Only the four Supabase variables are
# overridden. NextAuth and WhatsApp settings keep coming from .env.
param([ValidateSet('local', 'cloud')][string]$Target = 'local')
$root = Split-Path -Parent $PSScriptRoot
$file = Join-Path $root '.env.local'

if ($Target -eq 'cloud') {
	if (Test-Path $file) { Remove-Item $file }
	Write-Host 'Dev now uses the CLOUD project (.env).'
	exit 0
}

Set-Location $root
$status = @{}
npx supabase status -o env 2>$null | ForEach-Object {
	if ($_ -match '^(\w+)="?([^"]*)"?$') { $status[$Matches[1]] = $Matches[2] }
}
if (-not $status['API_URL']) { Write-Host 'Local stack is not running: npx supabase start' -ForegroundColor Red; exit 1 }

@"
# Written by scripts/use-db.ps1: dev runs against the LOCAL Supabase stack.
# "npm run db:use:cloud" deletes this file. Standard local demo keys, not secrets.
NEXT_PUBLIC_SUPABASE_URL=$($status['API_URL'])
SUPABASE_URL=$($status['API_URL'])
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$($status['ANON_KEY'])
SUPABASE_ANON_KEY=$($status['ANON_KEY'])
SUPABASE_SERVICE_ROLE_KEY=$($status['SERVICE_ROLE_KEY'])
"@ | Set-Content -Encoding ascii $file
Write-Host "Dev now uses the LOCAL stack ($($status['API_URL'])). Studio: http://127.0.0.1:54323"
