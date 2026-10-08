import { Contract, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import { parseSorobanResult } from './utils/xdr-parser';
import {
  buildComplianceAuditReport,
  ComplianceAuditInput,
  ComplianceAuditReport,
} from './compliance-audit';

export class ComplianceModule {
private client: AegisClient;

constructor(client: AegisClient) {
    this.client = client;
  }

  /**
   * Builds a deterministic compliance audit report from caller-supplied evidence.
   *
   * This helper performs no RPC calls and does not make legal or financial
   * compliance determinations; it only normalizes and summarizes the supplied
   * protocol evidence.
   */
  public buildAuditReport(input: ComplianceAuditInput): ComplianceAuditReport {
    return buildComplianceAuditReport(input);
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
}
