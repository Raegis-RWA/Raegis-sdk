# Public API & Export Governance

The SDK has **two supported package entrypoints**. The `exports` map in
`package.json` is the source of truth:

| Entrypoint | Intended use | Source |
| --- | --- | --- |
| `@aegis/sdk` | Production SDK clients, modules, helpers, errors, and public types | `src/index.ts` |
| `@aegis/sdk/testing` | Test-only mocks and deterministic fixtures | `src/testing/index.ts` |

Everything else under `src/` is **internal** unless it is re-exported by one
of those entrypoints. Consumers must not import paths such as
`@aegis/sdk/config/validate`, `@aegis/sdk/events/decoder`, or other source
subpaths. Internal file layout may change without preserving those deep paths.

The member-level contract of the production entrypoint is documented in the
[API Reference](./api-reference.md). Examples in this repository import SDK
features through `@aegis/sdk` (or `@aegis/sdk/testing` for test helpers),
not through `src/` or undocumented package subpaths.

## Automated surface contract

`npm run test:public-api` type-checks
`tests/public-api-exports.types.ts` against the declarations produced by
`npm run build`.

The contract deliberately uses package self-name imports so TypeScript resolves
through the same `package.json#exports` map a consumer sees. It checks:

- the exact runtime export names for `@aegis/sdk`;
- the exact runtime export names for `@aegis/sdk/testing`;
- named resolution of the current public type exports; and
- that an undocumented deep source import remains rejected.

`npm run check` and `npm run verify` include this contract after the build,
so an accidental runtime export addition/removal, removal of a covered public
type, or opening of a tested internal deep path fails the release gate.

## Changing the public API

A change that adds, removes, renames, relocates, or incompatibly changes a
public export must be intentional and reviewable. In the same pull request:

1. update the appropriate public entrypoint (`src/index.ts` or
   `src/testing/index.ts`);
2. update `package.json#exports` when adding or removing a package subpath;
3. update `tests/public-api-exports.types.ts` so the surface change is
   explicit rather than accidental;
4. update the [API Reference](./api-reference.md) and any affected examples;
5. document incompatible consumer changes in the
   [Migration Guide](./migration-guide.md).

Removing or incompatibly changing an existing production export is a breaking
API change. Adding a new export is additive, but it still requires the surface
contract and documentation update above.

## Review rule

A new source module is **not public merely because it exists**. It becomes
public only when the package entrypoint intentionally re-exports it and the
public-surface contract is updated in the same reviewed change. This keeps
internal refactors from silently expanding the supported API.
