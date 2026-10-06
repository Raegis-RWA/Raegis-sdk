# Issuer Role Client

Use `createIssuerClient()` when an application needs the SDK's issuer-facing
mint and transfer surface.

The returned client exposes `issuer.mint(recipient, amount)` and
`issuer.transfer(recipient, amount)`. Its compatibility `asset.mint()` and
`asset.transfer()` methods use the same issuer validation path.

## Client-side validation

Before delegating to the existing asset module, the issuer boundary checks that:

- a local signing keypair is configured;
- the recipient is a valid Stellar Ed25519 account public key; and
- the amount is a positive JavaScript safe integer.

Invalid input produces `IssuerClientError` with a stable code:
`SIGNER_REQUIRED`, `INVALID_RECIPIENT`, or `INVALID_AMOUNT`.

## Authorization boundary

Constructing an issuer client declares SDK intent. It does not establish that
the configured signer has an issuer role on-chain. The Aegis contract remains
the authority for transaction authorization.

A syntactically valid recipient also does not establish KYC, regulatory
eligibility, ownership, valuation, or any other off-chain fact. The issuer
module intentionally avoids adding a duplicate whitelist preflight that could
be stale by transaction time.

Protocol checks are technical controls, not legal or financial advice.

## Review checklist

For changes to issuer-facing behavior, reviewers should verify:

- valid mint and transfer inputs delegate once to the existing asset module;
- malformed Stellar account keys are rejected before transaction delegation;
- zero, negative, fractional, and unsafe-integer amounts are rejected;
- missing signer failures use the stable `SIGNER_REQUIRED` code;
- issuer validation does not claim on-chain role verification or legal status;
- error messages do not expose signing material or raw provider payloads; and
- direct `AegisClient.asset` remains the documented lower-level API.

## Lower-level API

Direct `AegisClient.asset` usage remains available as the lower-level asset
surface. Prefer the role-aware issuer client for issuer-facing applications
that want the explicit validation boundary.
