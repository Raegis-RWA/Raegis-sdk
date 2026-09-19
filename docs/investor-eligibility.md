# Investor eligibility explanation

Dashboards often need more than a boolean whitelist result. A bare `false`
cannot tell a user whether they were never approved, whether KYC was revoked,
or whether the compliance query simply failed. The eligibility mapper turns
observable SDK signals into a stable UI explanation with a reason code, a safe
message, and a suggested next action.

## Important: what this is, and is not

Every explanation is a **dashboard UX convenience**. It is derived from
SDK-observable compliance signals (primarily
`ComplianceModule.checkWhitelist()`), optional revoke hints from other sources,
and address validation.

It is **not**:

- legal, financial, or regulatory advice
- a guarantee that a transfer, mint, or other action will succeed
- a substitute for simulating/submitting the actual transaction

The Aegis Soroban contract remains the final authority. Every
`InvestorEligibilityExplanation` carries a fixed `disclaimer` field so this
non-guarantee language cannot be dropped accidentally when serialising for UI
or support tooling. `verified` is always `false` today for the same reason
capability checks leave it false — the SDK is reporting an observable signal,
not a simulated on-chain guarantee.

## Status model

| Status        | Meaning                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `approved`    | Address appears on the protocol whitelist.                              |
| `blocked`     | Address is not on the whitelist (never approved, or unknown why).       |
| `revoked`     | Previously granted standing appears revoked.                            |
| `unknown`     | Signals were insufficient or unrecognised. Outcome is indeterminate.    |
| `unavailable` | Eligibility could not be evaluated (bad address or compliance failure). |

### `blocked` vs `revoked`

`ComplianceModule.checkWhitelist()` returns only a boolean today. A bare
`false` therefore maps to **`blocked`**, not `revoked` — the SDK cannot tell
"never approved" from "previously approved then revoked" from that signal
alone.

Use `revoked` only when another source can confirm a revoke, for example:

- an admin `whitelist-remove` receipt
- a decoded `whitelist_remove` contract event
- an off-chain KYC / compliance system

Pass `isKycRevoked: true` (or `status: 'revoked'`) into the mapper in those
cases.

## Reason codes and next actions

| Code                      | Typical status  | Suggested `nextAction`           |
| ------------------------- | --------------- | -------------------------------- |
| `WHITELISTED`             | `approved`      | `none`                           |
| `NOT_WHITELISTED`         | `blocked`       | `complete-kyc`                   |
| `KYC_REVOKED`             | `revoked`       | `contact-compliance`             |
| `COMPLIANCE_QUERY_FAILED` | `unavailable`   | `retry-with-backoff`             |
| `INVALID_ADDRESS`         | `unavailable`   | `verify-address`                 |
| `INSUFFICIENT_DATA`       | `unknown`       | `inspect-compliance-response`    |
| `UNRECOGNIZED_STATUS`     | `unknown`       | `inspect-compliance-response`    |

`nextAction` is a UI CTA hint, not a legal instruction. Dashboards should map
it to their own flows (open KYC wizard, show support contact, retry button).

## Pure mapper (no RPC)

```typescript
import {
  buildInvestorEligibilityExplanation,
  explainWhitelistResult,
} from '@aegis/sdk';

const approved = explainWhitelistResult(true, { address: 'G...' });
// status: 'approved', code: 'WHITELISTED'

const blocked = explainWhitelistResult(false, { address: 'G...' });
// status: 'blocked', code: 'NOT_WHITELISTED' — not revoked

const revoked = buildInvestorEligibilityExplanation({
  address: 'G...',
  isKycRevoked: true,
});
// status: 'revoked', code: 'KYC_REVOKED'
```

Mapping priority when multiple signals are present:

1. `invalidAddress`
2. `complianceQueryFailed`
3. `isKycRevoked`
4. explicit `status`
5. `isKycApproved`
6. otherwise `unknown` / `INSUFFICIENT_DATA`

## Live compliance integration

```typescript
const explanation = await client.investor.explainEligibility('G...');

switch (explanation.status) {
  case 'approved':
    showInvestorHome(explanation);
    break;
  case 'blocked':
    showKycPrompt(explanation.nextAction); // 'complete-kyc'
    break;
  case 'revoked':
    showComplianceContact(explanation);
    break;
  case 'unavailable':
  case 'unknown':
    showRetryOrSupport(explanation);
    break;
}

// Always surface the disclaimer in support tooling / advanced UI.
console.log(explanation.disclaimer);
```

When a portfolio or role result is already loaded, map without another RPC
round trip:

```typescript
const explanation = client.investor.explainEligibilityFromSignals({
  address: portfolio.investorAddress,
  isKycApproved: portfolio.isKycApproved,
  // Set only when a revoke is independently confirmed:
  // isKycRevoked: true,
});
```

## Dashboard usage guidance

- Gate **what to show** with `status` / `code` / `nextAction`. Never use the
  explanation alone to decide what to **submit** — still simulate/submit through
  `AssetModule` and handle rejection.
- Show `message` as user-facing copy. It is fixed and safe; it never includes
  raw RPC payloads, URLs, or credentials.
- Keep `disclaimer` visible in support panels, tooltips, or footer copy so the
  non-guarantee language travels with the result.
- Treat `verified: false` as intentional. Do not invent a "verified" badge from
  this API.
- Prefer `code` over string-matching `message` when branching in UI logic.
- Pair with [role discovery](./role-discovery.md) for capability gating and with
  [investor portfolio](./investor-portfolio.md) for holdings context. Eligibility
  explains whitelist standing; portfolio status (`active` / `empty` / `blocked`)
  explains holdings.

## Contributor review checklist

When changing eligibility behaviour:

- [ ] All five statuses (`approved`, `blocked`, `revoked`, `unknown`,
      `unavailable`) remain representable.
- [ ] A bare whitelist `false` still maps to `blocked`, not `revoked`.
- [ ] Unrecognised statuses resolve to `unknown`, never `approved`.
- [ ] Messages stay fixed and safe — no raw RPC/error interpolation.
- [ ] Every result still includes `disclaimer` and `verified: false`.
- [ ] Docs continue to state that no legal guarantee is implied.
- [ ] Tests cover approved, blocked, revoked, unknown, and unavailable.
