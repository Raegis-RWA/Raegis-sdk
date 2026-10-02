import { Contract, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import { executeComplianceBatch } from './compliance/batch';
import {
  ComplianceBatchOptions,
  ComplianceBatchResult,
} from './types/compliance-batch';
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
    return (await this.queryWhitelist(address)) ?? false;
  }

  private async queryWhitelist(address: string): Promise<boolean | null> {
    const contract = new Contract(this.client.contractId);

    // Create the invocation for the read-only 'is_whitelisted' function
    const call = contract.call('is_whitelisted', nativeToScVal(address, { type: 'address' }));

    const result = await this.client.runNetworkOperation(() =>
      this.client.rpcServer.simulateTransaction({
        // Dummy transaction for simulation purposes
        transaction: call as any, // Cast required depending on SDK version wrapper
      } as any)
    );

    // rpc.Api.isSimulationSuccess acts as a type guard here
    // Check for success AND ensure the result object actually exists
    if (rpc.Api.isSimulationSuccess(result) && result.result) {
       const parsed = parseSorobanResult(result.result.retval as any);
       return typeof parsed === 'boolean' ? parsed : null;
    }
    return null;
  }

  private async checkWhitelistForBatch(address: string): Promise<boolean> {
    const result = await this.queryWhitelist(address);
    if (result === null) {
      throw new SyntaxError(
        'Compliance simulation did not return a boolean result.',
      );
    }
    return result;
  }

  /**
   * Checks multiple investor addresses with bounded concurrency.
   *
   * Invalid addresses and query failures are represented per item, so one bad
   * input or RPC response never rejects the entire batch. Results preserve input
   * order and duplicate valid addresses are queried once by default.
   */
  public async checkWhitelistBatch(
    addresses: readonly string[],
    options: ComplianceBatchOptions = {},
  ): Promise<ComplianceBatchResult> {
    return executeComplianceBatch(
      addresses,
      (address) => this.checkWhitelistForBatch(address),
      options,
    );
  }
}
