# Local development configuration

Typed helpers for running the Aegis SDK against a **local Stellar standalone /
Quickstart** network. This is for developer machines and CI sandboxes — not a
substitute for testnet integration testing.

> **Compliance note:** Local whitelist / KYC behaviour reflects whatever the
> locally deployed Aegis contract reports. It is protocol-level test data only
> and is **not** legal, financial, or regulatory compliance advice.

## Why this exists

`environment: 'local'` alone only fills `rpcUrl` and `networkPassphrase`. Local
work also needs:

* a **deployed contract ID** (no safe default)
* **loopback enforcement** so plain `http://` cannot silently point at a remote host
* optional **env-based** loading for `.env` / CI secrets injection
* a **readiness probe** that says “start Docker” instead of “retry with backoff”

## Quickstart

```bash
# Optional: start Quickstart (Soroban RPC on :8000)
npm run local:up

# Copy env template and set your deployed contract ID
cp .env.example .env
```

```typescript
import { createLocalClient, checkLocalNetwork } from '@aegis/sdk';
import { Keypair } from '@stellar/stellar-sdk';

const client = createLocalClient({
  contractId: process.env.AEGIS_CONTRACT_ID!,
  // Or inject the whole map explicitly (preferred in tests / browsers):
  env: process.env,
  keypair: Keypair.random(), // ephemeral local signer only
});

const health = await checkLocalNetwork(client);
if (health.status !== 'ready') {
  console.error(health.message, health.hint);
}
```

`resolveLocalConfig` / `createLocalClient` never read `process.env` at module
scope. Pass `env: process.env` (Node) or individual fields when you want env
overrides — this keeps the browser bundle free of Node globals.

## Defaults

| Field | Default |
| --- | --- |
| `rpcUrl` | `http://localhost:8000/soroban/rpc` |
| `networkPassphrase` | `Networks.STANDALONE` (`Standalone Network ; February 2017`) |
| `horizonUrl` | `http://localhost:8000` |
| `friendbotUrl` | `http://localhost:8000/friendbot` |
| `contractId` | **required** — no default |

Constants: `LOCAL_DEV_DEFAULTS`, `LOCAL_ENV_KEYS`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `AEGIS_CONTRACT_ID` | StrKey contract ID from your local deploy |
| `AEGIS_LOCAL_RPC_URL` | Override RPC URL |
| `AEGIS_LOCAL_NETWORK_PASSPHRASE` | Override passphrase (rarely needed) |
| `AEGIS_LOCAL_HORIZON_URL` | Horizon / Quickstart root |
| `AEGIS_LOCAL_FRIENDBOT_URL` | Friendbot URL for funding accounts |
| `AEGIS_LOCAL_SECRET_KEY` | Optional signer seed (`S...`) — ephemeral keys only |

Precedence per field: **explicit option → env → default**.

Whitespace-only values are treated as unset.

## Loopback / local-host policy

Plain `http://` RPC URLs are accepted only when the host is:

* loopback — `localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0`
* or Docker Desktop’s `host.docker.internal` (SDK container → host Quickstart)

Anything else throws `LocalConfigError` with code `NON_LOOPBACK_RPC_URL` unless
you pass `allowNonLoopbackRpc: true` (trusted private networks only).

This is **enforcement**, not a soft warning. Generic
`new AegisClient({ environment: 'local', rpcUrl: 'http://remote...' })` still
goes through `resolveClientConfig` and does not apply this guard — use
`createLocalClient` / `resolveLocalConfig` for local workflows.

## Readiness probe

```typescript
const health = await checkLocalNetwork({
  contractId: process.env.AEGIS_CONTRACT_ID!,
  env: process.env,
});

// health.status: 'ready' | 'unavailable' | 'misconfigured'
```

| Status | Meaning | Typical hint |
| --- | --- | --- |
| `ready` | `getHealth` succeeded; passphrase matches when available | — |
| `unavailable` | Connection refused / timeout on local RPC | `npm run local:up` |
| `misconfigured` | Reachable but wrong passphrase / unexpected RPC error | Check `--local` / RPC path |

A refused connection is **not** marked retryable — restarting a stopped
container requires operator action, not backoff.

## Edge cases and failure codes

| Code | When |
| --- | --- |
| `MISSING_CONTRACT_ID` | No `contractId` option and no `AEGIS_CONTRACT_ID` |
| `INVALID_CONTRACT_ID` | Value is not a StrKey contract ID (e.g. `"C..."`) |
| `INVALID_RPC_URL` | Unparseable or non-http(s) URL |
| `NON_LOOPBACK_RPC_URL` | Insecure remote http without opt-in |
| `INVALID_SECRET_KEY` | `AEGIS_LOCAL_SECRET_KEY` / `secretKey` is not a valid seed |
| `INVALID_NETWORK_PASSPHRASE` | Empty passphrase override |
| `LOCAL_NETWORK_UNAVAILABLE` | Reserved for thrown readiness failures (probe returns status instead) |
| `LOCAL_NETWORK_MISCONFIGURED` | Reserved for thrown readiness failures (probe returns status instead) |

Errors never echo secret keys or credential-bearing URL userinfo.

## Security assumptions

1. **Local keys are disposable.** Generate with `Keypair.random()`. Never reuse
   testnet/mainnet secrets in `.env`.
2. **`.env` is not committed.** See `.env.example` and `.gitignore`.
3. **HTTP is loopback-scoped** via `resolveLocalConfig`. Do not disable that
   guard to point at public infrastructure.
4. **Friendbot / Horizon URLs** in defaults are public local endpoints — they
   are not production funding rails.
5. **Do not `JSON.stringify` a `ResolvedLocalDevConfig` that includes a
   `keypair`** into GitHub issues — Keypair objects can serialise seed bytes.
   Share `checkLocalNetwork` output or redact first.

## Docker Compose

```bash
npm run local:up    # docker compose -f docker-compose.local.yml up -d
npm run local:down
```

The compose file pins the documented Quickstart image and publishes port
`8000`. After it is healthy, deploy the Aegis contract with `stellar-cli`
against the standalone network, then set `AEGIS_CONTRACT_ID`.

> Image tags move. For shared CI, pin a digest in your fork’s compose override.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `status: 'unavailable'` | Container not running / wrong port | `npm run local:up`, check `:8000` |
| Passphrase mismatch | Quickstart not started with `--local` | Recreate the container from `docker-compose.local.yml` |
| HTTP 404 from RPC | Path differs across Quickstart versions | Try `/rpc` vs `/soroban/rpc` via `AEGIS_LOCAL_RPC_URL` |
| Unfunded account | Need Friendbot | `GET {friendbotUrl}?addr=G...` |
| `NON_LOOPBACK_RPC_URL` | Remote http URL | Use localhost or set `allowNonLoopbackRpc: true` deliberately |

## Reviewer checklist

- [ ] Local helpers live in `src/config/local.ts` (not ad-hoc in examples).
- [ ] Loopback / `host.docker.internal` policy is enforced by default.
- [ ] Missing contract ID fails with a typed error and deploy hint.
- [ ] Secret keys never appear in error messages or returned plain fields.
- [ ] Tests cover precedence, rejection matrix, and readiness-unavailable.
- [ ] Docs state that local compliance checks are not legal advice.
- [ ] README / `docs/environments.md` link here.
- [ ] Change stays compatible with `environment: 'local'` on `AegisClient`.

## Related

* [Environment presets](./environments.md)
* [Network failures](./network-failures.md)
* [Testing utilities](./testing.md)
* [API reference](./api-reference.md)
