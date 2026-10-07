# Aegis SDK threat model

This document describes the security boundary of the TypeScript SDK and the assumptions dashboard, automation, and integration authors should preserve when using it.

It is an engineering threat model, not legal, financial, regulatory, or compliance advice. Contract-side authorization and the deployment's own policies remain authoritative.

## Security boundaries

The SDK sits between application code and Stellar/Soroban services. It can narrow APIs, validate inputs, classify failures, and make unsafe states harder to express, but it cannot make a caller trustworthy or replace contract-side authorization.

Treat these as separate boundaries:

1. **Application boundary** — UI, dashboard, backend, or automation code decides what operation to request.
2. **SDK boundary** — Aegis constructs requests, applies client-side guards, and exposes typed results.
3. **Signer boundary** — a configured keypair or wallet authorizes a transaction.
4. **Network boundary** — RPC/Horizon/wallet responses are external inputs and may fail, lag, or disagree.
5. **Contract boundary** — the Soroban contract is the final authority for privileged state changes.

A client-side success signal must never be promoted into proof that a privileged on-chain operation is authorized.

## Secrets and signing material

A private key grants transaction-signing authority. Keep it out of logs, analytics payloads, URLs, browser storage, source control, screenshots, and error text.

Prefer the narrowest client factory that fits the use case:

- dashboards and indexers should use `createReadOnlyClient()` and avoid loading a signer at all;
- investor, issuer, compliance-operator, and admin clients should be created only inside components that actually need those capabilities;
- do not pass a privileged `.client` instance into lower-trust UI or plugin code merely for convenience.

The role-aware factory removes unavailable methods from the typed surface, but it is a guardrail rather than a security boundary. JavaScript callers can bypass TypeScript restrictions, and the underlying contract still decides whether a signed operation is permitted.

See [Role-Aware Client Factory](./role-aware-client-factory.md).

## Privileged and administrative actions

Admin, minting, transfer, and whitelist operations have different impact and should not share one broad "write-enabled" trust class.

Before a privileged action:

- use the role-specific client and the corresponding SDK guard where available;
- bind the action to the intended network, contract ID, signer, target address, asset, and amount before signing;
- surface the exact operation to the user or operator when interactive approval is expected;
- treat retries as new attempts unless the transaction or request is proven idempotent.

`assertAdminAccess()` and `assertWhitelistAccess()` are local sanity checks. They do not query the contract for proof of authority and must not replace contract-side rejection handling.

## Compliance and role-discovery assumptions

`RoleModule` is intended for dashboard gating and developer experience. Its capability results are predictions derived from available local and whitelist information, not contract-confirmed authorization.

In particular:

- `verified: false` is meaningful and should remain visible to callers;
- `unknown` or query failure must not be coerced to an authorized state;
- a configured signer only proves that the SDK can attempt a signed call, not that the contract will accept it;
- admin and issuer authority cannot currently be inferred solely from the role-discovery helper.

See [Role Discovery & Capability Checks](./role-discovery.md).

Protocol or SDK checks should not be described as legal or financial approval. Applications that need jurisdiction-specific controls require an independent policy layer.

## Transaction integrity

Treat transaction construction, simulation, signing, submission, and confirmation as distinct states.

Applications should validate network and contract configuration before creating an operation, avoid presenting simulation or local construction as submission, preserve transaction hashes and typed failures, and fail closed when a signed payload cannot be tied back to the intended operation.

Never reuse a signature or signed transaction across a different network, contract, operation, or materially changed payload.

## Network and RPC failure modes

RPC, Horizon, wallet transports, and indexers are external dependencies. They can return stale data, time out, reject requests, or become temporarily inconsistent.

For dashboard and automation code:

- distinguish **not found**, **not authorized**, **transport failure**, and **unknown** instead of flattening them into one boolean;
- retain freshness metadata where decisions depend on current chain state;
- retry only operations that are safe to repeat;
- do not silently fall back from a failed authoritative read to stale privileged state;
- assume a successful read can become stale before a later write.

A read-only dashboard can safely degrade to "unknown" more often than an administrative workflow. Privileged workflows should stop rather than infer permission from missing evidence.

## Dashboard-specific risks

Dashboards often aggregate portfolio, event, compliance, and role data from different times and sources. Mitigations include displaying freshness when recency matters, keeping "can attempt" distinct from "authorized on-chain", treating unknown event kinds as visible integration states, and scoping caches by network and contract ID.

## Logging and error handling

Do not log private keys or seed phrases, raw wallet credentials, or full signed transaction payloads outside an explicitly secured diagnostic workflow. Prefer typed error codes plus bounded, non-secret context, and treat upstream error messages as untrusted text.

## Integration checklist

- [ ] Use the least-privileged client factory.
- [ ] Keep signing material out of read-only components and logs.
- [ ] Pin the intended network and contract ID.
- [ ] Preserve the distinction between client-side capability hints and contract authorization.
- [ ] Handle `unknown`, transport failure, and stale data explicitly.
- [ ] Keep simulation, signing, submission, and confirmation states distinct.
- [ ] Ensure privileged retries are safe and intentional.
- [ ] Scope caches by network and contract.
- [ ] Review error/log output for secret or signed-payload leakage.
- [ ] Document application-specific legal/compliance controls separately from SDK behavior.

## Reporting security issues

Do not publish credentials, private transaction material, or exploit details in ordinary issue text. Provide the smallest reproducible description needed to identify the affected SDK boundary and follow the repository's private security-reporting path when one is available.
