import { Contract, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import { parseSorobanResult } from './utils/xdr-parser';

export class ComplianceModule {
private client: AegisClient;

constructor(client: AegisClient) {
    this.client = client;
  }

  /**
   * Queries the contract to check if a user is KYC-approved (whitelisted).
   * @param address The Stellar public key to check.
   * @returns boolean indicating whitelist status.
   */
  public async checkWhitelist(address: string): Promise<boolean> {
    const contract = new Contract(this.client.contractId);

    // Create the invocation for the read-only 'is_whitelisted' function
    const call = contract.call('is_whitelisted', nativeToScVal(address, { type: 'address' }));

    const result = await this.client.runNetworkOperation(() =>
      this.client.rpcServer.simulateTransaction({
        // Dummy transaction for simulation purposes
        transaction: call as any, // Cast required depending on SDK version wrapper
      } as any)
    );

    // rpc.Api.isSimulationSuccess acts as a type guard here.
    // A failed simulation is not equivalent to an authoritative "false" result.
    if (rpc.Api.isSimulationSuccess(result) && result.result) {
       return parseSorobanResult(result.result.retval as any) as boolean;
    }

    throw new Error('Compliance whitelist query simulation failed.');
  }
}
