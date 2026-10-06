# Dashboard integration readiness review

This review defines the integration contract between a dashboard and the **current**
Aegis SDK. It is intended for maintainers who are wiring portfolio, compliance,
transaction, event, and operational state into a user-facing dashboard.

It is a readiness checklist, not a new authorization layer. Protocol-level
compliance signals must not be presented as legal, regulatory, investment, or
financial advice.

## Current readiness summary

The SDK is ready for a dashboard that:

- uses public SDK entrypoints rather than internal imports;
- treats portfolio, compliance, role, event, receipt, and network results as
  separate state domains instead of collapsing them into one success/error flag;
- keeps read-only and signer-capable clients separate;
- treats SDK role/capability results as UI guidance rather than on-chain
  authorization;
- renders unknown/unavailable states explicitly;
- uses event cursors and timestamps as freshness evidence rather than assuming
  data is current;
- keeps raw secrets, signatures, RPC payloads, and arbitrary error text out of
  support-facing views.

The largest integration risk is semantic, not structural: the dashboard must
preserve the distinction between **what the SDK could determine**, **what a local
client is configured to attempt**, and **what the contract ultimately permits**.

## Public integration seams

Prefer the package root exports from `@aegis/sdk`. Dashboard code should not
reach into `src/` or depend on internal file layout.

| Dashboard concern | Current SDK seam | Integration note |
| --- | --- | --- |
| Client construction | `AegisClient`, role-aware factory functions | Prefer the narrowest client role for the feature |
| Compliance status | `ComplianceModule.checkWhitelist()` | Boolean read; `true` establishes whitelist approval, while `false` is fail-closed and ambiguous without separate error-aware evidence |
| Portfolio | `InvestorModule.getPortfolio()` | Returns a typed read model with `status`, holdings, compliance state, `fetchedAt`, and safe fallback states |
| UI capability hints | `RoleModule.discoverRole()`, `checkCapability()`, `getCapabilityMatrix()` | Advisory only; `verified` remains false for capability checks |
| Contract activity | `EventsModule.fetchAndDecode()` | Preserve `latestLedger` and cursor so freshness/pagination are visible |
| Admin/action receipts | `buildAdminActionReceipt()` and explorer helpers | Serialisable UI-facing receipt; unknown is intentionally fail-closed |
| Network failures | `NetworkFailure`, `buildNetworkFailureDiagnostic()` | Stable safe code/message/retry guidance without exposing raw errors |
| Environment/configuration | `resolveClientConfig()`, environment presets | Invalid/unavailable environment states should block affected actions |
| Runtime compatibility | package compatibility gate | Node is signer-capable; browser is read-only until an explicit wallet adapter exists |

## Read versus write boundary

### Read-only dashboard processes

A dashboard process that only needs portfolio, compliance, event, or role
information should use `createReadOnlyClient()`.

Read-only construction intentionally accepts no keypair. This reduces the impact
of accidental write paths and prevents a dashboard server or browser bundle from
quietly becoming a signing context.

Suitable read-only UI includes:

- portfolio summaries;
- compliance/whitelist status;
- contract activity/history;
- role/capability hints;
- network health and support diagnostics.

### Signer-capable flows

Use a signer-capable role factory only for an interaction that intentionally
needs a transaction signer.

Current typed role surfaces are:

| Declared client role | Current write surface |
| --- | --- |
| `investor` | transfer |
| `compliance-operator` | transfer + local whitelist capability guard |
| `issuer` | transfer + mint |
| `admin` | full current asset module + local admin/whitelist guards |

The declared role is an SDK capability boundary, not proof of an on-chain role.
The contract remains authoritative.

For the current signer/permission model, use the existing
[Role-Aware Client Factory](./role-aware-client-factory.md) and
[Role Discovery](./role-discovery.md) documents. They define the public
role/capability boundary available on this branch; dashboard integration should
not depend on guidance that is only present in another pending change.

## Dashboard state model

Do not reduce every SDK result to a Boolean. Preserve the state carried by each
module.

### Portfolio

`InvestorModule.getPortfolio()` returns:

- `active` when holdings are available and at least one active holding exists;
- `empty` when the read succeeded but there are no active holdings;
- `blocked` when the address is not KYC/whitelist approved;
- `unavailable` when the SDK cannot obtain a trustworthy portfolio result.

The model also includes `fetchedAt`. Dashboards should display or retain this
timestamp and avoid representing an unavailable result as an empty portfolio.

Individual holding reads can degrade while the rest of the portfolio remains
usable. A holding with a failed asset query can carry a safe fallback instead of
making the entire dashboard unusable. The UI should preserve that distinction.

### Compliance

`checkWhitelist()` is currently a Boolean read query. A `true` result establishes
that the protocol query returned a whitelisted result. A `false` result is
fail-closed but ambiguous: it can mean a negative whitelist result, or that the
simulation failed or returned no usable result.

With only this API result, safe dashboard copy is:

- `true`: "address is whitelisted by the protocol";
- `false`: "protocol whitelist approval is not established".

Only show a more specific "not whitelisted" or "status unavailable" state when
separate error-aware evidence distinguishes those cases.

Avoid copy such as "legally compliant", "approved investment", or "KYC verified
for all purposes" unless an external system supplies and owns that meaning.

### Role and capability

Role discovery can currently distinguish:

- `investor`;
- `unauthorized`;
- `unknown`.

It cannot currently discover on-chain `issuer` or `admin` roles because the
contract exposes no role query used by the SDK.

Capability checks have `verified: false`. A dashboard may use them to decide
whether to show or disable an action, but should still handle contract rejection
after the action is submitted.

### Events

`EventsModule.fetchAndDecode()` exposes:

- `latestLedger`;
- decoded events;
- the cursor of the last returned event, when present.

Treat `latestLedger` and cursor as data-provenance fields. The dashboard should
not label an event stream "live" solely because a fetch returned successfully.

When polling or paginating:

1. retain the last accepted cursor;
2. avoid inserting the same decoded event twice;
3. do not advance the visible checkpoint when a fetch fails;
4. surface lag/staleness separately from an empty event page.

## Failure-state UX

The dashboard should distinguish at least these failure domains.

| Failure domain | Example SDK evidence | Recommended UI behaviour |
| --- | --- | --- |
| Configuration | `ConfigValidationError` / unavailable environment | Block affected feature and show configuration guidance |
| Missing signer | `requireSigner()` failure or signer-capable role not configured | Disable submit; do not call it a contract rejection |
| Local role guard | `RoleCapabilityError` | Treat as application/client configuration mismatch |
| Protocol state | whitelist false, portfolio blocked, capability not permitted | Explain the protocol state without legal conclusions |
| Contract rejection | failed simulation/submission | Treat as authoritative for that attempted transaction |
| Network timeout/unavailable | `NetworkFailure` | Preserve prior data with stale indicator where safe; offer retry |
| Rate limited | `RATE_LIMITED`, optional retry-after | Back off; avoid burst retry loops |
| Malformed response | `MALFORMED_RESPONSE` | Do not render partial data as trustworthy |
| Unknown network failure | `UNKNOWN` | Fail closed and provide safe support guidance |
| Unknown transaction outcome | receipt `unknown` | Never display as success |

### Retry semantics

`buildNetworkFailureDiagnostic()` maps stable network failure codes to recovery
actions:

- timeout -> retry;
- RPC unavailable -> retry with backoff;
- rate limited -> retry with backoff;
- invalid network passphrase -> check configuration;
- malformed response -> inspect RPC response/integration;
- unknown -> report unknown.

A dashboard should centralise those policies rather than having each component
invent its own retry loop.

## Receipt and confirmation handling

`buildAdminActionReceipt()` deliberately accepts a narrow input model and omits
raw RPC responses, signatures, secrets, and arbitrary metadata.

It normalises action status to:

- `success`;
- `pending`;
- `failed`;
- `unknown`.

Important rules for UI code:

- success requires a valid transaction hash;
- an unrecognised source status becomes `unknown`, not success;
- explorer links are network-aware;
- custom explorer bases must use HTTPS;
- failure codes are constrained to safe identifier characters.

The dashboard should render `pending` and `unknown` as distinct states. Neither
is equivalent to a failed transaction, and neither should be promoted to success.

## Security-sensitive assumptions

### Secrets and browser code

The supported browser model is read-only today. Do not embed a Stellar secret key
in a browser bundle.

The SDK compatibility guide explicitly reserves browser signing for a reviewed
wallet adapter once one is configured. Until then, a dashboard requiring signing
should keep that operation in an approved signer boundary rather than shipping a
secret to the client.

### Raw errors and support data

The network diagnostic layer intentionally strips raw error messages from
serialisable support output. Dashboard logging should preserve that property.

Do not add UI telemetry that serialises:

- secret keys;
- signatures;
- raw transaction payloads unless explicitly required and scrubbed;
- authorization headers;
- arbitrary RPC error bodies;
- personally identifying compliance evidence.

### Protocol compliance versus legal status

Whitelist state and SDK capability results are protocol facts. They do not by
themselves establish legal, regulatory, investor-suitability, sanctions, tax, or
financial-advice conclusions.

Any dashboard feature that needs those conclusions must obtain them from the
system responsible for them and label the source.

## Freshness and cache guidance

Each dashboard read should have an explicit freshness policy.

Recommended minimums:

- retain `fetchedAt` from portfolio results;
- retain `latestLedger` and cursor from event results;
- timestamp compliance/role reads at the application boundary if the SDK result
  does not carry its own timestamp;
- invalidate or visibly stale a view after network failure rather than replacing
  it with fabricated empty data;
- never reuse an old capability result as proof that a later transaction is
  permitted.

A stale-but-last-known view may be useful for operations, but it must be visually
distinguishable from a fresh successful read.

## Integration review checklist

Before marking a dashboard integration ready, confirm all applicable items.

### Imports and runtime

- [ ] The dashboard imports only public `@aegis/sdk` entrypoints.
- [ ] The target runtime matches the supported runtime guidance.
- [ ] Browser code contains no secret key.
- [ ] A signer-capable boundary is explicit and reviewed when writes are needed.
- [ ] Environment, RPC URL, network passphrase, and contract ID are validated.

### Read models

- [ ] Portfolio `active`, `empty`, `blocked`, and `unavailable` states are distinct.
- [ ] Partial holding failures are not presented as zero-value confirmed data.
- [ ] Portfolio `fetchedAt` is retained or surfaced.
- [ ] A bare `checkWhitelist()` false is rendered as approval-not-established; "not whitelisted" versus "unavailable" is shown only with separate error-aware evidence.
- [ ] Role/capability results are labelled as advisory UI gating.

### Events and activity

- [ ] `latestLedger` is retained.
- [ ] Event cursor progression is monotonic for the consumer.
- [ ] Duplicate events are de-duplicated by a stable application strategy.
- [ ] Failed fetches do not silently advance the visible checkpoint.
- [ ] Stale event state is distinguishable from an empty result.

### Transactions and permissions

- [ ] The narrowest role-aware client is used for each write flow.
- [ ] Missing signer, local role guard failure, and contract rejection have
      different UI states.
- [ ] Capability checks are never treated as contract authorization.
- [ ] Pending/unknown transaction outcomes are not displayed as success.
- [ ] Explorer links are built from the network-aware receipt helper when used.

### Error and retry behaviour

- [ ] Stable network failure codes drive retry policy.
- [ ] Rate-limit handling uses backoff and respects retry-after when present.
- [ ] Retry loops are bounded by the application.
- [ ] Last-known data is marked stale instead of silently discarded where that
      behaviour is safe.
- [ ] Raw provider errors are not copied into user-facing or support-safe output.

### Compliance and security wording

- [ ] Protocol whitelist state is not described as legal or investment approval.
- [ ] Secrets/signatures/raw sensitive payloads are excluded from dashboard logs.
- [ ] Unknown or unavailable evidence fails closed.
- [ ] Any external legal/compliance conclusion identifies its owning source.

## Suggested integration sequence

A low-risk dashboard rollout can proceed in this order:

1. Build a read-only client and configuration health check.
2. Add portfolio and compliance views with explicit unavailable/stale states.
3. Add event history with ledger/cursor provenance.
4. Add role/capability hints for UI gating, clearly marked advisory.
5. Add network diagnostics and central retry/backoff policy.
6. Add transaction receipts and pending/unknown handling.
7. Only then introduce a separately reviewed signer-capable flow.

This sequence keeps the read model and operational semantics observable before
the dashboard is allowed to submit state-changing transactions.

## When the integration is not ready

Do not call a dashboard integration ready if any of the following are true:

- it embeds a signing secret in browser code;
- it turns a bare `checkWhitelist()` false into a specific "not whitelisted" or
  "query unavailable" claim without separate error-aware evidence;
- it uses SDK role discovery as proof of admin/issuer authority;
- it treats a successful local capability guard as contract authorization;
- it maps unknown transaction status to success;
- it loses event cursor/ledger provenance while claiming a live activity view;
- it exposes raw provider errors or sensitive transaction material in support UI;
- it presents protocol whitelist state as legal, financial, or investment advice.

The SDK already provides the core typed seams needed to avoid these failure
modes. Dashboard readiness therefore depends on preserving those semantics at
the application boundary rather than adding a parallel authorization model.
