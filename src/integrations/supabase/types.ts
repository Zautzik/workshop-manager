// This is a stub. Replace it with fully-generated types so TypeScript can
// catch schema renames (especially in security-critical queries like user_roles).
//
// To regenerate against a running local instance:
//   npx supabase start
//   npx supabase gen types typescript --local > src/integrations/supabase/types.ts
//
// To regenerate against a hosted project:
//   npx supabase gen types typescript --project-id <your-project-id> \
//     > src/integrations/supabase/types.ts
//
// Until then, all DB queries are typed as `any`. The one exception is the
// user_roles query in src/lib/auth.ts, which narrows its result to AppRole
// inline so TypeScript will at least catch that field rename locally.
export type Database = any;
