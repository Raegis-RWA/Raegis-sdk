import { Contract, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import {
  mapSimulationReadiness,
  SimulationReadiness,
} from './transactions/simulation';
import { parseSorobanResult } from './utils/xdr-parser';

export class ComplianceModule {
  private client: AegisClient;

  constructor(client: AegisClient) {
    this.client = client;
  }

  /**
   * Returns the typed readiness state for the whitelist simulation without
   * exposing the raw RPC error surface.
   */
  public async checkWhitelistReadiness(
    address: string,
  ): Promise<SimulationReadiness> {
    const response = await this.simulateWhitelist(address);
    return mapSimulationReadiness(response, 'compliance');
  }

  /**
   * Queries the contract to check if a user is KYC-approved (whitelisted).
   * @param address The Stellar public key to check.
   * @returns boolean indicating whitelist status.
   */
  public async checkWhitelist(address: string): Promise<boolean> {
    const result = await this.simulateWhitelist(address);
    const readiness = mapSimulationReadiness(result, 'compliance');

    if (!readiness.ready) {
      return false;
    }

    if (rpc.Api.isSimulationSuccess(result) && result.result) {
      return parseSorobanResult(result.result.retval as any) as boolean;
    }
    return false;
  }

  private async simulateWhitelist(address: string) {
    const contract = new Contract(this.client.contractId);
    const call = contract.call(
      'is_whitelisted',
      nativeToScVal(address, { type: 'address' }),
    );

    return this.client.runNetworkOperation(() =>
      this.client.rpcServer.simulateTransaction({
        transaction: call as any,
      } as any),
    );
  }
}
