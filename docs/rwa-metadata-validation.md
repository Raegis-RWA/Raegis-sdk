# RWA metadata validation

The SDK exposes a small, versioned metadata contract for asset records passed between application code, dashboards, indexers, and other off-chain consumers.

`validateRwaMetadata(value)` returns a discriminated validation result. `assertRwaMetadata(value)` returns the typed value or throws `RwaMetadataValidationError`, whose `issues` array contains stable field and error codes.

## Version 1 schema

| Field | Requirement |
| --- | --- |
| `schemaVersion` | Must be `1`. |
| `assetId` | 1–128 characters. Starts alphanumeric; letters, digits, `.`, `_`, `:`, and `-` are accepted. |
| `name` | Trimmed text, 1–120 characters. |
| `symbol` | 1–32 characters. Starts alphanumeric; letters, digits, `.`, `_`, and `-` are accepted. |
| `decimals` | Integer from 0 through 18. |
| `issuer` | Valid Stellar Ed25519 public key. |
| `description` | Optional trimmed text, 1–2048 characters. |
| `metadataUri` | Optional `https://` or `ipfs://` URI, at most 2048 characters. |

Unknown top-level fields fail validation. This is deliberate: a misspelled or newer field should not be silently accepted as part of version 1. Applications with a broader domain model should map the fields they intend to share into the version-1 core record before validation.

The `decimals <= 18` rule is an SDK interoperability/display guard for this schema. It is not a claim about contract authorization or a universal protocol limit.

## Example

```ts
import { validateRwaMetadata } from '@aegis/sdk';

const result = validateRwaMetadata({
  schemaVersion: 1,
  assetId: 'rwa:property:001',
  name: 'Harbor Street Property',
  symbol: 'HSP',
  decimals: 7,
  issuer: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  metadataUri: 'https://example.com/assets/001.json',
});

if (!result.ok) {
  for (const issue of result.issues) {
    console.error(issue.field, issue.code, issue.message);
  }
} else {
  console.log(result.value.assetId);
}
```

## Failure model

Validation reports all detected field failures in one pass. Codes are stable API values intended for tests and UI mapping; messages are human-readable explanations.

Common failures include unsupported schema versions, malformed asset identifiers, invalid decimal precision, an invalid issuer public key, unsupported URI schemes, untrimmed/bounded text, and unknown fields.

## Security and compliance boundary

This validator checks data shape and conservative transport/display constraints only. Passing validation does **not** prove:

- that the issuer controls the supplied public key or is authorized to mint;
- that an asset description, valuation, ownership/title claim, or linked document is true;
- that an address or investor has passed KYC/AML, allowlist, accreditation, or jurisdictional checks;
- that the asset or operation is legally compliant;
- that the metadata matches authoritative on-chain contract state.

Applications must reconcile those properties with the relevant Aegis contract reads, trusted registries, and their own compliance process before treating metadata as authoritative. Protocol-level status is not legal or financial advice.

## Versioning

Version 1 is intentionally strict. A future incompatible schema should use a new `schemaVersion` and explicit validator rather than silently widening the current contract.
