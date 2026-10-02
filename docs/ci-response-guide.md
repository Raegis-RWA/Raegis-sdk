# Failing CI Response Guide

Failing CI checks can block PR approval. This guide explains how to diagnose and fix each type of failure so you can get your PR green quickly.

## Before you begin

- Run `npm run check` locally to catch issues before pushing. This is the same gate CI runs.
- Check the CI logs for the exact error message — it tells you what failed and where.

## Type errors

- Run `npm run build` locally to reproduce TypeScript compilation errors.
- TypeScript errors show the exact file, line number, and expected types.
- Fix the type mismatch and re-run `npm run build` to confirm.

## Test failures

- Run `npm test -- --runInBand` locally to reproduce test failures.
- Jest output shows which test failed and why — look for the red `●` markers.
- Run a single test file: `npx jest path/to/test.ts`.
- Common causes: outdated snapshots, changed API responses, missing mocks.

## Lint failures

- Run `npm run lint` locally.
- Auto-fix where possible: `npx eslint src --ext .ts --fix`.
- Common issues: unused imports, incorrect indentation, missing semicolons.

## Format failures

- Run `npm run format` locally.
- Prettier auto-formats all matching files — no manual fixes needed.
- Re-run `npm run lint` after formatting to confirm everything passes.

## Build failures

- Check the TypeScript compilation output from `npm run build`.
- Common causes: missing exports, incorrect module paths, type incompatibility.

## Dependency issues

- Run `npm ci` to get a clean install matching `package-lock.json`.
- If you changed dependencies and `npm ci` fails, run `npm install` then commit the updated lockfile.

## Runtime compat failures

- See [Runtime Compatibility](runtime-compatibility.md) for supported environments.
- Check if your change uses Node.js or browser APIs that differ across environments.
- Run `npm run test:compat` locally to reproduce.

## Still stuck?

- Before opening an issue, attach a **redacted** configuration diagnostic
  (`client.diagnoseConfiguration()` or `buildConfigDiagnostic(config)`). See
  [Configuration diagnostics](configuration-diagnostics.md). Never paste raw
  RPC URLs, Keypairs, or `.env` contents.
- Check [existing issues](https://github.com/AegisRWA/aegis-sdk/issues) or open a new one.
- Reference the failing CI run URL in your issue so maintainers can see exactly what happened.
