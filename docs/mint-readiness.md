# Asset mint readiness

`AssetModule.checkMintReadiness()` provides a fail-closed pre-signing review for
RWA mint operations. It evaluates five independent conditions:

1. the configured signer is an authorised issuer;
2. the recipient is KYC/whitelist approved;
3. the asset is active for issuance;
4. the amount is a positive safe integer; and
5. the target Soroban RPC/network is healthy.

A result is ready only when every check is `passed`. `blocked`, `unknown`, and
`error` states all prevent `mintWhenReady()` from constructing or signing the
transaction.

## Why issuer and asset probes are required

The current Raegis contract interface exposes a recipient whitelist read, but
does not expose authoritative public reads for issuer role or asset lifecycle
status. The SDK does not infer those states from a configured keypair, a client
factory role, or local UI state. Supply `issuerAuthorized` and `assetActive`
probes backed by your deployment's authoritative registry or contract reads.
Omitting either probe produces a typed `unknown` result and fails closed.

The default network check calls Soroban RPC `getHealth()` and requires a
`healthy` response. `networkReady` can replace it when an application has a
stricter environment-specific health gate.

## Review before signing

```ts
import { createIssuerClient, MintReadinessProbes } from '@aegis/sdk';
import { Keypair } from '@stellar/stellar-sdk';

const issuer = createIssuerClient({
  environment: 'testnet',
  contractId: 'C_YOUR_ASSET_CONTRACT',
  keypair: Keypair.fromSecret('S_ISSUER_SECRET'),
});

const probes: MintReadinessProbes = {
  issuerAuthorized: async ({ issuer, contractId }) =>
    issuerRegistry.isAuthorised(contractId, issuer),
  assetActive: async ({ contractId }) =>
    assetRegistry.isIssuanceActive(contractId),
};

const recipient = 'G_RECIPIENT';
const amount = 5_000;
const review = await issuer.asset.checkMintReadiness(
  recipient,
  amount,
  probes,
);

if (!review.ready) {
  console.error(review.blockingCodes, review.checks);
  throw new Error('Mint review failed');
}

// Re-runs the checks immediately before constructing and signing the tx.
const transactionHash = await issuer.asset.mintWhenReady(
  recipient,
  amount,
  probes,
);
```

`MintReadinessError` carries the complete readiness result when
`mintWhenReady()` blocks.

## Limitations and authority boundary

- Readiness is a preflight snapshot, not a reservation. Contract state can
  change after a successful check.
- The recipient check uses the current `is_whitelisted` contract read.
- Issuer and asset probes are application-supplied until the contract exposes
  those reads directly.
- RPC health does not prove that a transaction will be accepted.
- The low-level `mint()` method remains available for compatibility and does
  not run readiness checks. New application flows should use
  `mintWhenReady()`.
- The Soroban contract remains the final authority. Simulate where supported
  and handle contract rejection even after a passing readiness result.
