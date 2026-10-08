# Compliant transfer intents

Use the transfer-intent preflight before submitting an RWA transfer:

```ts
const intent = await client.asset.buildTransferIntent(recipient, amount);
const hash = await client.asset.submitTransferIntent(intent);
```

`client.asset.transfer(recipient, amount)` uses the same build-to-submit path.

The builder validates the recipient, amount, contract ID, and network before any
compliance query. It checks the configured signer first and the recipient
second. A rejected sender short-circuits the recipient check, and an unavailable
compliance query fails closed.

Before explicit intent submission, the SDK rechecks sender and recipient
compliance. It then rechecks that the current signer, contract ID, and network
passphrase still match the checked intent immediately before transaction
construction. If they changed, submission stops with `INTENT_CONFIG_MISMATCH`.
The send path fetches the current Stellar account sequence using RPC rather than
hardcoding a sequence of zero, prepares the Soroban invocation to attach its
simulation footprint and authorizations, then checks signer/contract/network
binding **again** after those asynchronous steps and before signing. A live
account belonging to a different signer is rejected without submission.

The convenience `client.asset.transfer(...)` path performs the same sender and
recipient preflight once and then uses the same validated send path, avoiding a
duplicate compliance round-trip on the immediate build-to-submit flow.

Preflight failures use `CompliantTransferIntentError.code`:
`INVALID_RECIPIENT`, `INVALID_AMOUNT`, `INVALID_CONTRACT`,
`INVALID_NETWORK`, `SENDER_NOT_COMPLIANT`,
`RECIPIENT_NOT_COMPLIANT`, `COMPLIANCE_CHECK_FAILED`, and
`INTENT_CONFIG_MISMATCH`.

## Submission outcome and safe retry

The SDK returns a 64-character transaction hash only when Soroban RPC
identifies the submission as `PENDING` or `DUPLICATE`. A returned hash is
**not** final ledger success; callers must still poll that hash for a confirmed
result.

A definitive RPC `ERROR` response yields `CompliantTransferIntentError`
with code `SUBMISSION_REJECTED`. A `TRY_AGAIN_LATER` response, missing or
malformed hash/status, or network transport exception yields
`SUBMISSION_UNCONFIRMED` instead: the transaction may have reached the RPC
endpoint, so do **not** blindly resubmit a payment. Inspect transaction status
and reconcile the original signed transaction before considering another send.

RPC exception text is deliberately excluded from the public error. It may
include private provider details. These failure paths do not alter the prior
whitelist rechecks, signer and source account binding, or simulation preparation
requirements.

These checks describe SDK and protocol readiness. The contract remains
authoritative when the transaction is submitted.
