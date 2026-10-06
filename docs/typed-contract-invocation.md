# Typed Contract Invocation

The SDK routes Soroban contract calls through one shared invocation boundary: `SorobanInvocation`.

The boundary separates **read simulation** from **state-changing submission** so individual modules do not each need to rebuild RPC request shape, signer checks, sequence handling, preparation, signing, submission, and response validation.

## Read-only calls

Use `createCall()` (or `createCallFor()` when a module reads a secondary asset contract) and `read()`:

```ts
const call = client.invocation.createCall(
  'is_whitelisted',
  nativeToScVal(address, { type: 'address' }),
);

const approved = await client.invocation.read(
  call,
  (retval) => parseSorobanResult(retval as string) as boolean,
  'is_whitelisted',
);
```

Read invocations:

- build a real `Transaction` before calling `simulateTransaction`;
- never sign or submit;
- use the configured signer public key as the simulation source when available, otherwise a throwaway public key is used only to form a valid envelope;
- map an unsuccessful simulation to `SorobanInvocationError` with `SIMULATION_FAILED` instead of converting transport/contract uncertainty into a false business result;
- map decoder failures to `MALFORMED_RESPONSE`.

## State-changing calls

Write invocations require a configured signer:

```ts
const signer = client.invocation.getRequiredSigner('mint_asset');
const call = client.invocation.createCall(
  'mint_asset',
  nativeToScVal(signer.publicKey(), { type: 'address' }),
  nativeToScVal(recipient, { type: 'address' }),
  nativeToScVal(amount, { type: 'i128' }),
);

const { hash } = await client.invocation.write(call, 'mint_asset');
```

The write path:

1. requires the signer through the typed invocation boundary;
2. fetches the signer's live account sequence from RPC;
3. builds the contract transaction;
4. calls `prepareTransaction()` so Soroban footprint/auth data are attached;
5. signs the prepared transaction;
6. submits it;
7. returns a typed `{ hash, status }` result.

A missing signer becomes `SorobanInvocationError` with `SIGNER_REQUIRED`. A provider response that reports `ERROR` or has no transaction hash becomes `SUBMISSION_FAILED`.

Transport failures are deliberately not flattened into invocation errors. `AegisClient.runNetworkOperation()` continues to classify those as the public `NetworkFailure` taxonomy, preserving rate-limit, timeout, RPC availability, and network-passphrase semantics.

## Extending a module

When adding another Soroban-backed module:

1. Keep business-specific argument construction and return types in the module.
2. Build the contract operation with `client.invocation.createCall()` or `createCallFor()`.
3. Use `read<T>()` for simulation-only queries and provide one decoder that returns the module's public type.
4. Use `getRequiredSigner()` plus `write()` for state changes.
5. Do not call `simulateTransaction`, `prepareTransaction`, or `sendTransaction` directly unless the module genuinely needs a protocol flow the shared boundary cannot represent.
6. Add focused tests for the module's mapping/validation rules; the generic transaction-shape and signer/submission behavior is covered by the invocation-layer tests.

## Security and compliance boundary

The invocation layer enforces SDK signer presence and transaction mechanics. It does **not** prove an address has an on-chain issuer/admin/compliance role and it does not make a legal, regulatory, KYC, investment, or financial determination. Soroban contracts remain authoritative for protocol authorization. Dashboard consumers should preserve unknown/unavailable states rather than presenting an RPC or simulation failure as a protocol denial.
