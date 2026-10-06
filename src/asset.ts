import {
  Account,
  Contract,
  nativeToScVal,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import { AegisSdkError } from './errors/public';

export class AssetModule {
  private client: AegisClient;

  constructor(client: AegisClient) {
    this.client = client;
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
      throw new AegisSdkError({
        code: 'ASSET_MINT_FAILED',
        category: 'asset',
        message: 'Mint transaction failed.',
        metadata: { operation: 'mint' },
        cause: error,
      });
    }
  }

  /**
   * Transfers RWA tokens to another whitelisted address.
   * @param to Stellar public key of the recipient.
   * @param amount Amount to transfer.
   */
  public async transfer(to: string, amount: number): Promise<string> {
    const signer = this.client.requireSigner();
    const contract = new Contract(this.client.contractId);

    const call = contract.call(
      'transfer',
      nativeToScVal(signer.publicKey(), { type: 'address' }),
      nativeToScVal(to, { type: 'address' }),
      nativeToScVal(amount, { type: 'i128' }),
    );

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
      throw new AegisSdkError({
        code: 'ASSET_TRANSFER_FAILED',
        category: 'asset',
        message: 'Transfer transaction failed.',
        metadata: { operation: 'transfer' },
        cause: error,
      });
    }
  }
}
