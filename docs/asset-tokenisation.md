# Asset tokenisation client

The asset-tokenisation client gives applications a typed view of the Aegis
protocol state used to prepare RWA issuance. The contract remains authoritative
for roles, recipient status, caps, lifecycle state, and transaction execution.

## Current contract model

The current Aegis contract does not expose a separate `register_asset` call.
Asset setup and issuance are represented by:

1. `update_asset_metadata(caller, name, symbol, uri)` for the asset metadata;
2. the admin-governed asset lifecycle (`Draft -> Active`);
3. `mint_asset(caller, recipient, amount)` for issuance.

The SDK mirrors that ABI instead of inventing another registration method.

## Reading asset state

```ts
const metadata = await client.assetTokenisation.getMetadata();
const issuance = await client.assetTokenisation.getIssuanceConfiguration();
const readiness = await client.assetTokenisation.checkReadiness();
```

`getIssuanceConfiguration()` reads lifecycle status, the contract-wide pause,
total supply, supply cap, and holding cap. A supply or holding cap of `"0"`
means that cap is disabled by the protocol.

`checkReadiness()` returns ready only when the asset name and symbol are
configured, the contract-wide pause is off, and the lifecycle is `active`.

The returned `protocolOnly: true` flag is an invariant. A ready result does
not prove caller role, recipient eligibility, remaining recipient capacity,
real-world eligibility, successful simulation, or final transaction outcome.
Those checks remain authoritative in their existing layers.

## Preparing contract operations

The module exposes typed builders for the current contract ABI:

```ts
const metadataOperation =
  client.assetTokenisation.buildMetadataUpdateOperation(operatorAddress, {
    name: 'Treasury Note 2028',
    symbol: 'TN28',
    uri: 'ipfs://...',
  });

const mintOperation = client.assetTokenisation.buildMintOperation(
  operatorAddress,
  recipientAddress,
  '10000000',
);
```

These helpers only construct Soroban operations. They do not sign, simulate,
submit, or confirm transactions. Applications should pass them through the
existing transaction pipeline and repeat submission-time checks there.

Metadata validation requires non-empty `name` and `symbol` strings. The URI
remains optional because the contract itself permits an empty URI.

## Stable errors

`AssetTokenisationError` exposes these codes:

| Code | Meaning |
| --- | --- |
| `INVALID_METADATA` | Metadata is malformed or name/symbol is empty. |
| `INVALID_ADDRESS` | A builder received a missing or invalid Stellar address. |
| `INVALID_AMOUNT` | A mint amount is not a positive integer. |
| `RPC_FAILURE` | A protocol-state read failed at the network boundary. |
| `INVALID_CONTRACT_RESPONSE` | A read returned an unexpected or undecodable value. |

The readiness object is a protocol-state summary, not a substitute for the
application's authorization, recipient, business, or submission checks.
