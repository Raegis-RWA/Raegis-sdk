import { Contract, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import { AegisSdkError } from './errors/public';
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

    try {
      const result = await this.client.runNetworkOperation(() =>
        this.client.rpcServer.simulateTransaction({
          // Dummy transaction for simulation purposes
          transaction: call as any, // Cast required depending on SDK version wrapper
        } as any)
      );

      if (!rpc.Api.isSimulationSuccess(result) || !result.result) {
        throw new AegisSdkError({
          code: 'COMPLIANCE_QUERY_FAILED',
          category: 'compliance',
          message: 'The compliance status query failed.',
          metadata: { operation: 'checkWhitelist' },
        });
      }

      return parseSorobanResult(result.result.retval as any) as boolean;
    } catch (error) {
      if (
        error instanceof AegisSdkError &&
        error.category === 'compliance' &&
        error.code === 'COMPLIANCE_QUERY_FAILED'
      ) {
        throw error;
      }

      throw new AegisSdkError({
        code: 'COMPLIANCE_QUERY_FAILED',
        category: 'compliance',
        message: 'The compliance status query failed.',
        metadata: { operation: 'checkWhitelist' },
        cause: error,
      });
    }
  }
}
