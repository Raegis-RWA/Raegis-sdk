# Admin operation idempotency and safe retries

Administrative writes are high-impact operations. A timeout, dropped response, or
ambiguous RPC result must not turn into a second mint, a repeated state change,
or a sequence-number race.

This guide defines the retry boundary for Aegis SDK integrations. It describes
the behavior available on the current SDK surface; it does **not** add a new
transaction-submission API or claim that the underlying protocol makes every
admin operation idempotent.

> **Compliance boundary:** SDK role checks, receipts, and retry bookkeeping are
> protocol/application safeguards. They are not legal, financial, regulatory,
> or KYC determinations. Contract-side authorization remains authoritative.

## Identities that must stay separate

A robust integration tracks three different identities:

| Identity | Meaning | Lifetime |
| --- | --- | --- |
| Application operation ID | Stable caller-generated ID for one business intent, such as one requested mint | Reused while reconciling the same intent |
| Transaction hash / signed envelope | Identity of the exact Stellar transaction submitted for that intent | Fixed for that signed transaction |
| Source account sequence | Stellar ordering value consumed by a transaction | Must be coordinated per signer/account |

Do not treat matching operation parameters as proof that two attempts are the
same operation. In particular, two separately signed mint transactions with the
same recipient and amount can still represent two ledger effects.

## Current SDK behavior

The current SDK exposes several pieces that help integrations report state, but
they do not by themselves make a write idempotent:

- **AssetModule.mint()** and **AssetModule.transfer()** return the transaction
  hash from sendTransaction. A returned hash means the transaction was
  submitted; it does not prove ledger inclusion or success.
- **buildAdminActionReceipt()** normalizes transaction observations for dashboard
  display. DUPLICATE and NOT_FOUND normalize to pending, while TRY_AGAIN_LATER
  and unknown values normalize to unknown. A receipt is an observation record,
  not a submission lock or replay guard.
- Role-aware clients provide SDK-level capability guards. They do not replace
  contract-side authorization.
- src/asset.ts currently constructs mint and transfer transactions with source
  sequence "0" and contains a production TODO to fetch the real account
  sequence. **Do not treat the current mint/transfer implementation as
  production-safe retry machinery until sequence handling is corrected.**

These limitations are intentional inputs to the policy below: when the SDK
cannot prove whether a write landed, the caller must preserve ambiguity instead
of guessing.

## Safe operation lifecycle

### 1. Record intent before signing

Persist an application operation ID before building or signing the transaction.
The record should contain only non-secret reconciliation data, for example:

    type AdminOperationRecord = {
      operationId: string;
      operation: string;
      targetSummary: string;
      state: 'prepared' | 'submitted' | 'pending' | 'confirmed' | 'failed' | 'unknown';
      transactionHash?: string;
      createdAt: string;
      updatedAt: string;
    };

This is an integration record, not an exported SDK type. Never persist secret
keys, signatures, raw signed envelopes, or arbitrary RPC payloads in a support
record.

### 2. Serialize writes for one signer

Only one component should allocate and submit sequence-sensitive writes for a
given Stellar source account at a time. Multiple workers independently reading a
sequence and racing new transactions can create stale-sequence failures and
ambiguous retries.

A distributed application should use a signer-scoped queue, lock, or equivalent
single-writer discipline. The lock protects transaction preparation; it is not a
substitute for checking ledger state.

### 3. Bind the exact transaction to the intent

Once a transaction is built, bind its hash (or the exact signed-envelope
identity in infrastructure that safely retains it) to the application operation
ID. If submission has an ambiguous outcome, reconcile that same transaction
before constructing a replacement.

Do **not** generate a fresh transaction merely because a client HTTP request
timed out.

### 4. Classify the observation conservatively

Use the following decision table:

| Observation | Meaning for retry policy | Action |
| --- | --- | --- |
| Validation/build fails before any submit call | No transaction was sent | Correct the input/build failure; retrying the same business intent is safe |
| sendTransaction returns a hash | Submission occurred | Persist the hash; observe that transaction; do not immediately create a replacement |
| PENDING / NOT_FOUND / DUPLICATE | Outcome is not a confirmed failure | Keep the intent unresolved and continue observation; do not create a fresh write |
| Transport timeout / connection loss during submit | Submission may or may not have reached the RPC/network | Mark unknown; reconcile before any replacement |
| TRY_AGAIN_LATER or unrecognised status | SDK cannot prove the outcome | Mark unknown; reconcile first |
| Explicit pre-admission rejection that is known not to have consumed ledger state | The submitted transaction did not become a successful ledger write | Re-check current state and sequence; correct the cause before constructing a new transaction |
| Confirmed success | Ledger effect is complete | Mark the intent complete; never replay it |
| Confirmed ledger failure | That exact transaction failed, but current application state may have changed independently | Re-read relevant state and authorization before deciding whether a new intent/transaction is appropriate |

buildAdminActionReceipt() can represent these observations for UI/reporting, but
it does not query the network or decide whether a replacement transaction is
safe.

## Operation-specific duplicate risks

A caller must reconcile the state that matters to the operation, not only the
last HTTP/RPC response.

- **Asset mint:** never infer idempotency from (asset, recipient, amount).
  Repeating a fresh valid mint can increase supply twice. Confirm the original
  transaction and re-read supply/balance state before considering another write.
- **Whitelist add/remove:** re-read the protocol whitelist state before issuing a
  replacement. An ambiguous response may hide a write that already landed.
- **Asset registration:** re-read the asset registry/identifier before retrying.
  A second registration request may conflict with the first rather than prove it
  failed.
- **Protocol pause/unpause:** re-read current protocol state. Even when the
  desired state is declarative, the caller must not assume a transport error
  means no state transition occurred.
- **Admin/issuer role changes or other future privileged operations:** treat them
  as non-idempotent unless the contract/API explicitly documents an idempotent
  key or compare-and-set precondition.

## Dashboard and worker behavior

While an intent is submitted, pending, or unknown:

1. Show the operation as unresolved rather than failed.
2. Disable the normal "run again" action for that same intent.
3. Prefer a "refresh status" or reconciliation action.
4. Keep the original transaction hash visible when one is known.
5. Surface failureCode only as diagnostic metadata; do not use it as a legal or
   compliance conclusion.
6. If an operator intentionally abandons the original intent and creates a new
   one, make that transition explicit and auditable.

If two workers discover the same unresolved application operation ID, one should
become the reconciliation owner. They should not both submit replacement
transactions.

## Sequence-number boundary

Stellar sequence numbers provide transaction ordering, not business-level
idempotency. A fresh transaction with a fresh sequence can repeat the same
business effect.

The current AssetModule hardcodes source sequence "0"; therefore:

- do not build production retry logic on top of current mint()/transfer()
  sequence handling;
- do not "fix" an ambiguous transaction by blindly incrementing or replacing the
  sequence locally;
- production transaction construction must first obtain and coordinate the
  actual source account sequence;
- after any ambiguous submission, reconcile the original transaction and
  refresh account state before building another transaction.

## Designing future write APIs

When adding a new privileged write surface, prefer an explicit separation:

1. **prepare** — validate input, fetch current state/sequence, and build an
   operation bound to a caller-supplied application operation ID;
2. **submit** — submit one exact transaction and persist its hash;
3. **observe** — query/normalize its status without resubmitting;
4. **reconcile** — compare the observed transaction result with current contract
   state;
5. **replace** — create a new transaction only after the original outcome is
   known or a documented replacement rule permits it.

If the contract itself supports a nonce, request ID, or compare-and-set
precondition for a business operation, document that contract guarantee
explicitly. Do not invent an SDK-only idempotency promise around a contract call
that has no such guarantee.

## Contributor/reviewer checklist

For any PR that adds or changes a privileged write path:

- [ ] The PR identifies the business operation identity separately from the
      Stellar transaction hash and source sequence.
- [ ] Network timeout / ambiguous submission is represented as unresolved, not
      automatically failed.
- [ ] No code path blindly resubmits a fresh transaction after an ambiguous
      response.
- [ ] Concurrent writes for the same signer have an explicit sequence-ownership
      strategy.
- [ ] Operation-specific state is re-read before a replacement write.
- [ ] Any contract-level nonce/idempotency guarantee is cited from actual
      contract behavior; otherwise the operation is treated as non-idempotent.
- [ ] Receipts and diagnostics exclude secrets, signatures, and raw envelopes.
- [ ] Tests cover duplicate/ambiguous status handling when runtime behavior is
      changed. Documentation-only changes explain why runtime tests do not
      apply.
- [ ] Protocol compliance status is not described as legal or regulatory
      approval.

See also [Admin action receipts](./admin-action-receipts.md),
[Role-Aware Client Factory](./role-aware-client-factory.md), and the
[Pull Request Reviewer Checklist](./reviewer-checklist.md).
