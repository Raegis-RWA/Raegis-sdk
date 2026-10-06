# Freighter Wallet Adapter

The SDK provides a typed `FreighterWalletAdapter` for requesting account access and signing a transaction that the caller has already prepared.

The adapter deliberately keeps the browser-wallet dependency outside core `@aegis/sdk`. Applications inject the small transport surface implemented by Freighter, so Node and other non-browser SDK consumers do not acquire a browser-only dependency.

## Responsibilities

The adapter:

- checks whether the wallet transport is available;
- requests explicit account access;
- validates the returned Stellar account address;
- requests a signature for caller-supplied transaction XDR and network passphrase;
- optionally requires the signing account to match a caller-selected address;
- returns stable typed failures for unavailable, rejected, invalid-address, signing, and signer-mismatch cases.

It does **not** build, simulate, authorize, submit, or retry transactions. It never handles secret keys. A successful wallet signature is not a statement that a protocol operation is authorized, compliant, legally permissible, or safe to submit.

## Integration

Install and initialize the browser wallet package in the application, then inject its API surface rather than importing it from SDK core:

```ts
import { FreighterWalletAdapter } from '@aegis/sdk';
import {
  isConnected,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api';

const wallet = new FreighterWalletAdapter({
  isConnected,
  requestAccess,
  signTransaction,
});

const { address } = await wallet.connect();

const signed = await wallet.signTransaction(unsignedXdr, {
  networkPassphrase,
  address,
});
```

The application remains responsible for obtaining the unsigned XDR from the intended transaction builder, checking the intended network and operation summary, simulating or preflighting where required, reconciling account/sequence state, and submitting only after its own authorization gates pass.

## Failure codes

| Code | Meaning |
| --- | --- |
| `FREIGHTER_UNAVAILABLE` | The wallet cannot be reached or reports that it is disconnected. |
| `ACCESS_REJECTED` | The user rejected/cancelled the account-access request. |
| `ACCESS_FAILED` | Account access failed for another reason. |
| `INVALID_ADDRESS` | The wallet or caller supplied an invalid Stellar account address. |
| `INVALID_TRANSACTION_XDR` | The caller supplied empty or malformed transaction-envelope XDR; it is rejected before any wallet signing request. |
| `SIGNING_REJECTED` | The user rejected/cancelled the signature request. |
| `SIGNING_FAILED` | Signing failed or returned an empty signed transaction. |
| `SIGNER_MISMATCH` | The wallet signed with an account other than the explicitly requested account. |

Treat unknown transport failures as failures. Do not silently switch accounts, networks, or transaction contents after the user has reviewed an operation.

## Security and compliance boundary

Before requesting a signature, the application should display or otherwise bind the transaction intent the user is approving. Pass the exact intended Stellar network passphrase and, when the flow expects a particular account, pass that address so signer drift fails closed.

The adapter is a wallet boundary only. Contract authorization remains authoritative on-chain, and protocol whitelist/role state must not be presented as legal, KYC, suitability, or financial advice.
