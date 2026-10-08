# Investor Transfer Eligibility

`InvestorModule.checkTransferEligibility(source, destination, amount)` is a read-only
preflight for UI, workflow, and contributor logic. It does not sign, simulate, or submit
an asset transfer and it does not check balances.

The preflight validates both Stellar account-shaped inputs and a positive finite amount
before any network call. It then observes protocol whitelist state in source-first order:

1. source not approved -> `ineligible`, destination is not queried;
2. source unknown/unavailable -> `unknown` or `unavailable`, destination is not queried;
3. source approved -> destination is observed;
4. both explicitly approved -> `eligible`.

The result uses stable typed states and codes. A legacy `checkWhitelist() === false`
cannot distinguish a contract-level negative result from an unsuccessful simulation, so
the new `ComplianceModule.observeWhitelist()` API preserves that ambiguity as
`unknown` when the simulation itself does not produce a boolean result.

This is protocol-facing SDK state only. It is not legal, KYC, regulatory, or financial
advice, does not prove sufficient balance, and does not replace contract authorization.
State-changing transaction paths remain authoritative.

## Example

```ts
const result = await client.investor.checkTransferEligibility(
  sourcePublicKey,
  destinationPublicKey,
  100,
);

if (result.state === 'eligible') {
  // The protocol whitelist preflight is positive. A later transaction can still fail.
}
```
