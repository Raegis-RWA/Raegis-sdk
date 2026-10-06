# Compliance Status Transitions

The SDK provides a small, typed mapper for protocol-facing compliance status.
It is intended for dashboard state, diagnostics, and consistent contributor logic.
It does **not** change on-chain compliance state and does not replace contract
authorization, legal review, or regulatory/KYC decisions.

## Status model

| Status | Meaning in the mapper |
| --- | --- |
| `pending` | A trusted protocol/dashboard source explicitly reports review pending. |
| `approved` | The current observation explicitly reports approval. |
| `blocked` | A trusted source explicitly reports a blocked/restricted state. |
| `revoked` | A trusted source explicitly reports previously granted status revoked. |
| `unknown` | The available data cannot identify a more specific status. |
| `unavailable` | The status source could not be queried. |

The current Aegis contract surface exposed by this SDK is a boolean
`is_whitelisted` check. Therefore `ComplianceModule.getComplianceStatus()` only
returns:

* `approved` when `checkWhitelist()` returns `true`;
* `unknown` when it returns `false`, because false cannot distinguish pending,
  blocked, revoked, or an unsuccessful simulation;
* `unavailable` when the whitelist query throws.

The SDK deliberately does not relabel a false result as `blocked`, `revoked`, or
`pending`.

## Transition mapping

```typescript
import { mapComplianceStatusTransition } from '@aegis/sdk';

const transition = mapComplianceStatusTransition('pending', 'approved');
// {
//   from: 'pending',
//   to: 'approved',
//   kind: 'progression',
//   code: 'BECAME_APPROVED',
//   changed: true,
//   failClosed: false,
//   ...
// }
```

Stable transition codes:

| Code | Meaning |
| --- | --- |
| `INITIAL_STATUS` | First explicit non-pending status observation. |
| `NO_STATUS_CHANGE` | Previous and current status are identical. |
| `BECAME_APPROVED` | Current status moved to approved. |
| `BECAME_RESTRICTED` | Current status moved to blocked or revoked. |
| `REVIEW_PENDING` | Current status is pending. |
| `STATUS_UNKNOWN` | Current status cannot be determined. |
| `STATUS_UNAVAILABLE` | Current status source cannot be queried. |

`failClosed` is `true` unless the current status is explicitly `approved`.
That field only means the mapper will not treat the current observation as approved.
A `false` value is **not** a transaction authorization and must not bypass contract
checks.

## Untrusted labels

Use `normalizeComplianceStatus(value)` before mapping values received from loosely
typed JSON or dashboard integrations. The normalizer trims and lowercases recognized
labels; anything else becomes `unknown`.

## Security and compliance boundary

* The mapper is pure and performs no transaction or contract mutation.
* Contract authorization remains authoritative for state-changing operations.
* `blocked`, `revoked`, and `pending` should only be supplied when a trusted
  protocol/indexer/dashboard source explicitly provides them.
* Do not present SDK status labels as legal, financial, regulatory, or KYC advice.
* When status is `unknown` or `unavailable`, fail closed and avoid inferring
  approval.
