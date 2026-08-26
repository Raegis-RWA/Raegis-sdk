import { Contract, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import type {
  ComplianceCacheScope,
  ComplianceStatusCacheEntry,
} from './types/compliance-cache';
import { parseSorobanResult } from './utils/xdr-parser';

/**
 * Returns whether a consumer-managed compliance cache entry is safe to reuse.
 *
 * Freshness requires an exact network/contract/address match, valid timestamps,
 * and an expiry strictly later than `now`. This helper never reads from or
 * writes to a cache; consumers remain responsible for explicit invalidation.
 */
export function isComplianceCacheEntryFresh(
  entry: Readonly<ComplianceStatusCacheEntry>,
  expectedScope: Readonly<ComplianceCacheScope>,
  now: number = Date.now(),
): boolean {
  if (!entry.scope) {
    return false;
  }

  const timestampsAreValid =
    Number.isFinite(now) &&
    Number.isFinite(entry.checkedAt) &&
    Number.isFinite(entry.expiresAt) &&
    entry.checkedAt <= now &&
    entry.expiresAt > now &&
    entry.expiresAt >= entry.checkedAt;

  return (
    timestampsAreValid &&
    entry.scope.networkPassphrase === expectedScope.networkPassphrase &&
    entry.scope.contractId === expectedScope.contractId &&
    entry.scope.address === expectedScope.address
  );
}

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
}
