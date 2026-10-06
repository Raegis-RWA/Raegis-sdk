# Release and Migration Checklist

## Status

**Applies to:** Aegis SDK (`@axionvera/aegis-sdk`)  
**Last updated:** 2026-07-28  

---

## 1. Pre-Release Checklist

### 1.1 Version Bump

- [ ] Increment version in `package.json` (semver: major/minor/patch).
- [ ] Update version in `src/version.ts` (if separate from package.json).
- [ ] Verify no pre-release tag leakage (`-alpha`, `-beta`) unless intended.

### 1.2 Changelog

- [ ] Add entry under `## [X.Y.Z] - YYYY-MM-DD`.
- [ ] Categorise changes: `### Breaking`, `### Features`, `### Fixes`, `### Docs`.
- [ ] Link to relevant issues/PRs (`[#N]`).
- [ ] Mark breaking changes with `**[BREAKING]**` prefix.

### 1.3 Compatibility

- [ ] Review the [SDK / Aegis Contract Compatibility Matrix](contract-compatibility-matrix.md) against the deployed Aegis contract commit/spec; update the source pin and mapped dependencies whenever they change.
- [ ] List Soroban/SDK version compatibility (`requires soroban-sdk >= 20.0.0`).
- [ ] List dashboard compatibility (`compatible with aegis-dashboard >= 1.0.x`).
- [ ] Note any TypeScript / Node.js minimum version changes.

### 1.4 Deprecation

- [ ] Verify deprecated exports have a `@deprecated` JSDoc tag pointing to replacement.
- [ ] Verify deprecated items produce a runtime warning in dev mode.
- [ ] Document migration path for each deprecated item.

### 1.5 Tests

- [ ] `npm test` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` produces clean output.
- [ ] Smoke test: `node -e "require('@axionvera/aegis-sdk')"` works from a clean install.

### 1.6 Docs

- [ ] README examples updated for new API.
- [ ] Migration guide updated (if breaking).
- [ ] API reference regenerated (if using typedoc).

---

## 2. Migration Guide Template

Use this template for any breaking change:

```markdown
## Migrating from X.Y.Z to X.Y.Z

### Summary

<!-- 1-2 sentence what changed and why -->

### Before (vX.Y.Z)

```typescript
const client = new AegisClient({
  apiKey: "..."  // deprecated
});
```

### After (vX.Y.Z+1)

```typescript
const client = new AegisClient({
  network: { rpcUrl: "...", passphrase: "Test SDF Network ; September 2015" }
});
```

### Timeline

- `vX.Y.Z` — Old API works with deprecation warning.
- `vX.Y.Z+2` — Old API removed.

### Affected Consumers

- [ ] Check SDK consumers for usage of deprecated API.
- [ ] Update integration tests to use new API.
```

---

## 3. Release Process

### 3.1 Publish

- [ ] `npm run build` produces clean dist/.
- [ ] `npm publish --dry-run` verifies package contents.
- [ ] `npm publish` with appropriate tag (`latest`, `next`, `beta`).
- [ ] Verify package on npm: `npm view @axionvera/aegis-sdk`.

### 3.2 Git

- [ ] Commit version bump, changelog, and any source changes with message:
      `chore: release vX.Y.Z`
- [ ] Tag commit: `git tag vX.Y.Z && git push origin vX.Y.Z`.
- [ ] Push release branch / merge to main.

### 3.3 GitHub Release

- [ ] Create GitHub Release with tag `vX.Y.Z`.
- [ ] Paste changelog entry into release description.
- [ ] Attach build artifacts if any.

---

## 4. Post-Release

- [ ] Verify npm package installs cleanly:
      `mkdir /tmp/test-install && cd /tmp/test-install && npm init -y && npm install @axionvera/aegis-sdk`
- [ ] Verify basic import works.
- [ ] Monitor npm download stats + GitHub Issues for 48h.
- [ ] Announce release (if major or security fix).

---

## 5. Rollback Procedure

If a release is broken:

1. `npm deprecate @axionvera/aegis-sdk@X.Y.Z "critical bug — use X.Y.Z-1"`.
2. Publish a patch release (`X.Y.Z+1`) with the fix.
3. Update the GitHub Release with a rollback note.
4. Notify consumers to upgrade.

---

## Appendix: Pre-Flight Sanity Check

```bash
# Run these in order before any release
npm run lint
npm test
npm run build
npm pack --dry-run  # verify package contents
node -e "require('@axionvera/aegis-sdk')"  # verify import
```
