# Test-First Contribution Guide

## Status

**Applies to:** Aegis SDK (`@aegis/sdk`)
**Last updated:** 2026-07-29

---

## Purpose

Every code contribution to the Aegis SDK must include tests that prove the
change works correctly. This guide defines **when** tests are required, **what
type** of tests are expected per module, and **how** to structure them so
reviewers can verify behavior quickly.

This is a test-first methodology guide. For mock client setup, import paths,
and fixture details, see [`docs/testing.md`](./testing.md).

---

## When Tests Are Required

Tests are required for **every code change that affects SDK behavior**. This
includes:

| Change type | Tests required? |
|---|---|
| New public method or exported function | **Yes** |
| Modified method behavior or return type | **Yes** |
| New error type or throw path | **Yes** |
| New configuration option or environment preset | **Yes** |
| Bug fix for a reported issue | **Yes** (regression test) |
| Refactor with unchanged public API | **Yes** (existing tests must still pass) |
| Documentation-only change (`.md` files, JSDoc comments) | No |
| CI/CD configuration change (workflow YAML, templates) | No |
| Non-functional metadata change (`package.json` keywords, `.gitignore`) | No |
| Adding or modifying a `// TODO` comment | No |

If your change does not require tests, state the justification in the PR
template's collapsible tests section. Reviewers evaluate whether the
justification is valid.

---

## Test Expectations by Module

Each module in the Aegis SDK has specific testing expectations. Every test
file must cover **happy-path** and **negative-path** scenarios.

### Compliance Checks

Tests for `ComplianceModule` methods (`checkWhitelist`, `checkWhitelistBatch`) must cover:

| Scenario | Expectation |
|---|---|
| Whitelisted address | Returns `true` |
| Non-whitelisted address | Returns `false` |
| RPC failure / timeout | Throws or returns fallback (module-dependent) |
| Invalid address (empty string) | Returns `false` or typed error |
| Mixed valid and invalid batch input | Preserves order; invalid items do not reach RPC |
| Partial batch RPC failure | Successful items remain resolved; failure is safe per-item |
| Batch concurrency / duplicates | Configured bound is honored; default deduplication avoids duplicate RPC work |
| Batch rate limiting | Safe diagnostic recommends backoff without exposing addresses or raw errors |

```typescript
// Happy-path: whitelisted investor
client.setWhitelisted(fixtures.investorAddress, true);
await expect(
  client.compliance.checkWhitelist(fixtures.investorAddress)
).resolves.toBe(true);

// Negative-path: non-whitelisted investor
await expect(
  client.compliance.checkWhitelist(fixtures.secondaryInvestorAddress)
).resolves.toBe(false);

// Negative-path: compliance failure simulation
const failingClient = createMockAegisClient({ simulateComplianceFailure: true });
await expect(
  failingClient.compliance.checkWhitelist(fixtures.investorAddress)
).rejects.toThrow('Mock compliance RPC failure.');
```

### RWA Metadata

Tests for asset metadata (contract IDs, symbol, decimals, category) must cover:

| Scenario | Expectation |
|---|---|
| Default metadata on a new mock client | Matches `DEFAULT_MOCK_ASSET_METADATA` |
| Overridden metadata via `setAssetMetadata` | Returns overridden values |
| Multi-asset portfolios | Each holding reports correct metadata per contract ID |
| Missing metadata for unknown contract ID | Returns fallback defaults |

```typescript
// Happy-path: default metadata
const portfolio = await client.investor.getPortfolio(fixtures.investorAddress);
expect(portfolio.holdings[0].assetId).toBe(MOCK_CONTRACT_ID);

// Happy-path: multiple assets with distinct metadata
client.setBalance(fixtures.investorAddress, '1000000000', MOCK_CONTRACT_ID);
client.setBalance(fixtures.investorAddress, '2000000000', MOCK_SECONDARY_CONTRACT_ID);
const multiPortfolio = await client.investor.getPortfolio(fixtures.investorAddress, {
  assetContractIds: [MOCK_CONTRACT_ID, MOCK_SECONDARY_CONTRACT_ID],
});
expect(multiPortfolio.totalHoldingsCount).toBe(2);
```

### Admin Actions

Tests for admin operations (mint, whitelist, pause, unpause, asset registration)
must cover:

| Scenario | Expectation |
|---|---|
| Successful action with tx hash | Receipt with `status: 'success'`, explorer URL, summary |
| Pending action without tx hash | Receipt with `status: 'pending'`, `transactionHash: null` |
| Failed action with failure code | Receipt with `status: 'failed'`, failure code preserved |
| Unknown RPC status | Normalizes to `'pending'`, `'failed'`, or `'unknown'` |
| Successful receipt missing a tx hash | Throws `AdminReceiptError` with code `MISSING_TRANSACTION_HASH` |
| Malformed tx hash | Throws `AdminReceiptError` |
| Insecure custom explorer URL (http) | Throws `AdminReceiptError` with code `INVALID_EXPLORER_URL` |
| Non-positive mint amount | Throws `AdminReceiptError` with code `INVALID_AMOUNT` |
| Copy of sensitive fields (secrets, raw RPC) | Receipt must NOT expose `secret` or `rawRpcResponse` |

```typescript
// Happy-path: confirmed whitelist receipt
const receipt = buildAdminActionReceipt({
  operation: 'whitelist-add',
  target: { address: 'GADMINRECIPIENT' },
  status: 'SUCCESS',
  transactionHash: HASH,
  networkPassphrase: Networks.PUBLIC,
  observedAt: '2026-07-28T09:00:00.000Z',
});
expect(receipt.status).toBe('success');
expect(receipt.explorerUrl).toContain('stellar.expert');

// Negative-path: missing hash on successful receipt
expect(() =>
  buildAdminActionReceipt({
    operation: 'protocol-unpause',
    target: { contractId: 'CAEGIS' },
    status: 'SUCCESS',
    networkPassphrase: Networks.TESTNET,
  })
).toThrow(expect.objectContaining({ code: 'MISSING_TRANSACTION_HASH' }));

// Negative-path: sensitive fields excluded
expect(receipt).not.toHaveProperty('secret');
expect(receipt).not.toHaveProperty('rawRpcResponse');
```

### Investor Reads (Portfolio)

Tests for `InvestorModule.getPortfolio` must cover all four portfolio states:

| State | Condition | Key assertions |
|---|---|---|
| `active` | Whitelisted + positive balance | `status: 'active'`, `isKycApproved: true`, `transferEligibility.isEligible: true` |
| `empty` | Whitelisted + zero balance | `status: 'empty'`, `transferEligibility.code: 'ZERO_BALANCE'` |
| `blocked` | Not whitelisted + any balance | `status: 'blocked'`, `isKycApproved: false`, `transferEligibility.code: 'NOT_WHITELISTED'` |
| `unavailable` | RPC failure or invalid address | `status: 'unavailable'`, error message set |

```typescript
// Happy-path: active portfolio
client.setWhitelisted(fixtures.investorAddress, true);
client.setBalance(fixtures.investorAddress, '5000000000');
const portfolio = await client.investor.getPortfolio(fixtures.investorAddress);
expect(portfolio.status).toBe('active');
expect(portfolio.holdings[0].formattedBalance).toBe('500.00');

// Negative-path: blocked portfolio
client.setBalance(fixtures.investorAddress, '1000000000');
const blocked = await client.investor.getPortfolio(fixtures.investorAddress);
expect(blocked.status).toBe('blocked');
expect(blocked.holdings[0].transferEligibility.code).toBe('NOT_WHITELISTED');

// Negative-path: unavailable (RPC failure)
const failingClient = createMockAegisClient({ simulateComplianceFailure: true });
const unavailable = await failingClient.investor.getPortfolio(fixtures.investorAddress);
expect(unavailable.status).toBe('unavailable');
expect(unavailable.error).toContain('Compliance status query failed');

// Negative-path: invalid address
const invalid = await client.investor.getPortfolio('');
expect(invalid.status).toBe('unavailable');
expect(invalid.error).toContain('Invalid investor address');
```

### Transaction Receipts

Tests for transaction receipts must cover:

| Scenario | Expectation |
|---|---|
| Mint operation | Recorded in `client.transactions` with type, from, to, amount |
| Transfer operation | Balances updated for both parties; receipt push |
| Transfer with sender not whitelisted | Throws with message |
| Transfer with recipient not whitelisted | Throws with message |
| Write without signer | Throws `Transaction signing requires a Keypair` |
| `reset()` | Clears `client.transactions` and resets all state |

```typescript
// Happy-path: mint records receipt
const hash = await client.asset.mint(fixtures.investorAddress, 1000);
expect(client.transactions).toHaveLength(1);
expect(client.transactions[0]).toMatchObject({
  type: 'mint',
  to: fixtures.investorAddress,
  amount: 1000,
});

// Negative-path: transfer with non-whitelisted party
await expect(
  client.asset.transfer(fixtures.secondaryInvestorAddress, 100)
).rejects.toThrow('sender is not whitelisted');

// Negative-path: missing signer
const noSigner = createMockAegisClient();
await expect(
  noSigner.asset.mint(fixtures.investorAddress, 100)
).rejects.toThrow('Transaction signing requires a Keypair');
```

### Typed SDK Errors

Tests for typed errors (`NetworkFailure`, `AdminReceiptError`, `EventDecodeError`,
`ConfigValidationError`, `PortfolioError`) must cover:

| Scenario | Expectation |
|---|---|
| Error instance check | `expect(failure).toBeInstanceOf(NetworkFailure)` |
| Error code matches expected | `expect(failure.code).toBe('TIMEOUT')` |
| Error message is safe (no secrets) | `expect(failure.message).not.toContain('secret')` |
| Serializable without raw causes | `JSON.stringify(failure).not.toContain('secret')` |
| `retryable` flag set correctly | `expect(failure.retryable).toBe(true)` or `false` |

```typescript
// Happy-path: error classification
const failure = classifyNetworkFailure({
  code: 'ETIMEDOUT',
  message: 'Request to https://rpc.example/?token=secret-value timed out',
});
expect(failure).toBeInstanceOf(NetworkFailure);
expect(failure.code).toBe('TIMEOUT');
expect(failure.retryable).toBe(true);

// Negative-path: secrets not leaked
expect(failure.message).not.toContain('secret-value');
expect(JSON.stringify(failure)).not.toContain('secret-value');
```

### Contract Event Decoding

Tests for `decodeContractEvent` and related utilities must cover:

| Scenario | Expectation |
|---|---|
| Known topic (whitelist_add, mint, transfer, etc.) | Correct `kind` and fields |
| Unknown topic | `kind: 'unknown'` with reason |
| Unknown topic in strict mode | Throws `EventDecodeError` |
| Malformed value payload | `kind: 'unknown'` with decode reason |
| Batch decoding | Events decoded in order, all kinds correct |
| Envelope metadata | `contractId`, `txHash`, `ledger`, `decodedAt` preserved |

```typescript
// Happy-path: known topic
const decoded = decodeContractEvent(contractEventFixtures.mint());
expect(decoded.kind).toBe('mint');

// Negative-path: unknown topic
const unknown = decodeContractEvent(contractEventFixtures.unknownTopic());
expect(unknown.kind).toBe('unknown');

// Negative-path: strict mode
expect(() =>
  decodeContractEvent(contractEventFixtures.unknownTopic(), { strict: true })
).toThrow(EventDecodeError);
```

### Configuration and Environment Presets

Tests for `AegisClient` configuration must cover:

| Scenario | Expectation |
|---|---|
| Valid preset (`testnet`, `local`) | Client initializes with correct passphrase |
| `mainnet` without `allowMainnet` | Throws `ConfigValidationError` |
| `mainnet` with `allowMainnet: true` | Client initializes with `Networks.PUBLIC` |
| Custom `rpcUrl` override (https) | Client uses custom URL |
| Insecure `rpcUrl` override (http) | Throws `ConfigValidationError` |
| Malformed `rpcUrl` | Throws `ConfigValidationError` |
| Missing `contractId` | Throws `ConfigValidationError` |
| Unknown environment name | Throws `ConfigValidationError` |

---

## Happy-Path and Negative-Path Requirements

Every test file must include both happy-path and negative-path tests. The
reviewer checklist enforces this (see [`docs/reviewer-checklist.md`](./reviewer-checklist.md),
Section 2: "Edge Cases & Failure Paths").

**Happy-path tests** confirm the feature works under expected conditions:
valid inputs, authenticated clients, successful RPC responses.

**Negative-path tests** confirm the feature fails safely under adverse
conditions: network failures, invalid inputs, unauthorized callers, missing
configuration.

A PR missing negative-path coverage for new or modified behavior will be
returned for revision.

---

## No-Test Justification Rules

If you believe your change does not require tests, you must:

1. State the justification in the PR template's collapsible tests section.
2. Explain **why** the change cannot break SDK behavior.
3. Confirm that existing tests still pass (`npm test`).

**Valid justifications:**

- Documentation-only change (Markdown files, JSDoc comments, README updates).
- CI/CD workflow change (` .github/workflows/*.yml`, template files).
- Non-functional metadata change (`package.json` keywords, `.gitignore`,
  `.npmignore`).
- Typo fix in a comment that does not affect generated documentation.

**Invalid justifications:**

- "The change is small." — Small changes can still introduce bugs.
- "I tested it manually." — Manual testing does not prevent regressions.
- "No existing tests cover this module." — New modules need new tests.
- "It's a refactor." — Refactors must not break existing tests.

Reviewers will reject PRs with invalid no-test justifications.

---

## Local Test Commands

Run tests before opening a PR. All commands must pass with zero errors.

```bash
# Run the full unit test suite
npm test

# Run a single test file (faster feedback loop)
npm test -- tests/investor.test.ts

# Run tests matching a pattern
npm test -- -t "Portfolio"

# Build + lint + test + browser/Node compatibility (full release gate)
npm run check

# Pre-submit verification (lint, format, build, test, compat)
npm run verify
```

If you see a test failure, fix it locally before pushing. CI will run the same
suite and a red build blocks review.

---

## Mock Client vs. RPC Mocks

The Aegis SDK provides two testing approaches. Choose the right one for your
change:

| Approach | When to use | Example test file |
|---|---|---|
| `@aegis/sdk/testing` mock client | Dashboard UIs, portfolio snapshots, receipt assertions, compliance state tests | `tests/mock-client.test.ts` |
| Jest mocks on `@stellar/stellar-sdk` | Testing production RPC wiring, Soroban response parsing, `xdr.ScVal` decoding | `tests/investor.test.ts` |

For detailed mock client API reference (state helpers, fixtures, simulating
failures), see [`docs/testing.md`](./testing.md).

---

## Test File Checklist

Before marking tests as complete, verify:

- [ ] Test file is in `tests/` with a `.test.ts` extension.
- [ ] Uses `Keypair.random()` for addresses — no hardcoded secrets.
- [ ] Uses `jest.clearAllMocks()` in `beforeEach` when mocking.
- [ ] Happy-path test exists for every new or modified public method.
- [ ] Negative-path test exists for every new error throw path.
- [ ] Error messages and serialized output do not leak secrets or raw RPC
  payloads.
- [ ] `reset()` behavior is tested if state mutations are introduced.
- [ ] All existing tests continue to pass (`npm test`).

---

## Enforcement

- **Contributors** must include tests per this guide before requesting review.
- **Reviewers** verify test coverage using [`docs/reviewer-checklist.md`](./reviewer-checklist.md)
  Section 2.
- **Maintainers** will not merge PRs that skip tests without a valid
  justification.

---

## Related Documentation

- [Testing Utilities](./testing.md) — mock client setup, fixture API, fake data policy.
- [PR Evidence Checklist](./pr-evidence-checklist.md) — test evidence requirements for PR submissions.
- [Reviewer Checklist](./reviewer-checklist.md) — what reviewers verify for unit tests and coverage.
- [Contributing Guide](../CONTRIBUTING.md) — development workflow, branching, and code style.
