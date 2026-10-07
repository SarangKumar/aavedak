# Scripts

When adding generators (codegen, seed, etc.):

1. Load env from the **correct app file** (`apps/web/.env.local` or `apps/api/.env`).
2. Never read web secrets for API tasks or vice versa.
3. Fail clearly if required vars are missing.
