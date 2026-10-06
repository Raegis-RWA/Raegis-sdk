import { Contract, nativeToScVal, rpc, TransactionBuilder } from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import { parseSorobanResult } from './utils/xdr-parser';

export class ComplianceModule {
private client: AegisClient;

constructor(client: AegisClient) {
    this.client = client;
  }

  public async checkWhitelist(address: string): Promise<boolean> {
    const contract = new Contract(this.client.contractId);
    const call = contract.call('is_whitelisted', nativeToScVal(address, { type: 'address' }));

    const result = await this.client.runNetworkOperation(() =>
      this.client.rpcServer.simulateTransaction({
        transaction: call as any,
      } as any)
    );

    if (rpc.Api.isSimulationSuccess(result) && result.result) {
       return parseSorobanResult(result.result.retval as any) as boolean;
    }
    return false;
  }

  /**
   * Adds a user to the protocol compliance whitelist.
   * Wraps the canonical contract entrypoint whitelist_user(admin, user).
   */
  public async whitelist(address: string): Promise<string> {
    const signer = this.client.requireSigner();
    const contract = new Contract(this.client.contractId);
    const call = contract.call(
      'whitelist_user',
      nativeToScVal(signer.publicKey(), { type: 'address' }),
      nativeToScVal(address, { type: 'address' })
    );

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
  }
}
