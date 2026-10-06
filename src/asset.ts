import { nativeToScVal } from '@stellar/stellar-sdk';
import { AegisClient } from './client';

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
    const signer = this.client.invocation.getRequiredSigner('mint_asset');
    const call = this.client.invocation.createCall(
      'mint_asset',
      nativeToScVal(signer.publicKey(), { type: 'address' }),
      nativeToScVal(to, { type: 'address' }),
      nativeToScVal(amount, { type: 'i128' }),
    );

    const result = await this.client.invocation.write(call, 'mint_asset');
    return result.hash;
  }

  /**
   * Transfers RWA tokens to another whitelisted address.
   * @param to Stellar public key of the recipient.
   * @param amount Amount to transfer.
   */
  public async transfer(to: string, amount: number): Promise<string> {
    const signer = this.client.invocation.getRequiredSigner('transfer');
    const call = this.client.invocation.createCall(
      'transfer',
      nativeToScVal(signer.publicKey(), { type: 'address' }),
      nativeToScVal(to, { type: 'address' }),
      nativeToScVal(amount, { type: 'i128' }),
    );

    const result = await this.client.invocation.write(call, 'transfer');
    return result.hash;
  }
}
