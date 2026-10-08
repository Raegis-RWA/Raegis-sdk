# Compliance Lifecycle Client

The SDK compliance lifecycle surface separates three questions that should not
be conflated:

1. What did the deployed contract report for `is_whitelisted`?
2. Was the read unavailable or malformed?
3. Can this SDK build safely submit a whitelist mutation?

The current contract-facing SDK has a verified read method,
`is_whitelisted`, but it does not expose a verified whitelist-write contract
method. The lifecycle client therefore supports typed reads and **explicitly
gates** admin mutations rather than guessing an ABI entrypoint.

## Read the current whitelist state

Use `getComplianceStatus()` when an application needs to distinguish a
confirmed negative result from an unavailable read.

```ts
const status = await client.compliance.getComplianceStatus(investorAddress);

switch (status.status) {
  case 'approved':
    // Contract returned true.
    break;
  case 'not-approved':
    // Contract returned false.
    break;
  case 'unavailable':
    // No reliable boolean was observed. Do not treat this as a denial.
    break;
}
```

The legacy `checkWhitelist()` method remains boolean-compatible: only a
confirmed `true` returns true. A confirmed false or unusable simulation
returns false. New code that needs failure-state fidelity should prefer
`getComplianceStatus()`.

Both methods validate the address as a Stellar Ed25519 account before attempting
RPC work. Invalid input throws `ComplianceLifecycleError` with code
`INVALID_ADDRESS`.

## Admin whitelist updates

```ts
try {
  await client.compliance.updateWhitelist(investorAddress, true);
} catch (error) {
  if (error instanceof ComplianceLifecycleError) {
    console.log(error.code);
  }
}
```

The current behavior is deliberately gated:

- without a configured signer, the method throws `SIGNER_REQUIRED`;
- with a signer, it throws `ADMIN_UPDATE_UNSUPPORTED`.

That ordering preserves the mutating-call signer boundary while making the
contract limitation explicit. It does **not** manufacture an `add_whitelist`,
`set_whitelist`, or similarly named Soroban call that has not been verified
against the deployed contract.

Role-aware clients can additionally use
`createComplianceOperatorClient(...).assertWhitelistAccess()` or
`createAdminClient(...).assertWhitelistAccess()` to enforce their declared
SDK capability before entering an admin flow. Those role assertions are
client-side guardrails; the deployed contract remains authoritative for actual
authorization once a real write ABI exists.

## Capability diagnostic

`diagnoseLifecycle()` returns a small, serializable capability snapshot:

```ts
const diagnostic = client.compliance.diagnoseLifecycle();
```

It reports:

- read support and the verified `is_whitelisted` method;
- that admin mutation is currently unsupported and requires a signer;
- whether a signer is configured as a boolean;
- `legalStatus: "not-assessed"`.

The diagnostic never includes signer key material.

## Error model

`ComplianceLifecycleError.code` is one of:

| Code | Meaning |
| --- | --- |
| `INVALID_ADDRESS` | The target is not a valid Stellar Ed25519 account address. |
| `SIGNER_REQUIRED` | A mutating compliance flow was attempted without a signer. |
| `ADMIN_UPDATE_UNSUPPORTED` | This SDK build has no verified contract whitelist-write method. |

Expected RPC/read failures do not leak provider messages through
`getComplianceStatus()`; they resolve to the typed `unavailable` state.

## Compliance boundary

Whitelist state is protocol data, not a legal conclusion. A positive contract
read does not by itself prove KYC/AML completion, regulatory eligibility, or
permission to perform a particular RWA transaction. Applications should treat
contract authorization as authoritative for protocol actions and use qualified
compliance processes for legal/regulatory determinations.
