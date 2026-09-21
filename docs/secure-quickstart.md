# Secure SDK Quickstart

This guide is the hardened path for configuring the Raegis SDK without embedding
Stellar secret keys in source code or giving read-only processes signer capability.

## 1. Separate public configuration from signer secrets

Public configuration can be supplied to read-only processes:

```dotenv
RAEGIS_CONTRACT_ID=C_YOUR_CONTRACT_ID
RAEGIS_RPC_URL=https://soroban-testnet.stellar.org
```

Signer secrets belong only in a protected server-side secret store or runtime
environment:

```dotenv
RAEGIS_ADMIN_SECRET=S_YOUR_ADMIN_SECRET
```

Never commit a real `S...` secret. Do not place signer secrets in environment
variables that frontend frameworks expose to browser bundles, such as `NEXT_PUBLIC_*`
or `VITE_*`. The SDK currently accepts `Keypair` objects for signing; raw secret-key
construction should therefore stay in a trusted backend or other protected runtime.

## 2. Read-only calls are keyless

```typescript
import { createReadOnlyClient } from '@aegis/sdk';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const reader = createReadOnlyClient({
  environment: 'testnet',
  contractId: required('RAEGIS_CONTRACT_ID'),
  rpcUrl: process.env.RAEGIS_RPC_URL?.trim() || undefined,
});

const approved = await reader.compliance.checkWhitelist('G_USER_PUBLIC_KEY');
const portfolio = await reader.investor.getPortfolio('G_USER_PUBLIC_KEY');
console.log({ approved, portfolio });
```

`createReadOnlyClient` does not accept a keypair. This keeps dashboards, indexers,
and compliance readers from acquiring transaction-signing capability by accident.

## 3. Admin calls require explicit signer capability

```typescript
import { Keypair } from '@stellar/stellar-sdk';
import { createAdminClient } from '@aegis/sdk';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const admin = createAdminClient({
  environment: 'testnet',
  contractId: required('RAEGIS_CONTRACT_ID'),
  rpcUrl: process.env.RAEGIS_RPC_URL?.trim() || undefined,
  keypair: Keypair.fromSecret(required('RAEGIS_ADMIN_SECRET')),
});

admin.assertAdminAccess();
await admin.asset.mint('G_INVESTOR', 10000);
```

`assertAdminAccess()` is an SDK intent guard. Contract-side authorization remains
the source of truth for whether the signer is actually allowed to perform the call.

## 4. RPC URL forms

For public testnet, the SDK preset resolves to:

```text
https://soroban-testnet.stellar.org
```

An RPC override must still be a complete URL, including `http://` or `https://`.
For `testnet` and `mainnet`, insecure `http://` overrides are rejected. Plain HTTP
is intended only for the `local` preset, whose default endpoint is:

```text
http://localhost:8000/soroban/rpc
```

If you do not use an environment preset, supply both `rpcUrl` and
`networkPassphrase` so the RPC endpoint and transaction network cannot silently
drift apart:

```typescript
import { Networks } from '@stellar/stellar-sdk';
import { createReadOnlyClient } from '@aegis/sdk';

const reader = createReadOnlyClient({
  contractId: 'C_YOUR_CONTRACT_ID',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
});
```

## 5. Copy/paste-safe example

`examples/secure-quickstart.ts` contains reusable functions for both the keyless
read path and the signer-only admin path. It reads secrets only when the admin
function is called; importing or using the read-only function does not require
`RAEGIS_ADMIN_SECRET`.

## Operational checklist

- Use `createReadOnlyClient` whenever no transaction must be signed.
- Load signer secrets at runtime from a protected server-side secret store.
- Never commit real `S...` values or expose them through browser-public env variables.
- Use full RPC URLs with an explicit scheme.
- Prefer named environment presets so the RPC endpoint and passphrase stay paired.
- Treat SDK role guards as defense in depth, not a replacement for on-chain authorization.
