# Public API compatibility matrix

This matrix defines the compatibility review surface for the published `@aegis/sdk`
package. It is a cross-repository coordination aid for SDK, Soroban contract, and
Raegis Dashboard changes; it does not replace contract-side authorization or the
module-specific API reference.

The package currently publishes two entry points:

- `@aegis/sdk` — the production API exported by `src/index.ts`.
- `@aegis/sdk/testing` — test helpers and fixtures for consumer test suites.

Files under `src/**` that are not reachable through those entry points are internal
implementation details and are not part of the compatibility contract.

## Compatibility levels

| Level | Meaning |
| --- | --- |
| **Public** | Exported production API. Patch releases should remain source-compatible for documented consumers. |
| **Contract-coupled** | Public API whose behavior or data shape depends on a Soroban method, event catalogue, or Stellar RPC response. Contract and SDK changes must be reviewed together. |
| **Testing** | Published through `@aegis/sdk/testing` for fixtures/mocks. It is not a production runtime surface, but consumers may still rely on its test contracts. |

## Public surface matrix

| Public surface | Level | Protocol / RPC dependency | Dashboard review targets |
| --- | --- | --- | --- |
| `AegisClient`, `AegisClientConfig` | Public | Owns network, contract ID, signer, and module wiring; behavior is inherited from the modules below. | App bootstrap, wallet/network configuration, all SDK-backed features. |
| `createReadOnlyClient`, `createInvestorClient`, `createComplianceOperatorClient`, `createIssuerClient`, `createAdminClient`, role-client types, `getRoleCapabilities` | Public | No new contract method. Narrows access to underlying modules and local signer/capability policy. | Route access, feature gating, admin/issuer/investor entry points. |
| `ComplianceModule.checkWhitelist()` | Contract-coupled | Calls `is_whitelisted` and evaluates the result through Soroban RPC simulation. | Compliance status, onboarding eligibility, compliance review, transfer eligibility. |
| `AssetModule.mint()` | Contract-coupled | Calls `mint_asset`, builds/signs a transaction, then submits it through Soroban RPC. | RWA minting workflow, transaction review/progress, receipts. |
| `AssetModule.transfer()` | Contract-coupled | Calls `transfer`, builds/signs a transaction, then submits it through Soroban RPC. | Investor transfer flow, transaction review/progress, receipts. |
| `InvestorModule.getPortfolio()`, portfolio types/errors | Contract-coupled | Reuses whitelist status and simulates each asset contract's `balance` call. Current metadata fallback is SDK-local rather than a metadata contract read. | Investor portfolio, balance display, transfer eligibility. |
| `RoleModule.discoverRole()`, `checkCapability()`, `getCapabilityMatrix()`, role types/errors | Contract-coupled | There is no contract role-query method today. Role discovery reuses `is_whitelisted`; capability checks also use local signer state and SDK policy. | Route access and capability/CTA gating. Never treat this surface as on-chain authorization. |
| `EventsModule`, `decodeContractEvent(s)`, `AEGIS_EVENT_TOPICS`, topic helpers, contract-event types/errors | Contract-coupled | `EventsModule.fetchAndDecode()` uses RPC `getEvents`; decoding is coupled to the Aegis event topic/payload catalogue. Unknown events intentionally retain a safe fallback. | Audit/activity feeds, compliance/admin timelines, asset catalogue refresh. |
| `buildAdminActionReceipt()`, `buildAdminTransactionExplorerUrl()`, `normalizeAdminActionStatus()`, admin-receipt types | Public | No contract call. Depends on transaction status/hash semantics and network-to-explorer mapping. | Admin action receipts and transaction-result presentation. |
| `resolveClientConfig()`, `AEGIS_ENVIRONMENTS`, `getEnvironmentPreset()`, configuration types/errors | Public | No contract method. Defines RPC URL, network passphrase, contract ID, and mainnet-safety configuration. | Environment selection, bootstrap, network mismatch handling. |
| `classifyNetworkFailure()`, `buildNetworkFailureDiagnostic()`, network diagnostic/types/errors | Public | Coupled to observable RPC/network failure shapes, not to a specific contract method. | Diagnostics, support/error presentation, retry guidance. |
| `decodeScVal()`, `decodeEventName()`, `parseSorobanResult()` | Contract-coupled | Low-level helpers coupled to Soroban ScVal/XDR and contract return/event encodings. | Advanced integrations, indexers, and any dashboard adapter that consumes raw RPC data. |
| Re-exported portfolio, role, config, network, event, client-factory, and related error types | Public | Follow the compatibility level of the API that produces or consumes them. | TypeScript consumer compilation across the corresponding dashboard features. |
| `@aegis/sdk/testing` | Testing | No production contract promise. Fixtures/mocks must track the public shapes they model. | Dashboard and integration tests that intentionally import the testing subpath. |

The canonical production export list remains `src/index.ts`. When that file changes,
update this matrix in the same pull request if the new export is intended to be public.

## Contract dependency map

The SDK currently has these direct or indirect protocol dependencies:

| SDK behavior | Contract / network dependency | Compatibility consequence |
| --- | --- | --- |
| Whitelist reads | `is_whitelisted(address)` | Method name, argument encoding, and boolean result semantics must remain compatible with `ComplianceModule`. |
| Mint submission | `mint_asset(signer_public_key, to, amount)` | Method name, argument encoding, authorization behavior, and amount semantics affect `AssetModule.mint()`. |
| Transfer submission | `transfer(signer_public_key, to, amount)` | Method name, argument encoding, authorization/whitelist behavior, and amount semantics affect `AssetModule.transfer()`. |
| Portfolio balance reads | `balance(address)` on each configured asset contract | Result encoding and balance units affect `InvestorModule` and dashboard formatting. |
| Role discovery/capabilities | Indirect `is_whitelisted` plus local signer/capability policy | Adding real contract role queries would change the trust model and requires coordinated SDK/dashboard migration. |
| Event reads/decoding | Soroban RPC `getEvents` plus Aegis event topics/payloads | Additive unknown topics degrade to the documented `unknown` fallback; typed use requires decoder/type updates. |
| XDR/ScVal helpers | Stellar/Soroban value encodings | Changes to contract return/event encoding can break low-level consumers even when TypeScript signatures do not change. |

A contract deployment that renames one of these methods, changes an argument/result
encoding, or changes a known event payload is a compatibility change even if
`src/index.ts` is untouched.

## Raegis Dashboard consumers

The companion [Raegis Dashboard](https://github.com/Raegis-RWA/Raegis-dashboard)
is the primary cross-repository consumer to review when changing the SDK. The
following dashboard areas are compatibility targets, not a claim that every page
imports every symbol directly:

- `docs/compliance-status-panel.md` and
  `docs/investor-onboarding-eligibility.md` — whitelist/compliance reads.
- `docs/investor-transfer-eligibility.md` — portfolio and transfer eligibility.
- `docs/rwa-asset-minting-workflow.md` — issuer/admin minting behavior.
- `docs/transaction-review-modal.md` and
  `docs/admin-action-receipts.md` — transaction intent, status, hash, and receipt
  presentation.
- `docs/route-access.md` — role-aware client and capability gating.

When a compatibility-significant SDK change lands, check the corresponding dashboard
area before release. Cross-repository changes should state the rollout order and any
temporary compatibility window.

## Breaking-change rules

The package is currently `0.1.x`. Until 1.0, an intentional incompatible public
change requires a new **minor** version (for example, `0.1.x -> 0.2.0`) plus a
migration note; patch releases remain backward-compatible. At 1.0 and later, use
standard semantic-versioning major releases for incompatible public changes.

Treat each of the following as compatibility-significant:

- removing or renaming a public export, method, field, role, environment, or error code;
- adding a new required parameter or making an optional field required;
- changing a return value, discriminant, error category, transaction-status meaning,
  or documented failure behavior;
- removing a role capability or exposing a privileged capability to a narrower role;
- changing a contract method name, argument/result encoding, event topic, or known
  event payload consumed by the SDK;
- changing package export paths;
- adding a discriminated-union member when downstream exhaustive switches may need an
  update, even though the change is additive at runtime.

Normally compatible changes include new optional fields, new standalone exports, and
new helpers whose addition does not alter existing behavior. They still require a
matrix update when they become part of the intended public surface.

## Coordinated change checklist

For any compatibility-significant change:

1. Identify the affected row in this matrix and the exact contract/RPC dependency.
2. Preserve backward decoding or an additive compatibility path where practical.
3. Update SDK public types, API documentation, and focused tests together.
4. Review the named Raegis Dashboard consumer area and record any required dashboard
   change or explicitly state that no consumer change is needed.
5. If the contract changes, document deployment/SDK/dashboard rollout order; avoid a
   window where the published SDK expects a protocol shape that is not deployed.
6. Run the SDK release gate (`npm run check`) for source changes. Documentation-only
   edits do not require a synthetic runtime test; validate links and source references
   instead.
7. Record the versioning and migration impact in the pull request and release notes.

Related references: [API Reference](./api-reference.md),
[Role-Aware Client Factory](./role-aware-client-factory.md),
[Contract Event Decoder](./contract-events.md), and
[Runtime Compatibility](./runtime-compatibility.md).
