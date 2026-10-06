import { nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { AegisClient } from './client';

export class ComplianceModule {
  private client: AegisClient;

  constructor(client: AegisClient) {
    this.client = client;
  }

  /**
   * Queries the contract to check if a user is KYC-approved (whitelisted).
   *
   * Simulation failure is not treated as a negative compliance result: the
   * invocation layer throws a typed failure so callers can preserve unknown
   * and unavailable states instead of silently converting them to false.
   */
  public async checkWhitelist(address: string): Promise<boolean> {
    const call = this.client.invocation.createCall(
      'is_whitelisted',
      nativeToScVal(address, { type: 'address' }),
    );

    return this.client.invocation.read<boolean>(
      call,
      (retval) => scValToNative(retval as xdr.ScVal) as boolean,
      'is_whitelisted',
    );
  }
}
