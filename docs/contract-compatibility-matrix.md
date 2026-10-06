# SDK / Aegis Contract Compatibility Matrix

**Source pin:** SDK commit `69fff2c7e8c6fe801428fc1bb71d064c5c94949c`

This document records the contract and Soroban RPC surfaces that the current SDK
actually depends on. It is a compatibility aid for SDK and contract releases,
not an ABI specification. When the deployed Aegis contract changes, verify
these dependencies against the deployed contract commit / spec before
releasing the SDK.

## Method compatibility matrix

| SDK surface | Contract / RPC dependency | Events consumed or expected | SDK-visible errors / fallbacks | Stability notes |
| --- | --- | --- | --- | --- |
| `ComplianceModule.checkWhitelist(address)` | Aegis `is_whitelisted(address)`, simulated through Soroban RPC | None | Returns `false` when simulation does not produce a successful result. Contract-native error codes are not mapped. | **Unstable boundary:** simulation currently constructs the invocation with `transaction: call as any`; re-check this shape when Stellar SDK simulation APIs change. |
| `AssetModule.mint(to, amount)` | Aegis `mint_asset(signer, to, amount)`, submitted with `sendTransaction` | Decoder recognizes `mint` and `mint_asset` topics | Throws a generic SDK `Error` on send failure. Contract-native error codes are not mapped. | **Unstable boundary:** source account sequence is currently hard-coded to `0`, and the TODO pre-submit simulation/auth check is not implemented. |
| `AssetModule.transfer(to, amount)` | Aegis `transfer(signer, to, amount)`, submitted with `sendTransaction` | Decoder recognizes `transfer` | Throws a generic SDK `Error` on send failure. Contract-native error codes are not mapped. | **Unstable boundary:** source account sequence is currently hard-coded to `0`; no pre-submit simulation is performed. |
| `InvestorModule.getPortfolio(address, options)` | Indirectly calls `is_whitelisted(address)`; then simulates each target asset contract's `balance(address)` | None | Portfolio/read-model fallbacks include `NOT_WHITELISTED`, `ZERO_BALANCE`, `QUERY_FAILED`, and an `unavailable` portfolio state. These are SDK codes, not contract-native error codes. | **Unstable boundary:** asset metadata is currently placeholder/static SDK data, and failed balance simulation is collapsed to balance `0`. |
| `RoleModule.discoverRole(address)` | Indirectly calls `ComplianceModule.checkWhitelist` → Aegis `is_whitelisted` | None | SDK role result codes include `OK`, `INVALID_ADDRESS`, and `COMPLIANCE_QUERY_FAILED`. | **Indirect/client-only:** the Aegis contract exposes no role query here. The SDK can discover investor/unauthorized state from whitelist status but cannot prove issuer/admin role. |
| `RoleModule.checkCapability(address, capability)` / `getCapabilityMatrix(address)` | Indirect whitelist reads for transfer capabilities; local signer presence for minting; no role function is invoked | None | SDK capability results include `NO_SIGNER_CONFIGURED`, `NOT_WHITELISTED`, `COMPLIANCE_QUERY_FAILED`, and `OK`. | **Client-only guard:** this is UI/developer preflight, not on-chain authorization. Contract execution remains authoritative. |
| `EventsModule.fetchAndDecode(request, options)` | Soroban RPC `getEvents(request)`; does not invoke an Aegis contract function | Decodes the known topic catalogue listed below | RPC failures flow through the SDK network boundary; decoder failures use `EventDecodeError` codes such as `INVALID_EVENT_INPUT`, `EMPTY_TOPICS`, `TOPIC_DECODE_FAILED`, `VALUE_DECODE_FAILED`, and `UNSUPPORTED_EVENT`. | **Unstable boundary:** event topic names/aliases are SDK-maintained and are not pinned to a deployed contract ABI in this repository. |
| `EventsModule.decode(input, options)` | No network or contract call; decodes supplied Soroban event data | Same known topic catalogue | Uses SDK decoder errors only; contract-native error codes are not involved. | Unknown topics are intentionally handled by the decoder's forward-compatibility behavior; review when the contract event catalogue changes. |

## Event compatibility

The current decoder recognizes these canonical Aegis topics:

- `whitelist_add`
- `whitelist_remove`
- `mint`
- `mint_asset`
- `transfer`
- `protocol_pause`
- `protocol_unpause`
- `asset_register`
- `asset_metadata`

`src/events/topics.ts` also accepts documented aliases (for example
`whitelist_added`, `add_to_whitelist`, `pause`, `unpause`, and
`register_asset`) and normalizes them to the canonical SDK names. Treat that
alias table as an SDK compatibility layer, not proof that every alias is
emitted by every deployed Aegis contract.

## Error compatibility

The SDK currently exposes typed/local error surfaces for areas such as network
transport, event decoding, role/capability checks, configuration, and portfolio
read models. Those codes describe SDK behavior.

**The current SDK does not maintain a verified mapping from deployed Aegis
contract-native error codes to SDK error codes.** Do not add such a mapping to
this matrix by inference. A release that introduces or changes contract-native
errors should first pin the deployed contract/spec source, then add the mapping
and focused compatibility coverage.

## Release drift checklist

Before releasing an SDK version against a new Aegis deployment:

1. Pin the deployed Aegis contract commit/spec used for the release.
2. Re-check `is_whitelisted`, `mint_asset`, `transfer`, and asset
   `balance` argument/result shapes against this matrix.
3. Re-check emitted event topics against `src/events/topics.ts` and decoder
   payload expectations.
4. Confirm whether contract-native error codes now have an authoritative SDK
   mapping; do not infer one from provider error strings.
5. Re-test the known unstable boundaries: compliance simulation shape,
   transaction sequence/pre-simulation behavior, portfolio metadata, role
   discovery, and event-topic forward compatibility.
6. Update this matrix in the same release PR whenever a mapped dependency
   changes.
