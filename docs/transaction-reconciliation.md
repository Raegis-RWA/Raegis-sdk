# Transaction result reconciliation

Submitting a Soroban transaction and knowing what happened to it are two
different problems. `sendTransaction` only reports whether the network accepted
the transaction for inclusion; `getTransaction` reports inclusion, but returns
`NOT_FOUND` both for transactions that have not landed yet and for transactions
that fall outside the RPC retention window.

The SDK reconciles both signals into one stable status model so dashboards can
render reliable receipts without matching raw RPC strings.

## Status model

| Status      | Terminal | Meaning                                                   |
| ----------- | -------- | --------------------------------------------------------- |
| `confirmed` | yes      | Included in a ledger and succeeded.                       |
| `failed`    | yes      | Included in a ledger and failed.                          |
| `rejected`  | yes      | Rejected before entering a ledger.                        |
| `pending`   | no       | Accepted or not yet observed. Outcome still open.          |
| `unknown`   | no       | Outcome could not be determined from the current reading.  |

Every result also carries a `code` explaining *why* the status was chosen:

| RPC status                        | Status      | Code                         |
| --------------------------------- | ----------- | ---------------------------- |
| `getTransaction: SUCCESS`         | `confirmed` | `CONFIRMED`                  |
| `getTransaction: FAILED`          | `failed`    | `LEDGER_FAILURE`             |
| `getTransaction: NOT_FOUND`       | `pending`   | `AWAITING_INCLUSION`         |
| `sendTransaction: PENDING`        | `pending`   | `AWAITING_INCLUSION`         |
| `sendTransaction: DUPLICATE`      | `pending`   | `SUBMISSION_DUPLICATE`       |
| `sendTransaction: ERROR`          | `rejected`  | `SUBMISSION_REJECTED`        |
| `sendTransaction: TRY_AGAIN_LATER`| `unknown`   | `SUBMISSION_THROTTLED`       |
| polling window ended              | `unknown`   | `OBSERVATION_WINDOW_EXPIRED` |
| any unrecognised status           | `unknown`   | `UNRECOGNIZED_STATUS`        |

Mapping is conservative: a status this SDK version does not recognise resolves
to `unknown` and never to `confirmed`.

### `rejected` vs `failed`

These are different outcomes and dashboards should not merge them:

- `rejected` — the network refused the submission. Nothing was applied, and no
  sequence number or fee was consumed.
- `failed` — the transaction was included in a ledger and then failed. The fee
  was charged and the sequence number was consumed.

## Reconcile a submission

```typescript
const submitted = client.transaction.reconcileSubmission(sendResponse);

if (submitted.status === 'rejected') {
  console.error('Not accepted:', submitted.failureCode);
}
```

`failureCode` is derived only from the transaction result switch name (for
example `TX_INSUFFICIENT_BALANCE`). Envelopes, signatures, and raw XDR payloads
are never copied into the reconciled result.

## Read the current state

```typescript
const result = await client.transaction.getResult(txHash);

console.log(result.status, result.code, result.ledger);
```

A single read is a snapshot. `pending` means "not observed yet", never "failed".

## Poll safely

```typescript
const result = await client.transaction.waitForResult(txHash, {
  maxAttempts: 10,
  intervalMs: 1000,
  backoffFactor: 1.5,
  maxIntervalMs: 8000,
});

switch (result.status) {
  case 'confirmed':
    return renderReceipt(result);
  case 'failed':
  case 'rejected':
    return renderFailure(result);
  default:
    return renderStillPending(result);
}
```

Polling is bounded by `maxAttempts` and only ever calls `getTransaction`. It
reads state; it never signs, submits, or resubmits, so a long poll cannot
produce duplicate ledger effects. Delays grow by `backoffFactor` and are capped
at `maxIntervalMs`.

When the window ends without inclusion, the result is `unknown` with code
`OBSERVATION_WINDOW_EXPIRED` and `attempts` set to the number of reads made.
That is an instruction to keep reconciling the same hash later — not a failure.

## Retry caution

The SDK does not resubmit transactions automatically, and applications should
not either. Blind resubmission after an indeterminate reading risks applying the
same operation twice.

Before building any retry path:

1. **Reconcile the original hash first.** `pending` and `unknown` are not proof
   of failure. Re-read the hash until it becomes terminal or you accept the
   uncertainty.
2. **Only `rejected` is safe to submit again**, and only as a corrected,
   re-signed transaction. `safeToResubmit` is `true` for exactly this case.
   Resending the identical envelope will simply be rejected again.
3. **Never resubmit after a `NetworkFailure`.** A timeout means the response was
   lost, not that the transaction was. `NetworkFailure.retryable` refers to
   retrying the *read*, not the submission — see
   [Network failure handling](./network-failures.md).
4. **Treat `DUPLICATE` as a signal to stop submitting.** The transaction is
   already in flight; reconcile the existing hash.
5. **Do not resubmit after `failed`.** The sequence number was consumed, so a
   new transaction must be built rather than the old one resent.

## Dashboard integration

- Render `confirmed`, `failed`, and `rejected` as final receipts.
- Render `pending` and `unknown` as "in progress" with a manual refresh, not as
  errors, and keep the hash visible so users can verify independently.
- Surface `code` and `failureCode` in support tooling; they are stable and safe
  to log.
- `observedAt` records when the reading was taken, which lets a dashboard show
  the age of a non-terminal status.
- Reconciled results are frozen, so they can be cached and shared safely.
- Pair reconciliation with [contract events](./contract-events.md) for the audit
  trail, and with [admin action receipts](./admin-action-receipts.md) for admin
  operation history. Events alone do not prove inclusion.

## Contributor review checklist

When changing reconciliation behaviour:

- [ ] Every new RPC status has an explicit mapping, and unrecognised statuses
      still fall back to `unknown`.
- [ ] `NOT_FOUND` never maps to `failed` or `rejected`.
- [ ] `terminal` is only `true` for `confirmed`, `failed`, and `rejected`.
- [ ] `safeToResubmit` is only `true` when the network never accepted the
      transaction.
- [ ] No polling or reconciliation path calls `sendTransaction`.
- [ ] Polling stays bounded and uses the injected `sleep` in tests.
- [ ] No raw XDR, envelope, signature, or RPC URL data reaches the result.
- [ ] Tests cover confirmed, failed, pending, rejected, unknown, and window
      expiry.
