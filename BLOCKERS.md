# Blockers

## Environment: ARM Binary Incompatibility (sandbox)

**Status:** Active
**Impact:** `next build` and `npm run lint` cannot run in the sandbox environment
**Affects:** CI verification in the sandbox only — no impact on local dev or deployment

### Problem

The sandbox runs on an emulated ARM64 Linux environment where native binaries produce `SIGILL` (illegal instruction) errors:
- **esbuild** native binary: SIGILL → worked around with `esbuild-wasm` shim
- **@next/swc** native binary: SIGILL → WASM fallback also produces SIGILL during compilation
- **npm install** corrupts large files (>1MB) intermittently, requiring manual extraction from tarballs

### What Works
- `npx vitest run` (tests) — works via esbuild-wasm shim
- `npx tsc --noEmit` (type checking) — works after manual TS file restoration
- All application code is correct and type-safe

### What Doesn't Work
- `npm run build` (`next build`) — SWC WASM bindings don't support Turbopack; webpack mode also hits SIGILL
- `npm run lint` (`eslint`) — unrelated `side-channel` dependency issue with eslint-plugin-react

### Workaround
Tests and type checking pass. Build verification should be done in a non-emulated environment (local dev machine, CI pipeline, or Vercel deployment).
