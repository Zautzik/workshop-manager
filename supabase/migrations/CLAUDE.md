# Database Migration Checklist
1. Never modify an existing migration file. Create a new timestamped `.sql` file.
2. Every new table MUST enable RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) with explicit policies.
3. Run `node scripts/check-migration-redefinitions.cjs`, `node scripts/check-rls-drift.mjs`, and `node scripts/gen-types.mjs` before finishing.