# Transaction simulation and readiness

Raegis SDK maps Soroban simulation responses to a small typed readiness model
before selected signed operations proceed.

## Readiness states

| State | Meaning | Submission-ready |
| --- | --- | --- |
| `success` | Simulation produced a usable transaction result | yes |
| `warning` | Simulation succeeded but requires another step, such as ledger restoration | no |
| `failed` | Simulation failed or the RPC transport rejected the request | no |
| `unauthorised` | Simulation indicates missing or rejected authorisation | no |
| `blocked` | Protocol/compliance rules prevent the operation | no |
| `unknown` | The response does not match a recognised simulation shape | no |

Each result includes a stable `code`, safe `message`, operation name, and
optional `latestLedger`. Raw RPC error strings are never copied into the
public result.

## Compliance checks

`ComplianceModule.checkWhitelistReadiness(address)` returns the typed
simulation state for the whitelist query.

```ts
const readiness = await client.compliance.checkWhitelistReadiness(address);

if (!readiness.ready) {
  console.log(readiness.state, readiness.code);
}
```

The existing `checkWhitelist(address)` path uses the same readiness mapper and
returns `false` for non-ready simulation states.

## Portfolio reads

`InvestorModule.checkPortfolioReadiness(address, contractId?)` exposes the same
typed readiness model for a portfolio balance simulation. The normal
`getPortfolio(address)` path routes balance responses through that mapper so
non-ready responses remain fail-closed instead of being mistaken for a
successful balance read.

## Mint and transfer

`AssetModule.mint()` and `AssetModule.transfer()` simulate their built
transaction before signing it. A non-ready result stops the send path and
throws `TransactionSimulationError`.

```ts
import { TransactionSimulationError } from '@aegis/sdk';

try {
  await client.asset.mint(recipient, amount);
} catch (error) {
  if (error instanceof TransactionSimulationError) {
    console.log(error.state, error.code);
  }
}
```

For advanced callers that already have a transaction, use
`simulateTransactionReadiness(rpcServer, transaction, operation)` or map an
existing response with `mapSimulationReadiness(response, operation)`.

## Limitations

Simulation is a preflight signal, not a settlement guarantee. Ledger state can
change between simulation and submission, signatures and authorisation still
need to be valid at submission time, and a restore warning requires the caller
to complete the restoration flow before retrying.

The mapper deliberately does not expose provider diagnostics. If a response
contains a new or unrecognised shape it returns the safe `unknown` state
instead of guessing readiness. Network/transport exceptions returned through
the standalone simulation helper are collapsed to a safe `failed` result.
