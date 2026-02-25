# Agents — Operational Notes

## Sandbox Environment

- ARM64 Linux under emulation — native binaries (esbuild, @next/swc) produce SIGILL
- Use `esbuild-wasm` as a shim: `node_modules/esbuild/lib/main.js` → `module.exports = require('esbuild-wasm')`
- npm install corrupts large files; after `npm install --ignore-scripts`, extract packages from tarballs (`npm pack <pkg>`) and copy into node_modules
- vitest config uses `environment: "node"` (not jsdom — jsdom causes ESM resolution errors in this env)
- Use `bash -l -c "..."` for commands that need nvm/node 22

## Testing

- Run tests: `bash -l -c "npx vitest run"`
- Type check: `bash -l -c "npx tsc --noEmit"` (may need TS files restored from tarball first)
- Build: cannot run in sandbox (see BLOCKERS.md)

## Project Patterns

- Server-side Supabase client: `import { createClient } from "@/lib/supabase/server"`
- API routes: `app/api/<name>/route.ts` with `export async function POST/GET`
- Auth check in API routes: `supabase.auth.getUser()` → return 401 if no user
- Server actions return `{ error: string }` on failure, `redirect()` on success
- Path alias: `@/` → project root
