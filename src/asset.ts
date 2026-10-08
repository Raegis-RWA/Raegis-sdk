import {
  Account,
  Contract,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import {
  CompliantTransferIntentError,
  CompliantTransferIntentErrorCode,
} from './errors/transfer-intent';
import { CompliantTransferIntent } from './types/transfer-intent';

export class AssetModule {
  private client: AegisClient;

  constructor(client: AegisClient) {
    this.client = client;
  }

  private transferError(
    code: CompliantTransferIntentErrorCode,
    message: string,
  ): CompliantTransferIntentError {
    return new CompliantTransferIntentError(code, message);
  }

  private validateTransferInput(to: string, amount: number): void {
    if (!StrKey.isValidEd25519PublicKey(to)) {
      throw this.transferError(
        'INVALID_RECIPIENT',
        'Transfer recipient must be a valid Stellar G-address.',
      );
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw this.transferError(
        'INVALID_AMOUNT',
        'Transfer amount must be a positive safe integer.',
      );
    }
  }

  private validateTransferConfig(): void {
    if (!StrKey.isValidContract(this.client.contractId)) {
      throw this.transferError(
        'INVALID_CONTRACT',
        'A valid Stellar contract ID is required before building a transfer intent.',
      );
    }
    if (
      typeof this.client.networkPassphrase !== 'string' ||
      this.client.networkPassphrase.trim().length === 0
    ) {
      throw this.transferError(
        'INVALID_NETWORK',
        'A non-empty Stellar network passphrase is required before building a transfer intent.',
      );
    }
  }

  private async requireCompliant(
    address: string,
    code: 'SENDER_NOT_COMPLIANT' | 'RECIPIENT_NOT_COMPLIANT',
    label: 'sender' | 'recipient',
  ): Promise<void> {
    let compliant: boolean;
    try {
      compliant = await this.client.compliance.checkWhitelist(address);
    } catch {
      throw this.transferError(
        'COMPLIANCE_CHECK_FAILED',
        `Unable to verify ${label} compliance; transfer readiness could not be confirmed.`,
      );
    }
    if (!compliant) {
      throw this.transferError(
        code,
        `Transfer ${label} is not currently approved by the protocol whitelist.`,
      );
    }
  }

  private async requireTransferCompliance(
    sender: string,
    recipient: string,
  ): Promise<void> {
    await this.requireCompliant(sender, 'SENDER_NOT_COMPLIANT', 'sender');
    await this.requireCompliant(recipient, 'RECIPIENT_NOT_COMPLIANT', 'recipient');
  }

  /**
   * Builds a transfer intent only after validating inputs, configuration, and
   * both protocol whitelist checks. Sender is checked first so a rejected
   * sender never triggers a recipient lookup.
   */
  public async buildTransferIntent(
    to: string,
    amount: number,
  ): Promise<CompliantTransferIntent> {
    const signer = this.client.requireSigner();
    this.validateTransferInput(to, amount);
    this.validateTransferConfig();

    const sender = signer.publicKey();
    await this.requireTransferCompliance(sender, to);

    return Object.freeze({
      sender,
      recipient: to,
      amount,
      contractId: this.client.contractId,
      networkPassphrase: this.client.networkPassphrase,
      compliance: Object.freeze({
        sender: true as const,
        recipient: true as const,
      }),
    });
  }

  /**
   * Verifies that a checked intent is still bound to the current signer,
   * contract, network, recipient, and amount before transaction construction.
   */
  private validateTransferIntentBinding(
    intent: CompliantTransferIntent,
  ): void {
    const signer = this.client.requireSigner();
    this.validateTransferInput(intent.recipient, intent.amount);
    this.validateTransferConfig();

    if (
      intent.sender !== signer.publicKey() ||
      intent.contractId !== this.client.contractId ||
      intent.networkPassphrase !== this.client.networkPassphrase
    ) {
      throw this.transferError(
        'INTENT_CONFIG_MISMATCH',
        'Transfer intent no longer matches the configured signer, contract, or network.',
      );
    }
  }

  /**
   * Constructs and submits a transfer after the caller has established the
   * required compliance state. Binding is checked again after any async work.
   */
  private async sendTransferIntent(
    intent: CompliantTransferIntent,
  ): Promise<string> {
    this.validateTransferIntentBinding(intent);
    const signer = this.client.requireSigner();

    const contract = new Contract(this.client.contractId);
    const call = contract.call(
      'transfer',
      nativeToScVal(signer.publicKey(), { type: 'address' }),
      nativeToScVal(intent.recipient, { type: 'address' }),
      nativeToScVal(intent.amount, { type: 'i128' }),
    );

    // A hardcoded sequence ('0') is not a sendable live Stellar transaction.
    // Resolve the current funded account before building the Soroban call.
    const sourceAccount = await this.client.rpcServer.getAccount(signer.publicKey());
    if (sourceAccount.accountId() !== signer.publicKey()) {
      throw this.transferError(
        'INTENT_CONFIG_MISMATCH',
        'The resolved source account does not match the checked transfer signer.',
      );
    }
    const tx = new TransactionBuilder(sourceAccount, {
      fee: '1000',
      networkPassphrase: this.client.networkPassphrase,
    })
      .addOperation(call)
      .setTimeout(30)
      .build();

    // Soroban invokes require simulation/preparation to include the live
    // footprint and authorization before the final signing operation.
    const preparedTx = await this.client.rpcServer.prepareTransaction(tx);
    // RPC calls await external state. Re-check protocol compliance after the
    // final preparation await so a sender or recipient revoked during
    // simulation cannot still be signed and submitted.
    await this.requireTransferCompliance(intent.sender, intent.recipient);
    // The compliance lookups above also await external state, so re-check the
    // signer/contract/network binding once more immediately before signing.
    this.validateTransferIntentBinding(intent);
    preparedTx.sign(signer);

    // Soroban's send response is not a ledger-success receipt. Returning a
    // hash for ERROR or TRY_AGAIN_LATER falsely reports a submitted transfer,
    // and a transport failure after POST may have an uncertain outcome.
    let response: { status?: unknown; hash?: unknown };
    try {
      response = await this.client.rpcServer.sendTransaction(preparedTx);
    } catch {
      // Never echo provider error text (which may contain account data).
      // Do not automatically resubmit an uncertain transaction.
      throw this.transferError(
        'SUBMISSION_UNCONFIRMED',
        'Transfer submission outcome is unknown. Check transaction status before retrying.',
      );
    }

    let status: unknown;
    let hash: unknown;
    try {
      status = response?.status;
      hash = response?.hash;
    } catch {
      throw this.transferError(
        'SUBMISSION_UNCONFIRMED',
        'Transfer submission response could not be verified. Check transaction status before retrying.',
      );
    }
    if (status === 'ERROR') {
      throw this.transferError(
        'SUBMISSION_REJECTED',
        'Transfer submission was rejected by the Soroban RPC endpoint.',
      );
    }
    if (
      (status !== 'PENDING' && status !== 'DUPLICATE') ||
      typeof hash !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(hash)
    ) {
      throw this.transferError(
        'SUBMISSION_UNCONFIRMED',
        'Transfer submission was not confirmed as accepted. Check transaction status before retrying.',
      );
    }
    return hash;
  }

  /**
   * Submits a previously-built compliant intent. Explicit intent submission
   * rechecks sender and recipient compliance immediately before construction,
   * preventing caller-constructed or stale intents from bypassing preflight.
   */
  public async submitTransferIntent(
    intent: CompliantTransferIntent,
  ): Promise<string> {
    this.validateTransferIntentBinding(intent);

    await this.requireTransferCompliance(intent.sender, intent.recipient);

    return this.sendTransferIntent(intent);
  }

  /**
   * Submits a transaction to mint new RWA tokens.
   * @param to Stellar public key of the recipient.
   * @param amount Amount to mint.
   */
  public async mint(to: string, amount: number): Promise<string> {
    const signer = this.client.requireSigner();
    const contract = new Contract(this.client.contractId);

    const call = contract.call(
      'mint_asset',
      nativeToScVal(signer.publicKey(), { type: 'address' }),
      nativeToScVal(to, { type: 'address' }),
      nativeToScVal(amount, { type: 'i128' }),
    );

    // TODO: Implement transaction simulation endpoint before submitting to check for auth/whitelist failures

    // Note: In production, you must fetch the real sequence number for the account
    const sourceAccount = new Account(signer.publicKey(), '0');

    const tx = new TransactionBuilder(sourceAccount, {
      fee: '1000',
      networkPassphrase: this.client.networkPassphrase,
    })
      .addOperation(call)
      .setTimeout(30)
      .build();

    tx.sign(signer);

    try {
      const response = await this.client.rpcServer.sendTransaction(tx);
      return response.hash;
    } catch (error) {
      throw new Error(`Mint transaction failed: ${error}`);
    }
  }

  /**
   * Transfers RWA tokens to another whitelisted address.
   * The legacy convenience method now routes through the compliant intent
   * preflight before transaction construction/submission.
   */
  public async transfer(to: string, amount: number): Promise<string> {
    const intent = await this.buildTransferIntent(to, amount);
    return this.sendTransferIntent(intent);
  }
}
