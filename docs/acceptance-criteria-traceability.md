# Acceptance Criteria Traceability Table

## Status
**Applies to:** Aegis SDK (`@aegis/sdk`)
**Last updated:** 2026-07-29

---

## Purpose

A traceability table maps every acceptance criterion from an issue to concrete deliverables in the pull request — SDK modules, tests, documentation, and verified behaviours. This makes evaluation straightforward for maintainers and GrantFox reviewers.

---

## Table Format

Every PR addressing a tracked issue **should** include a traceability table in the PR description (or in a linked document) with the following columns:

| # | Acceptance Criterion | SDK Module(s) | Test(s) | Doc(s) | Behaviour Verification |
|---|---|---|---|---|---|
| 1 | _Criterion from issue_ | `src/module.ts` | `tests/module.test.ts` | `docs/module.md` | How the behaviour is observed |

### Column Guidance

| Column | Content |
|---|---|
| **#** | Criterion number from the issue. |
| **Acceptance Criterion** | Verbatim text of the criterion as written in the issue. |
| **SDK Module(s)** | File path(s) to the source module(s) that implement the criterion. Use code-relative paths (e.g. `src/compliance.ts`). |
| **Test(s)** | File path(s) to the test(s) that cover the criterion. Use code-relative paths (e.g. `tests/client.test.ts`). |
| **Doc(s)** | File path(s) to the documentation that describes or references the criterion (e.g. `docs/api-reference.md`). |
| **Behaviour Verification** | A short statement describing how a reviewer can confirm the behaviour — a test assertion, a console log, a public API return type, etc. |

---

## SDK Module Map

Below is the complete map of every public SDK module. Reference this when completing the "SDK Module(s)" column of the traceability table.

| Module | File | Public Exports | Description |
|---|---|---|---|
| Client | `src/client.ts` | `AegisClient` | Top-level SDK client; initializes RPC, configures modules, provides `runNetworkOperation()` |
| Compliance | `src/compliance.ts` | `ComplianceModule` | Queries the Aegis Soroban contract for KYC/whitelist status |
| Compliance Batch | `src/compliance/batch.ts` | `ComplianceModule.checkWhitelistBatch` | Validates and queries multiple whitelist states with bounded concurrency and partial-failure isolation |
| Compliance Diagnostics | `src/diagnostics/compliance.ts` | `buildComplianceBatchDiagnostic` | Builds address-free batch failure roll-ups |
| Asset | `src/asset.ts` | `AssetModule` | Submits mint and transfer transactions to the Soroban contract |
| Role Discovery | `src/role.ts` | `RoleModule` | Client-side role classification and capability gating |
| Admin Receipts | `src/admin/receipts.ts` | `normalizeAdminActionStatus`, `buildAdminTransactionExplorerUrl`, `buildAdminActionReceipt` | Builds serializable admin action receipts |
| Environment Config | `src/config/environments.ts` | `AEGIS_ENVIRONMENTS`, `getEnvironmentPreset` | Environment presets (testnet, local, mainnet) |
| Config Validation | `src/config/validate.ts` | `resolveClientConfig`, `AegisClientConfig` | Validates and resolves client configuration |
| Event Decoder | `src/events/decoder.ts` | `decodeContractEvent`, `decodeContractEvents` | Decodes Soroban contract events into typed models |
| Events Module | `src/events/module.ts` | `EventsModule` | Wraps RPC `getEvents` with fetch + decode |
| Event Topics | `src/events/topics.ts` | `AEGIS_EVENT_TOPICS`, `normalizeEventTopicName`, `isKnownAegisEventTopic` | Canonical event topic constants and utilities |
| Investor Portfolio | `src/investor/portfolio.ts` | `InvestorModule` | Queries investor portfolio read model (balances, KYC, metadata) |
| Network Failures | `src/network/failures.ts` | `classifyNetworkFailure` | Classifies RPC/network errors into `NetworkFailure` |
| Network Diagnostics | `src/diagnostics/network.ts` | `buildNetworkFailureDiagnostic` | Converts failures into serializable diagnostics |
| ScVal Decoding | `src/soroban/scval.ts` | `decodeScVal`, `decodeEventName`, `normalizeAddress`, `normalizeAmount`, `readPayloadField` | Low-level Soroban XDR ScVal utilities |
| XDR Parser | `src/utils/xdr-parser.ts` | `parseSorobanResult` | Decodes base64 Soroban XDR results |
| Mock Client (Testing) | `src/testing/mock-client.ts` | `MockAegisClient`, `createMockAegisClient` | In-memory mock client for unit tests |
| Test Fixtures | `src/testing/fixtures.ts` | `createMockFixtures`, `MOCK_CONTRACT_ID`, `DEFAULT_MOCK_ASSET_METADATA` | Deterministic test fixtures |

---

## Test Map

Reference this when completing the "Test(s)" column.

| Test File | Covers |
|---|---|
| `tests/client.test.ts` | Client configuration, module instantiation, signer requirements |
| `tests/compliance-batch.test.ts` | Batch validation, ordering, concurrency, partial failures, rate limits, safe diagnostics |
| `tests/config.test.ts` | Environment presets, config validation, error cases |
| `tests/role.test.ts` | Role discovery, capability checks, capability matrix |
| `tests/investor.test.ts` | Portfolio fetching, balance calculations, status mapping |
| `tests/admin-receipts.test.ts` | Action receipt building, status normalization, explorer URLs |
| `tests/events-decoder.test.ts` | Event decoding, strict mode, unknown event fallback |
| `tests/events-module.test.ts` | RPC event fetching, cursor pagination |
| `tests/network-failures.test.ts` | Error classification, retryable detection |
| `tests/mock-client.test.ts` | Mock client behaviour, whitelist/balance control |
| `tests/mock-client-examples.test.ts` | End-to-end integration examples with mock client |

---

## Documentation Map

Reference this when completing the "Doc(s)" column.

| Document | Content |
|---|---|
| `docs/api-reference.md` | Full API reference for all public modules |
| `docs/compliance-batch-queries.md` | Batch compliance usage, performance, rate limits, diagnostics, and security |
| `docs/testing.md` | Mock client setup and testing patterns |
| `docs/contract-events.md` | Event decoder usage and supported topics |
| `docs/role-discovery.md` | Role discovery and capability gating |
| `docs/investor-portfolio.md` | Investor portfolio read model |
| `docs/admin-action-receipts.md` | Admin action receipt types and building |
| `docs/environments.md` | Environment presets and configuration |
| `docs/network-failures.md` | Network failure classification and diagnostics |
| `docs/pr-evidence-checklist.md` | PR evidence checklist (this is merged into) |
| `docs/reviewer-checklist.md` | Reviewer checklist for PR evaluation |
| `docs/verification.md` | Verification commands and troubleshooting |
| `docs/runtime-compatibility.md` | Cross-environment compatibility matrix |
| `docs/ci-resolution-workflow.md` | CI failure reproduction and resolution |
| `docs/release-checklist.md` | Release process and versioning steps |
| `docs/migration-guide.md` | Breaking changes and upgrade paths |
| `docs/contributor-evaluation-policy.md` | Contributor evaluation guidelines |
| `docs/self-review-template.md` | Self-review checklist for contributors |
| `docs/low-effort-pr-examples.md` | Examples of well-structured PRs |

---

## Example: Implementing a Feature Issue

Suppose an issue requires adding a **new capability check** to the Role Discovery module:

| # | Acceptance Criterion | SDK Module(s) | Test(s) | Doc(s) | Behaviour Verification |
|---|---|---|---|---|---|
| 1 | `RoleModule.checkCapability()` returns `isPermitted: boolean` | `src/role.ts` | `tests/role.test.ts` | `docs/role-discovery.md`, `docs/api-reference.md` | `expect(result.isPermitted).toBe(true)` |
| 2 | Capability matrix includes all 4 capabilities | `src/role.ts`, `src/types/role.ts` | `tests/role.test.ts` | `docs/role-discovery.md` | `matrix.capabilities` array has length 4 |
| 3 | Invalid address throws `RoleError` | `src/role.ts`, `src/errors/role.ts` | `tests/role.test.ts` | `docs/api-reference.md` | Test expects `RoleError` with code `invalid_address` |
| 4 | Mock client supports capability checks | `src/testing/mock-client.ts` | `tests/mock-client.test.ts` | `docs/testing.md` | `mockClient.role.checkCapability()` resolves |

---

## Example: Documentation-only Issue

For a documentation issue like this one (#88), the table maps documents and templates:

| # | Acceptance Criterion | SDK Module(s) | Test(s) | Doc(s) | Behaviour Verification |
|---|---|---|---|---|---|
| 1 | Traceability table is documented | — | — | `docs/acceptance-criteria-traceability.md` | Document exists and defines the table format |
| 2 | SDK modules are mapped | — | — | `docs/acceptance-criteria-traceability.md` | Module map table is complete and accurate |
| 3 | Tests are mapped | — | — | `docs/acceptance-criteria-traceability.md` | Test map table lists all test files and their coverage |
| 4 | Docs are mapped | — | — | `docs/acceptance-criteria-traceability.md` | Documentation map table lists all doc files and content |
| 5 | PR template references table | — | — | `.github/PULL_REQUEST_TEMPLATE.md` | Section 6 references the traceability table |
| 6 | README links to docs | — | — | `README.md` | README contains a link to the traceability document |

---

## Usage in the PR Template

When opening a PR, follow these steps:

1. Copy the traceability table template from this document.
2. Fill in each row with the relevant SDK module(s), test(s), doc(s), and behavioural verification for each criterion in the linked issue.
3. Paste the completed table into Section 6 of the PR template.
4. Check off each criterion in the checklist.

The PR template's Section 6 now reads:

> ### 6. Acceptance Criteria Coverage — Traceability Table
>
> Copy the acceptance criteria from the linked issue into the table below and
> map each to SDK modules, tests, docs, and behaviour verification.
> See [`docs/acceptance-criteria-traceability.md`](./acceptance-criteria-traceability.md) for the table format, SDK module map, test map, and documentation map.

---

## Related Documentation

- [Pull Request Template](../.github/PULL_REQUEST_TEMPLATE.md) — PR description structure with traceability table section.
- [PR Evidence Checklist](./pr-evidence-checklist.md) — Detailed guidance on each checklist item.
- [Reviewer Checklist](./reviewer-checklist.md) — Criteria reviewers use to evaluate PRs.
- [Contributing Guide](../CONTRIBUTING.md) — Development workflow and code style.
