# RWA metadata validation

The SDK exposes `rwaAssetMetadataSchema` and `parseRwaAssetMetadata` for
validating RWA metadata before it is passed to contract-integration code or
rendered by a dashboard.

## Validated shape

```ts
interface RwaAssetMetadata {
  issuer: string;
  symbol: string;
  name: string;
  status: 'active' | 'paused' | 'matured' | 'redeemed' | 'defaulted';
  supply: bigint;
}
```

The schema applies these rules:

- **issuer** — canonical Stellar Ed25519 public-key StrKey (`G` plus 55
  base32 characters) with a valid Stellar checksum. Shape-valid addresses with
  a bad StrKey checksum are rejected as `INVALID_ISSUER`.
- **symbol** — normalized to uppercase and follows the existing dashboard
  ticker convention: 2-10 letters/digits, optionally followed by one
  hyphenated 2-10 character segment (for example `UST-6M`).
- **name** — trimmed and 3-128 characters.
- **status** — one of the issuer-reported lifecycle states already used by the
  dashboard.
- **supply** — a non-negative Soroban `i128` value. The parser accepts
  `bigint`, an unsigned decimal string, or a safe JavaScript integer and
  always returns `bigint`. Unsafe numbers are rejected rather than rounded.

Invalid input throws `AssetMetadataValidationError` from `parse`. Consumers
that do not want exceptions can use `rwaAssetMetadataSchema.safeParse()` and
branch on its `success` field. Errors expose stable `code` and `field`
values so UI code does not need to parse display text.

## Dashboard usage

Validate provider/SDK payloads at the data boundary, then render the returned
`RwaAssetMetadata`. Keep `supply` as `bigint` in application state and
format it for display only at the UI edge.

```ts
const result = rwaAssetMetadataSchema.safeParse(providerPayload);

if (!result.success) {
  showMetadataError(result.error.code);
  return;
}

renderAsset({
  ...result.data,
  supplyLabel: result.data.supply.toLocaleString('en-US'),
});
```

The SDK intentionally shares the dashboard lifecycle vocabulary:
`active`, `paused`, `matured`, `redeemed`, and `defaulted`. This schema
validates the state value only; transition-policy checks belong to the
lifecycle/state-machine layer.

## Limitations

A successful parse only establishes that the payload matches this SDK's
protocol/data constraints. It does **not** establish:

- legal title or ownership of an off-chain asset;
- issuer authority or identity;
- regulatory eligibility or jurisdictional compliance;
- valuation, reserves, solvency, or asset performance;
- authenticity of off-chain documents or provenance.

Those checks require authoritative systems outside this SDK. Applications
should not present successful metadata validation as legal or compliance
verification.
