# Admin Transaction Preview

`buildAdminTransactionPreview` creates a deterministic, typed review model for
privileged actions before an application enters its signing and submission
flow. The builder is pure: it performs no RPC calls, simulation, signing,
submission, authorization, or compliance verification.

## Public API

```ts
import {
  AdminPreviewError,
  buildAdminTransactionPreview,
} from '@aegis/sdk';

const preview = buildAdminTransactionPreview({
  operation: 'whitelist-add',
  target: { address: ' GUSER ' },
});
```

The returned preview is immutable and includes the normalized `operation` and
`target`, a human-readable `summary`, a `complianceImpact` classification,
and operation-specific `warnings`.

## Supported operations

| Operation | Target | Review emphasis |
| --- | --- | --- |
| `whitelist-add` | `address` | whitelist/compliance state change |
| `whitelist-remove` | `address` | whitelist/compliance state change |
| `asset-register` | `assetId` | persistent asset-registry change |
| `asset-mint` | `assetId`, `recipient`, positive decimal `amount` | supply and recipient review |
| `role-grant` | `address`, assignable `role` | privilege-surface expansion |
| `role-revoke` | `address`, assignable `role` | privilege-surface reduction |

Assignable preview roles are `compliance-operator`, `issuer`, and `admin`.

## Dashboard usage

Use the preview immediately before the application's existing privileged-action
signing flow:

1. Build the preview from the same user-entered values that will feed the real
   transaction path.
2. Render `summary`, the normalized target fields, `complianceImpact`, and
   every warning in the confirmation UI.
3. Require the operator to review those values before continuing to the
   application's existing signing/submission action.
4. Keep the real transaction path authoritative. Re-run its authorization,
   compliance, simulation, freshness, and other submission-time checks rather
   than treating the preview as approval.

A dashboard may use the typed operation to choose labels or field layout, but it
should not infer additional verification from the preview.

## Review-only and verification boundary

Every preview intentionally returns:

```ts
{
  reviewOnly: true,
  verified: false,
}
```

Those flags are invariants, not dynamic verification results. In particular,
the builder does **not**:

- prove that the signer is authorized for the requested admin action;
- establish KYC, legal eligibility, whitelist truth, or recipient compliance;
- verify that an asset or role exists on-chain;
- simulate, sign, or submit a transaction; or
- guarantee that state has not changed after the preview was created.

Applications should preserve these flags when displaying preview data and must
not relabel the output as verified without an independent authoritative check.

## Stable errors

Invalid preview input throws `AdminPreviewError` with one of these stable
codes:

| Code | Meaning |
| --- | --- |
| `INVALID_TARGET` | A required address or asset identifier is blank after trimming. |
| `INVALID_AMOUNT` | A mint amount is not a positive decimal string. |
| `INVALID_ROLE` | A role is outside the assignable admin-preview role set. |

```ts
try {
  buildAdminTransactionPreview({
    operation: 'asset-mint',
    target: { assetId: 'RWA-1', recipient: 'GUSER', amount: '0' },
  });
} catch (error) {
  if (error instanceof AdminPreviewError) {
    console.error(error.code);
  }
}
```

Treat these codes as input-review failures. RPC, wallet, contract, and
submission failures belong to the application's actual transaction path.

## Security notes

The preview reduces operator ambiguity; it is not a security boundary by
itself. Display the complete normalized target and warnings, avoid hiding the
`reviewOnly` / `verified` status, and perform all authoritative checks again
at the point where the real transaction is constructed and submitted.
