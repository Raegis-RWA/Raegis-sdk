# Operation permission matrix

The Aegis SDK's role-aware clients provide a **typed operation surface** for common
read and write workflows. This matrix documents what each declared client role exposes
and, just as importantly, what that exposure does **not** prove.

> **Security boundary:** a role-aware client is a developer-experience and type-safety
> aid. It is not an on-chain authorization oracle. The Aegis contract remains the final
> authority on whether a submitted transaction is permitted.

## Declared-role operation matrix

| SDK operation / surface | `read-only` | `investor` | `compliance-operator` | `issuer` | `admin` |
| --- | :---: | :---: | :---: | :---: | :---: |
| `compliance.checkWhitelist()` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `investor.getPortfolio()` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `events.decode()` / `events.fetchAndDecode()` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `role_module.discoverRole()` / capability checks | ✓ | ✓ | ✓ | ✓ | ✓ |
| `asset.transfer()` | — | ✓ | ✓ | ✓ | ✓ |
| `asset.mint()` | — | — | — | ✓ | ✓ |
| `assertWhitelistAccess()` | — | — | ✓ | — | ✓ |
| `assertAdminAccess()` | — | — | — | — | ✓ |
| Raw `.client: AegisClient` escape hatch | ✓ | ✓ | ✓ | ✓ | ✓ |

The table is derived from the current factories in `src/client-factory.ts`, not from
a contract role query. `getRoleCapabilities(role)` exposes the corresponding static
capability flags for UI and tooling.

### Important current limitations

- **The raw `.client` property is intentionally exposed.** It returns the underlying
  `AegisClient`, whose modules are broader than the narrowed role surface. A caller
  can intentionally step outside the typed matrix. For example, an `investor` client
  does not expose `asset.mint`, but `investor.client.asset.mint` exists. Treat the
  factory as compile-time intent and guardrails, not as a security sandbox.
- A `read-only` client's raw `.client` has no keypair, so transaction submission
  fails the SDK signer requirement. Signer-bearing roles do not get that protection
  merely from the declared role.
- `assertWhitelistAccess()` and `assertAdminAccess()` validate the **declared SDK
  role flags only**. They do not query the contract and do not prove that the signer
  actually has the corresponding on-chain authority.
- The current `ComplianceModule` exposes `checkWhitelist()` only. The
  compliance-operator role therefore provides the whitelist-access intent guard but
  does not add a whitelist mutation method to the typed surface today.
- `checkWhitelist()` fails closed: it returns `false` both when the contract
  reports a negative whitelist result and when simulation is unsuccessful or has no
  result payload. Treat bare `false` as **approval not established**, not as proof of
  an explicit denial. UI or audit copy should distinguish "not whitelisted" from
  "query unavailable" only when separate error-aware evidence supports that wording.
- Admin receipt operation names such as `whitelist-add`, `asset-register`, and
  `protocol-pause` describe typed receipt/audit data. `buildAdminActionReceipt()`
  does not execute those operations or grant permission to perform them.
- `RoleModule.discoverRole()` currently discovers only `investor`,
  `unauthorized`, or `unknown` from whitelist status. It cannot discover
  `admin`, `issuer`, or `compliance-operator` because the protocol exposes no
  role-query function for the SDK to call.

## Capability flags

The role factory currently publishes these static flags:

| Declared role | Read | Sign | Transfer | Mint | Manage whitelist | Administer |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| `read-only` | ✓ | — | — | — | — | — |
| `investor` | ✓ | ✓ | ✓ | — | — | — |
| `compliance-operator` | ✓ | ✓ | ✓ | — | ✓ | — |
| `issuer` | ✓ | ✓ | ✓ | ✓ | — | — |
| `admin` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

A capability flag means the SDK factory is willing to expose or guard that class of
operation for the declared role. It does not mean the address was authenticated as
that role on-chain.

## Decision sequence for state-changing calls

For a state-changing operation, use the matrix as a pre-flight aid rather than an
authorization decision:

1. Construct the narrowest role-aware client that matches the caller's intended job.
2. Confirm the required typed operation or explicit role guard is present.
3. Perform any SDK-level prerequisite checks (for example whitelist eligibility).
4. Simulate or submit through the normal SDK transaction path.
5. Treat contract rejection as authoritative; do not override it because the SDK
   capability matrix said an operation was available.
6. Record transaction outcome separately from the declared client role.

For UI gating, prefer hiding operations that the declared role does not expose, while
still handling contract rejection when an operation is attempted.

## Failure and edge-case expectations

| Situation | Expected SDK behavior |
| --- | --- |
| Read-only client attempts a transaction through raw `.client` | Fails signer requirement because no keypair is configured. |
| Investor tries `asset.mint` on the typed surface | Method is absent at compile time/runtime surface. |
| Investor intentionally calls `.client.asset.mint` | Bypasses the typed surface; contract authorization remains authoritative. |
| Compliance-operator calls `assertWhitelistAccess()` | SDK declared-role guard passes; no on-chain role verification occurs. |
| `checkWhitelist()` returns `false` | Approval is not established; the current boolean API also uses `false` for unsuccessful or result-less simulation, so explicit denial vs query unavailability requires separate error-aware evidence. |
| Issuer calls `assertAdminAccess()` | Method is not exposed by the typed issuer interface. |
| `RoleModule` is asked whether an address is an issuer/admin | It cannot make that determination today; only whitelist-derived roles are discoverable. |
| Contract rejects a transaction that the matrix exposes | Contract result wins; the matrix is not an authorization guarantee. |

## Contributor checklist

When adding or changing a role-aware operation:

- update `ROLE_CAPABILITIES` and the relevant typed interface/factory together;
- keep the raw-`.client` escape-hatch caveat explicit if it remains public;
- document whether the operation is merely exposed, guarded locally, simulated, or
  actually contract-authorized;
- do not infer admin/issuer authority from local keypair presence;
- add a focused regression for the changed role surface or guard;
- update this matrix and the [Role-Aware Client Factory](role-aware-client-factory.md)
  guide in the same pull request.

See also [Role Discovery](role-discovery.md), which documents the separate
whitelist-derived capability checks and their limitations.
