# Compliance Readiness

`ComplianceModule.checkReadiness(address)` gives dashboards and SDK consumers one stable model for deciding how to present protocol eligibility before a restricted RWA action.

It is deliberately **not** a legal or KYC determination. The SDK reports only protocol-visible state. The Soroban contract remains the final authority for whether a state-changing operation succeeds.

## Result model

```ts
const readiness = await aegis.compliance.checkReadiness(address);

if (readiness.state === 'approved') {
  // The current protocol whitelist read allows the restricted-action UX.
}
```

Every result contains `state`, `eligible`, `verified`, a stable `code`, a human-readable `reason`, the queried `address`, and `checkedAt`.

| State | Eligible | Meaning for UI |
| --- | --- | --- |
| `approved` | yes | Protocol status currently allows the restricted-action UX. |
| `blocked` | no | The observed whitelist read is negative. |
| `revoked` | no | A richer protocol/indexer source explicitly reports revocation. |
| `pending` | no | Approval is not complete; do not optimistically enable the action. |
| `unknown` | no | The status does not establish eligibility, or the address is invalid. |
| `unavailable` | no | The status could not be read; offer a safe retry instead of guessing. |

The deployed contract currently exposes a boolean `is_whitelisted` read, so live `checkReadiness()` calls resolve to `approved`, `blocked`, `unknown` (invalid input), or `unavailable` (query failure). `mapComplianceReadiness()` also normalises `revoked`, `pending`, and `unknown` values so dashboards or future protocol/indexer integrations can adopt richer states without changing their UI state machine.

## Stable reason codes

Use `code` for program logic rather than parsing `reason` text:

- `APPROVED`
- `NOT_WHITELISTED`
- `REVOKED`
- `PENDING_REVIEW`
- `STATUS_UNKNOWN`
- `STATUS_UNAVAILABLE`
- `INVALID_ADDRESS`

## Dashboard guidance

Treat every state except `approved` as non-eligible for restricted actions. Show a state-specific explanation for `blocked`, `revoked`, and `pending`. For `unknown` or `unavailable`, prefer a retry/status-refresh affordance and avoid presenting a definitive compliance conclusion.

Do not use readiness as authorization and do not infer off-chain KYC, accreditation, sanctions, or legal status from it. Never blindly resubmit a state-changing transaction because a readiness read failed; refresh the read first, then let the contract enforce the operation.
