# Aegis SDK architecture and security readiness review

**Review scope:** sponsor main at 69fff2c7e8c6fe801428fc1bb71d064c5c94949c  
**Review type:** architecture/security readiness; documentation only  
**Runtime verification:** not performed for this review. Findings below are source- and test-inventory observations, not claims of deployed behavior.

## Executive summary

The SDK has a useful foundation for typed reads, role-shaped client surfaces, event decoding, deterministic test doubles, environment validation, and redacted network diagnostics. Those pieces are suitable building blocks for dashboards and developer tooling.

The state-changing transaction path is **not production-ready yet**. AssetModule currently signs locally, constructs transactions with source sequence "0", skips simulation/preflight, submits directly, and returns the submission hash without finality tracking. The role-aware factories improve developer ergonomics but are not an authorization boundary because every factory exposes the underlying AegisClient as .client; contract authorization remains the final authority.

The read path is stronger but has important ambiguity for compliance and dashboards. An unsuccessful whitelist simulation returns false, which can make an operational failure look like a negative compliance result. Portfolio balance failures can collapse to a zero balance and static metadata, which can make unavailable data look like an empty portfolio. Those distinctions should be explicit before dashboard state is used for operational decisions.

### Readiness at a glance

| Area | Current readiness | Main reason |
|---|---|---|
| Configuration / network selection | **Partial** | HTTPS and mainnet opt-in are enforced, but named environment overrides can diverge from the preset and contract IDs are not validated at config resolution. |
| Read-only client / compliance | **Partial** | Network failures are typed, but unsuccessful simulation and true not-whitelisted state share the same boolean result. |
| Signer boundary | **High risk** | Raw .client escape hatch and public .keypair make role-shaped clients a convenience layer, not a security boundary. |
| Asset mint / transfer | **Not ready for production** | Hard-coded sequence, no preflight simulation, no inclusion/finality polling, generic errors, fixed fee. |
| Role discovery / capability checks | **Partial** | Honest client-side model, but cannot prove admin/issuer roles and mint_asset is only locally signer-gated. |
| Investor portfolio | **Partial** | Resilient UI model, but some RPC failures degrade to zero/default data and metadata is currently static. |
| Events / receipts | **Good foundation** | Typed decoder, unknown fallback, and serialisable receipts are useful; consumers still need cursor/finality/replay policy. |
| Network diagnostics | **Good foundation** | Stable safe messages and retryability classification avoid forwarding raw provider errors. |
| Public exports | **Partial** | Broad root export surface is convenient but has no explicit compatibility/governance gate in the current test inventory. |
| Dashboard integration | **Partial** | Good serialisable models exist, but degraded-vs-negative state and submission-vs-finality semantics must be preserved in UI. |

## 1. Client architecture

AegisClient owns the RPC server, contract ID, network passphrase, optional signing keypair, and module instances. This keeps composition simple, but read, write, configuration, and credential state live on one mutable object.

The role-aware factory in src/client-factory.ts creates narrower TypeScript surfaces for read-only, investor, compliance-operator, issuer, and admin callers. This is valuable as an API usability layer. It should be treated as **compile-time guidance only**:

- every role-aware client exposes the underlying AegisClient through public .client;
- signer-backed variants therefore expose the full underlying AssetModule, regardless of the narrowed role surface;
- capability assertions consult the static factory role matrix, not an authoritative on-chain role query;
- RoleModule explicitly documents that contract authorization is final.

**Recommendation:** preserve the convenient role-shaped API, but make the trust boundary explicit. If the factories are intended to provide a runtime boundary, remove or narrow the raw-client escape hatch for signer-backed clients and move signing behind an explicit signer/provider interface.

## 2. Signer and secret boundary

The current signer is an optional Stellar Keypair stored as public AegisClient.keypair. requireSigner() checks only whether that keypair exists. Browser wallet support is still a TODO.

Risks:

1. **Long-lived secret material.** A secret-bearing keypair can remain reachable from application code through the client object.
2. **No signer abstraction.** The write path assumes an in-process keypair rather than a wallet/HSM/provider capable of signing an envelope without disclosing secret material.
3. **Role bypass by raw client.** A role-shaped client can expose a signer-backed raw client, so investor/issuer/admin distinctions are not runtime security barriers.
4. **No transaction intent boundary.** There is no separate typed object representing the operation being authorized before it is signed.

Recommended follow-ups:

- track a signer boundary/provider abstraction (existing issue #7 is the natural home);
- complete wallet-provider support rather than adding more secret-key-only write APIs;
- ensure logs, diagnostics, and thrown errors never include secret material (issue #12);
- treat role factories as UI/DX policy unless and until on-chain roles can be verified.

## 3. Configuration and network identity

Strong current properties:

- named testnet, local, and mainnet presets exist;
- non-local plain HTTP RPC endpoints are rejected;
- mainnet is gated behind explicit allowMainnet;
- network failures can be normalized into safe typed codes.

Remaining risks:

- when a named environment is selected, rpcUrl and networkPassphrase may both be overridden independently; current main does not require an explicit passphrase override to match the named environment preset;
- contractId is checked for non-empty string only at config resolution, rather than validated as a contract StrKey;
- explicit/custom configuration permits arbitrary RPC/passphrase combinations by design, so callers need a clear responsibility boundary;
- there is no handshake that proves the configured contract is the expected Aegis deployment for the selected network.

**Recommendation:** make named presets fail closed on inconsistent identity while preserving a clearly documented custom-network mode. Existing network/config work such as #11 and compatibility work such as #58 should own those invariants.

## 4. Compliance semantics

ComplianceModule.checkWhitelist() is small and easy to consume, but its boolean API hides an important distinction:

- simulation success with decoded false means the contract reported not-whitelisted;
- an unsuccessful simulation result with no throw also returns false;
- thrown RPC/network failures pass through the SDK network-failure classifier.

For security-sensitive dashboards and transaction readiness, **negative compliance state must not be conflated with unavailable/indeterminate state**. A fail-closed UI may block both, but the reason must remain distinct for support, retry behavior, auditability, and policy.

Recommended API direction: a typed result such as approved / blocked / unknown / unavailable with stable reason codes, while retaining a convenience boolean only where loss of information is explicitly acceptable.

## 5. Asset mint and transfer path

This is the highest-priority readiness gap.

Current AssetModule.mint() and transfer():

- require a local keypair;
- construct a contract invocation;
- create a source Account using sequence "0";
- use a fixed fee of "1000";
- do not simulate/prepare the transaction before submission;
- sign locally;
- call sendTransaction() directly;
- return the submission hash immediately;
- wrap submission errors in generic Error strings.

The source itself already notes the sequence and simulation gaps.

Consequences:

- the transaction is not safe to treat as production-valid before real account sequence retrieval/preparation;
- authorization/whitelist failures are discovered late;
- a returned hash is **submission acknowledgement, not ledger finality**;
- callers cannot reliably distinguish compliance rejection, bad sequence, contract failure, timeout, and infrastructure failure by error type;
- string interpolation of raw errors bypasses the safer redacted network diagnostic path.

**P0 recommendation:** do not advertise mint/transfer as production-ready until sequence handling, simulation/preparation, typed failure mapping, and finality semantics are implemented and acceptance-tested. Existing issue #9 is the appropriate center for simulation/readiness; #10/#12 cover error/public safety concerns.

## 6. Role discovery and capability checks

The role subsystem is unusually explicit about its limitations, which is a strength.

Current observations:

- only investor, unauthorized, and unknown can be discovered;
- issuer/admin/compliance-operator roles cannot be proven from the contract today;
- mint_asset capability is locally considered permitted when a signer exists, while the result is marked unverified;
- transfer-related capability checks combine whitelist state and signer presence;
- the module states that contract authorization is final.

Dashboard consumers should display these values as **client-side capability hints**, never as proof of privileged role ownership. A UI should not show "admin verified" or "issuer verified" based on the static factory role.

## 7. Investor portfolio and dashboard data quality

InvestorModule intentionally favors a resilient read model, which is useful for dashboards. The current fallbacks can erase distinctions that matter operationally:

- compliance query failure returns an overall unavailable portfolio;
- an individual balance simulation exception is caught inside fetchAssetHolding() and converted to balanceRaw = "0";
- because that exception is consumed internally, the outer per-asset fallback may not mark the holding as query-failed;
- metadata is currently a static AEGIS-RWA / Aegis Tokenized Real Estate / 7 decimals / Real Estate object rather than contract-derived metadata;
- balance formatting truncates display precision to two decimal places.

This can make "RPC could not read the balance" look like "balance is zero," and "metadata unavailable" look like verified metadata.

**Dashboard recommendation:** preserve provenance and freshness. Each field used for decisions should carry enough status to distinguish verified, defaulted, stale, and unavailable data. Issue #44 should include this explicitly; asset metadata/readiness work (#51/#57) should avoid treating placeholders as authoritative.

## 8. Events, receipts, and observability

The event surface is a strong foundation:

- EventsModule wraps RPC event retrieval;
- the decoder can return typed Aegis events;
- strict/non-strict handling supports both validation and forward compatibility;
- unknown events remain representable rather than being silently treated as known;
- admin receipt helpers produce serialisable status/target/explorer data and reject invalid success receipts.

Remaining integration questions:

- define how consumers persist event cursors and resume after restarts;
- specify duplicate/replay handling and any reorg/finality assumptions;
- do not equate an admin receipt operation name with an authorization/execution API;
- preserve the raw event or enough source identifiers for later forensic reconciliation.

These are primarily dashboard/indexer integration concerns rather than blockers in the decoder itself.

## 9. Network failures and diagnostics

classifyNetworkFailure() and buildNetworkFailureDiagnostic() are positive examples for the rest of the SDK:

- raw messages are inspected for classification but not copied to support-facing messages;
- retryable codes are explicit;
- rate-limit retry hints can be retained;
- diagnostics are serialisable and suitable for UI/log output.

The gap is **coverage consistency**. Compliance calls use runNetworkOperation(), while asset submission wraps raw failures in generic strings. State-changing methods should converge on the same stable, redacted error boundary.

## 10. Public API and compatibility risks

The root src/index.ts exports the client, role-aware factories, modules, event helpers, diagnostics, config helpers, multiple error/type families, and low-level Soroban/XDR helpers.

Risks:

1. **Large compatibility surface.** Once consumers import a low-level helper from the root, changing its shape becomes a public breaking change.
2. **No explicit export governance test.** The current test inventory exercises behavior but does not visibly snapshot or approve the root export surface.
3. **Role surface versus raw surface.** Both narrowed factories and the unrestricted underlying client are public, so documentation must not imply security isolation.
4. **Testing subpath is deliberately public.** package.json exports ./testing; changes to mock behavior can break consumer tests even when runtime source is unchanged.
5. **Documentation drift exists.** The API reference generic error-handling strategy mentions transaction simulation as if it were a current write-path property, while AssetModule explicitly has a TODO for pre-submission simulation.

Issue #17 should define what constitutes an approved public export and how changes are reviewed. Package-level smoke/compatibility gates (#18/#58) should verify published entrypoints, not only source imports.

## 11. Missing test coverage

This review does not add tests because it changes no behavior. The current tests/ inventory has useful coverage for client construction, config presets, role/capability logic, investor reads, events, receipts, network classification, and mocks. The following high-value gaps remain visible from source and test inventory.

### P0 tests

- real write-path account-sequence acquisition/preparation;
- preflight simulation for mint/transfer;
- authorization/whitelist failure before signing/submission;
- submission hash versus confirmed-success/finality behavior;
- typed differentiation of bad sequence, auth failure, contract failure, timeout, and RPC outage;
- assurance that raw provider errors cannot leak credentials or sensitive request data.

### P1 tests

- compliance result distinguishes negative state from unavailable/indeterminate simulation;
- named-environment/network-passphrase mismatch is rejected;
- contract ID validation;
- raw-client escape-hatch behavior is explicitly documented/tested as non-authoritative;
- dashboard portfolio does not convert RPC read failure into an apparently verified zero balance;
- metadata provenance/defaulting is visible to consumers;
- package/root export compatibility and ./testing subpath smoke coverage.

### P2 tests

- event cursor resume, replay/duplicate policy, and strict/unknown upgrade compatibility;
- admin receipt/dashboard rendering across unknown/failure states;
- browser-wallet/provider signer integration when implemented.

## 12. Dashboard integration risks

A dashboard can use the SDK safely only if it preserves SDK uncertainty rather than flattening it.

Required UI distinctions:

- false compliance versus compliance unavailable;
- local role hint versus on-chain-authorized role;
- transaction submitted versus transaction confirmed/final;
- current portfolio value versus defaulted/unavailable value;
- known event versus unknown/new event;
- retryable network outage versus configuration failure;
- client-side capability flag versus contract-enforced permission.

Safe existing building blocks include NetworkFailureDiagnostic, typed contract events, role/capability result codes, and admin receipts. Unsafe assumptions include "mint capability means issuer authorization," "transaction hash means success," and "zero balance means a successful RPC read."

## 13. Prioritized follow-up work

| Priority | Follow-up | Why |
|---|---|---|
| **P0** | #9 — transaction simulation/readiness layer | Required before write operations can fail early and safely. |
| **P0** | #7 — signer boundary | Move secret-bearing/local signing behind a deliberate authorization boundary/provider abstraction. |
| **P0** | #10 + #12 — public error taxonomy and redaction | Make write/read failures stable, safe, and diagnosable without raw-error leakage. |
| **P0** | Asset sequence/finality work within the transaction-readiness track | Sequence "0" and submission-only semantics block production readiness. |
| **P1** | #11 — network configuration/registry hardening | Prevent named-environment identity mismatches and validate contract/network intent. |
| **P1** | #44 — dashboard integration readiness | Preserve degraded/unknown/provisional states through UI models. |
| **P1** | #17 — public API export governance | Bound the compatibility surface and require deliberate export changes. |
| **P1** | #51/#57 — asset readiness and metadata validation | Remove placeholder/assumed asset state from decision-grade flows. |
| **P1** | Compliance typed-state follow-up | Separate blocked, unknown, and unavailable instead of collapsing to boolean. |
| **P2** | #18/#58 — package smoke + compatibility matrix | Verify built/published entrypoints and supported runtimes. |
| **P2** | #22 — threat model | Record attacker assumptions around signers, RPC providers, dashboards, raw-client escape hatches, and contract authority. |

## 14. Release-readiness gate

Before calling the SDK production-ready for state-changing RWA operations, require all of the following:

- [ ] source account sequence/preparation uses live network state;
- [ ] write operations simulate/preflight before signing/submission;
- [ ] signer/provider boundary does not require exposing long-lived secret material to application code;
- [ ] role/capability UX cannot be mistaken for on-chain authorization;
- [ ] compliance APIs preserve blocked versus unknown/unavailable;
- [ ] write failures use stable, redacted typed errors;
- [ ] transaction lifecycle distinguishes submitted, pending, failed, and confirmed/final;
- [ ] dashboard models preserve provenance, freshness, and degraded states;
- [ ] asset metadata/balance fallbacks cannot masquerade as verified data;
- [ ] root/package export compatibility has an explicit gate;
- [ ] P0 write-path and security regressions are covered by focused automated tests;
- [ ] deployment/network assumptions are documented for the actual target Aegis contract.

## 15. What is ready to build on now

The review is intentionally not a blanket "not ready" conclusion. The following are solid foundations for continued work:

- explicit environment presets with HTTPS/mainnet guardrails;
- role-shaped TypeScript client surfaces with candid source comments about authority;
- deterministic mock client/test fixtures;
- network failure classification and support-safe diagnostics;
- typed contract-event decoding with unknown fallback;
- serialisable admin receipts;
- portfolio/read models designed for dashboard consumption;
- documented test, review, and acceptance-traceability processes.

The fastest path to production readiness is to keep those foundations and close the write-path/authentication/data-provenance gaps rather than adding more surface area first.

## Acceptance-criteria traceability

| # | Acceptance criterion | Evidence in this review |
|---|---|---|
| 1 | Architecture readiness review is added. | Sections 1–14 and readiness matrix. |
| 2 | Security gaps are identified. | Signer/raw-client boundary, configuration identity, compliance ambiguity, raw-error/write-path risks. |
| 3 | Missing test coverage is listed. | Section 11, prioritized P0/P1/P2. |
| 4 | Public API risks are documented. | Section 10. |
| 5 | Dashboard integration risks are included. | Sections 7, 8, and 12. |
| 6 | High-priority follow-up issues are recommended. | Section 13. |
