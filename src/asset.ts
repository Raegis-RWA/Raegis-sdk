import {
  Account,
  Contract,
  nativeToScVal,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import { TransactionSimulationError } from './errors/simulation';
import { simulateTransactionReadiness } from './transactions/simulation';

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

    // Note: In production, fetch the real sequence number for the account.
    const sourceAccount = new Account(signer.publicKey(), '0');

    const tx = new TransactionBuilder(sourceAccount, {
      fee: '1000',
      networkPassphrase: this.client.networkPassphrase,
    })
      .addOperation(call)
      .setTimeout(30)
      .build();

    const readiness = await simulateTransactionReadiness(
      this.client.rpcServer,
      tx,
      'mint',
    );
    if (!readiness.ready) {
      throw new TransactionSimulationError(readiness);
    }

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

    const readiness = await simulateTransactionReadiness(
      this.client.rpcServer,
      tx,
      'transfer',
    );
    if (!readiness.ready) {
      throw new TransactionSimulationError(readiness);
    }

    tx.sign(signer);

    try {
      const response = await this.client.rpcServer.sendTransaction(tx);
      return response.hash;
    } catch (error) {
      throw new Error(`Transfer transaction failed: ${error}`);
    }
  }
}
