import { Contract, nativeToScVal, TransactionBuilder, Account } from '@stellar/stellar-sdk';
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
    const signer = this.client.requireSigner();
    const contract = new Contract(this.client.contractId);

    const call = contract.call(
      'mint_asset',
      nativeToScVal(signer.publicKey(), { type: 'address' }),
      nativeToScVal(to, { type: 'address' }),
      nativeToScVal(amount, { type: 'i128' })
    );

    try {
      const sourceAccount = await this.client.runNetworkOperation(() =>
        this.client.rpcServer.getAccount(signer.publicKey())
      );

      const tx = new TransactionBuilder(sourceAccount, {
        fee: "1000",
        networkPassphrase: this.client.networkPassphrase,
      })
      .addOperation(call)
      .setTimeout(30)
      .build();

      const prepared = await this.client.runNetworkOperation(() =>
        this.client.rpcServer.prepareTransaction(tx)
      );
      prepared.sign(signer);

      const response = await this.client.runNetworkOperation(() =>
        this.client.rpcServer.sendTransaction(prepared)
      );
      return response.hash;
    } catch (error) {
      throw new Error(`Mint transaction failed: ${error}`);
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
      nativeToScVal(amount, { type: 'i128' })
    );

    const sourceAccount = new Account(signer.publicKey(), "0");

    const tx = new TransactionBuilder(sourceAccount, {
      fee: "1000",
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
      // TODO: Improve error typing for unauthorized transfer attempts
      throw new Error(`Transfer transaction failed: ${error}`);
    }
  }
}
