import { Contract, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import { WhitelistObservation } from './types/transfer-eligibility';
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

    // rpc.Api.isSimulationSuccess acts as a type guard here
    // Check for success AND ensure the result object actually exists
    if (rpc.Api.isSimulationSuccess(result) && result.result) {
       return parseSorobanResult(result.result.retval as any) as boolean;
    }
    return false;
  }

  /**
   * Observes whitelist state without collapsing an unsuccessful simulation into
   * the same value as an explicit contract-level false result.
   *
   * The legacy checkWhitelist() boolean API is intentionally unchanged.
   */
  public async observeWhitelist(address: string): Promise<WhitelistObservation> {
    const observedAt = new Date().toISOString();
    const contract = new Contract(this.client.contractId);
    const call = contract.call(
      'is_whitelisted',
      nativeToScVal(address, { type: 'address' })
    );

    try {
      const result = await this.client.runNetworkOperation(() =>
        this.client.rpcServer.simulateTransaction({
          transaction: call as any,
        } as any)
      );

      if (!rpc.Api.isSimulationSuccess(result) || !result.result) {
        return {
          address,
          state: 'unknown',
          isWhitelisted: null,
          code: 'WHITELIST_STATUS_UNKNOWN',
          observedAt,
        };
      }

      const parsed = parseSorobanResult(result.result.retval as any);
      if (parsed === true) {
        return {
          address,
          state: 'approved',
          isWhitelisted: true,
          code: 'WHITELIST_APPROVED',
          observedAt,
        };
      }
      if (parsed === false) {
        return {
          address,
          state: 'not_approved',
          isWhitelisted: false,
          code: 'WHITELIST_NOT_APPROVED',
          observedAt,
        };
      }

      return {
        address,
        state: 'unknown',
        isWhitelisted: null,
        code: 'WHITELIST_STATUS_UNKNOWN',
        observedAt,
      };
    } catch {
      return {
        address,
        state: 'unavailable',
        isWhitelisted: null,
        code: 'WHITELIST_QUERY_FAILED',
        observedAt,
      };
    }
  }
}
