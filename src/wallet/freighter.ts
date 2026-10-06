import { StrKey, TransactionBuilder } from '@stellar/stellar-sdk';

export interface FreighterApiErrorLike {
  message?: string;
  code?: string;
}

export interface FreighterConnectionResponse {
  isConnected: boolean;
  error?: FreighterApiErrorLike;
}

export interface FreighterAccessResponse {
  address: string;
  error?: FreighterApiErrorLike;
}

export interface FreighterSignRequest {
  networkPassphrase: string;
  address?: string;
}

export interface FreighterSignResponse {
  signedTxXdr: string;
  signerAddress: string;
  error?: FreighterApiErrorLike;
}

/**
 * Minimal surface implemented by @stellar/freighter-api v6.
 *
 * Keeping the dependency injected lets the SDK remain usable in Node and other
 * non-browser runtimes without pulling a browser wallet package into core.
 */
export interface FreighterApiTransport {
  isConnected(): Promise<FreighterConnectionResponse>;
  requestAccess(): Promise<FreighterAccessResponse>;
  signTransaction(
    xdr: string,
    options: FreighterSignRequest,
  ): Promise<FreighterSignResponse>;
}

export type FreighterAdapterErrorCode =
  | 'FREIGHTER_UNAVAILABLE'
  | 'ACCESS_REJECTED'
  | 'ACCESS_FAILED'
  | 'INVALID_ADDRESS'
  | 'INVALID_TRANSACTION_XDR'
  | 'SIGNING_REJECTED'
  | 'SIGNING_FAILED'
  | 'SIGNER_MISMATCH';

export class FreighterAdapterError extends Error {
  public readonly code: FreighterAdapterErrorCode;

  constructor(code: FreighterAdapterErrorCode, message: string) {
    super(message);
    this.name = 'FreighterAdapterError';
    this.code = code;
  }
}

export interface FreighterConnection {
  address: string;
}

export interface FreighterSignedTransaction {
  signedTxXdr: string;
  signerAddress: string;
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return error instanceof Error ? error.message : String(error);
}

function isUserRejection(error: unknown): boolean {
  return /reject|denied|declin|cancel/i.test(getErrorMessage(error));
}

function assertStellarAccountAddress(address: string): string {
  const normalized = address.trim();

  if (!StrKey.isValidEd25519PublicKey(normalized)) {
    throw new FreighterAdapterError(
      'INVALID_ADDRESS',
      'Freighter returned an invalid Stellar account address.',
    );
  }

  return normalized;
}

/**
 * Browser-wallet adapter for Freighter.
 *
 * The adapter only requests wallet access and signatures. It never submits a
 * transaction, never handles secret keys, and does not make compliance or
 * on-chain authorization decisions.
 */
export class FreighterWalletAdapter {
  private readonly api: FreighterApiTransport;

  constructor(api: FreighterApiTransport) {
    this.api = api;
  }

  /**
   * Returns false when Freighter is missing or its connectivity probe fails.
   * Use connect() when the caller needs a typed failure reason.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.api.isConnected();
      return result.isConnected === true && !result.error;
    } catch {
      return false;
    }
  }

  /**
   * Requests explicit wallet access and returns the selected Stellar account.
   */
  async connect(): Promise<FreighterConnection> {
    let connection: FreighterConnectionResponse;

    try {
      connection = await this.api.isConnected();
    } catch (error) {
      throw new FreighterAdapterError(
        'FREIGHTER_UNAVAILABLE',
        `Freighter connectivity check failed: ${getErrorMessage(error)}`,
      );
    }

    if (!connection.isConnected || connection.error) {
      throw new FreighterAdapterError(
        'FREIGHTER_UNAVAILABLE',
        connection.error?.message || 'Freighter is not available in this runtime.',
      );
    }

    let access: FreighterAccessResponse;

    try {
      access = await this.api.requestAccess();
    } catch (error) {
      const code = isUserRejection(error) ? 'ACCESS_REJECTED' : 'ACCESS_FAILED';
      throw new FreighterAdapterError(
        code,
        `Freighter access request failed: ${getErrorMessage(error)}`,
      );
    }

    if (access.error) {
      const code = isUserRejection(access.error) ? 'ACCESS_REJECTED' : 'ACCESS_FAILED';
      throw new FreighterAdapterError(
        code,
        access.error.message || 'Freighter access request failed.',
      );
    }

    return { address: assertStellarAccountAddress(access.address) };
  }

  /**
   * Requests a wallet signature for a prepared transaction XDR.
   *
   * The caller remains responsible for building, simulating, authorizing, and
   * submitting the transaction. Supplying networkPassphrase lets Freighter
   * surface a network mismatch before the user approves a signature.
   */
  async signTransaction(
    xdr: string,
    options: FreighterSignRequest,
  ): Promise<FreighterSignedTransaction> {
    const trimmedXdr = xdr.trim();

    if (!trimmedXdr) {
      throw new FreighterAdapterError(
        'INVALID_TRANSACTION_XDR',
        'Transaction XDR must be a non-empty base64 string.',
      );
    }

    let normalizedXdr: string;

    try {
      normalizedXdr = TransactionBuilder.fromXDR(
        trimmedXdr,
        options.networkPassphrase,
      ).toXDR();
    } catch {
      throw new FreighterAdapterError(
        'INVALID_TRANSACTION_XDR',
        'Transaction XDR must be a valid Stellar transaction envelope.',
      );
    }

    const requestedAddress = options.address
      ? assertStellarAccountAddress(options.address)
      : undefined;

    let result: FreighterSignResponse;

    try {
      result = await this.api.signTransaction(normalizedXdr, {
        networkPassphrase: options.networkPassphrase,
        address: requestedAddress,
      });
    } catch (error) {
      const code = isUserRejection(error) ? 'SIGNING_REJECTED' : 'SIGNING_FAILED';
      throw new FreighterAdapterError(
        code,
        `Freighter signing failed: ${getErrorMessage(error)}`,
      );
    }

    if (result.error) {
      const code = isUserRejection(result.error) ? 'SIGNING_REJECTED' : 'SIGNING_FAILED';
      throw new FreighterAdapterError(
        code,
        result.error.message || 'Freighter signing failed.',
      );
    }

    if (!result.signedTxXdr || !result.signedTxXdr.trim()) {
      throw new FreighterAdapterError(
        'SIGNING_FAILED',
        'Freighter returned an empty signed transaction XDR.',
      );
    }

    const signerAddress = assertStellarAccountAddress(result.signerAddress);

    if (requestedAddress && signerAddress !== requestedAddress) {
      throw new FreighterAdapterError(
        'SIGNER_MISMATCH',
        `Freighter signed with ${signerAddress}, but ${requestedAddress} was requested.`,
      );
    }

    return {
      signedTxXdr: result.signedTxXdr,
      signerAddress,
    };
  }
}
