# Package smoke tests

The package smoke test exercises the SDK the way a downstream consumer sees it: through the built package entrypoint instead of source-file imports.

Run:

```bash
npm run build
npm run test:smoke
```

The smoke runner verifies that:

- the root package exposes `AegisClient`;
- a testnet client can be constructed with the public configuration shape;
- the public client exposes the compliance module;
- invalid configuration throws the exported `ConfigValidationError` with the expected stable code; and
- public error types such as `ConfigValidationError` and `RoleCapabilityError` remain importable.

`npm run check` and `npm run verify` run the smoke test after the TypeScript build and before broader Jest and compatibility checks. This catches packaging and export regressions that source-level unit tests can miss.

The smoke test is network-free: constructing the client creates the RPC wrapper but does not submit or simulate a transaction.
