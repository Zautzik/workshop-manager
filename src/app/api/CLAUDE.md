# API Route Checklist
1. First line of every handler MUST call `requireAuth()` unless explicitly documented as a public webhook/token route.
2. Validate all `req.json()` and query params with `zod` `.safeParse()`.
3. Put business math and multi-step mutations in `src/lib/`, never inline in `route.ts`.