import { Contract, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import { parseSorobanResult } from './utils/xdr-parser';
import { ComplianceStatusSnapshot } from './types/compliance-status';

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
   * Observes the protocol compliance status available through the current
   * boolean whitelist surface.
   *
   * A positive whitelist result maps to `approved`. A false result maps to
   * `unknown`, not `blocked` or `revoked`, because the current contract
   * query does not distinguish those states and an unsuccessful simulation can
   * also resolve to false. Thrown RPC errors map to `unavailable`.
   *
   * This is protocol-facing SDK state, not legal/compliance advice and not an
   * authorization decision for state-changing transactions.
   */
  public async getComplianceStatus(address: string): Promise<ComplianceStatusSnapshot> {
    const observedAt = new Date().toISOString();

    try {
      const isApproved = await this.checkWhitelist(address);
      if (isApproved) {
        return {
          address,
          status: 'approved',
          code: 'WHITELIST_APPROVED',
          observedAt,
        };
      }

      return {
        address,
        status: 'unknown',
        code: 'NOT_APPROVED_UNSPECIFIED',
        reason:
          'The current boolean whitelist query did not report approval and cannot distinguish pending, blocked, revoked, or unsuccessful-simulation states.',
        observedAt,
      };
    } catch {
      return {
        address,
        status: 'unavailable',
        code: 'QUERY_FAILED',
        reason: 'The whitelist status query failed; no approval should be inferred.',
        observedAt,
      };
    }
  }

}
