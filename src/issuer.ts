import { StrKey } from '@stellar/stellar-sdk';
import { AegisClient } from './client';

export type IssuerOperation = 'mint' | 'transfer';

export type IssuerClientErrorCode =
  | 'SIGNER_REQUIRED'
  | 'INVALID_RECIPIENT'
  | 'INVALID_AMOUNT';

export class IssuerClientError extends Error {
  public readonly code: IssuerClientErrorCode;
  public readonly operation: IssuerOperation;

  constructor(
    code: IssuerClientErrorCode,
    operation: IssuerOperation,
    message: string,
  ) {
    super(message);
    this.name = 'IssuerClientError';
    this.code = code;
    this.operation = operation;
    Object.setPrototypeOf(this, IssuerClientError.prototype);
  }
}

/**
 * Issuer-specific SDK boundary over the existing AssetModule.
 *
 * This validates client-side inputs and confirms a local signer before
 * delegating. It does not infer contract-side issuer authorization.
 */
export class IssuerModule {
  private readonly client: AegisClient;

  constructor(client: AegisClient) {
    this.client = client;
  }

  public signerPublicKey(operation: IssuerOperation = 'mint'): string {
    try {
      return this.client.requireSigner().publicKey();
    } catch {
      throw new IssuerClientError(
        'SIGNER_REQUIRED',
        operation,
        'Issuer operations require a configured signing keypair.',
      );
    }
  }

  public async mint(recipient: string, amount: number): Promise<string> {
    this.validateCommand('mint', recipient, amount);
    this.signerPublicKey('mint');
    return this.client.asset.mint(recipient, amount);
  }

  public async transfer(recipient: string, amount: number): Promise<string> {
    this.validateCommand('transfer', recipient, amount);
    this.signerPublicKey('transfer');
    return this.client.asset.transfer(recipient, amount);
  }

  private validateCommand(
    operation: IssuerOperation,
    recipient: string,
    amount: number,
  ): void {
    if (!StrKey.isValidEd25519PublicKey(recipient)) {
      throw new IssuerClientError(
        'INVALID_RECIPIENT',
        operation,
        'Recipient must be a valid Stellar account public key.',
      );
    }

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new IssuerClientError(
        'INVALID_AMOUNT',
        operation,
        'Amount must be a positive safe integer.',
      );
    }
  }
}
