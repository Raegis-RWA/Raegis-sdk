import { BASE_FEE, Contract, nativeToScVal, rpc, scValToNative, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import {
  ComplianceProtocolStatus,
  ComplianceReadinessResult,
} from './types/compliance-readiness';

/**
 * Maps protocol/indexer compliance status into a stable SDK readiness model.
 *
 * This function describes protocol state only. It does not assert legal KYC,
 * accreditation, sanctions screening, or any other off-chain determination.
 */
export function mapComplianceReadiness(
  address: string,
  status: ComplianceProtocolStatus,
  checkedAt = new Date().toISOString()
): ComplianceReadinessResult {
  switch (status) {
    case true:
    case 'approved':
    case 'whitelisted':
      return {
        address,
        state: 'approved',
        eligible: true,
        verified: true,
        code: 'APPROVED',
        reason: 'Address is approved by the observed protocol whitelist state.',
        checkedAt,
      };
    case false:
    case 'blocked':
    case 'not_whitelisted':
      return {
        address,
        state: 'blocked',
        eligible: false,
        verified: true,
        code: 'NOT_WHITELISTED',
        reason: 'Address is not approved by the observed protocol whitelist state.',
        checkedAt,
      };
    case 'revoked':
      return {
        address,
        state: 'revoked',
        eligible: false,
        verified: true,
        code: 'REVOKED',
        reason: 'Protocol eligibility was revoked.',
        checkedAt,
      };
    case 'pending':
      return {
        address,
        state: 'pending',
        eligible: false,
        verified: true,
        code: 'PENDING_REVIEW',
        reason: 'Protocol eligibility is pending and should not be treated as approved.',
        checkedAt,
      };
    case 'unknown':
      return {
        address,
        state: 'unknown',
        eligible: false,
        verified: true,
        code: 'STATUS_UNKNOWN',
        reason: 'Protocol returned a status that does not establish eligibility.',
        checkedAt,
      };
    case 'unavailable':
    case null:
    case undefined:
    default:
      return {
        address,
        state: 'unavailable',
        eligible: false,
        verified: false,
        code: 'STATUS_UNAVAILABLE',
        reason: 'Compliance status is unavailable. Retry the read before enabling restricted actions.',
        checkedAt,
      };
  }
}

export class ComplianceModule {
  private client: AegisClient;

  constructor(client: AegisClient) {
    this.client = client;
  }

  /**
   * Queries the contract to check if a user is protocol-whitelisted.
   * @param address The Stellar public key to check.
   * @returns boolean indicating whitelist status.
   */
  private async simulateWhitelist(address: string): Promise<rpc.Api.SimulateTransactionResponse> {
    const contract = new Contract(this.client.contractId);

    // Create the invocation for the read-only 'is_whitelisted' function
    const call = contract.call('is_whitelisted', nativeToScVal(address, { type: 'address' }));

    return this.client.runNetworkOperation(async () => {
      const sourceAddress = this.client.keypair?.publicKey() ?? address;
      const account = await this.client.rpcServer.getAccount(sourceAddress);
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.client.networkPassphrase,
      })
        .addOperation(call)
        .setTimeout(30)
        .build();

      // Simulation needs a serialisable transaction, but never a signature or submission.
      return this.client.rpcServer.simulateTransaction(transaction);
    });
  }

  public async checkWhitelist(address: string): Promise<boolean> {
    const result = await this.simulateWhitelist(address);

    // rpc.Api.isSimulationSuccess acts as a type guard here
    // Check for success AND ensure the result object actually exists
    if (rpc.Api.isSimulationSuccess(result) && result.result && !rpc.Api.isSimulationRestore(result)) {
      return scValToNative(result.result.retval) === true;
    }
    return false;
  }

  /**
   * Returns a dashboard-safe readiness result for restricted protocol actions.
   *
   * The deployed contract currently exposes `is_whitelisted`, so a successful
   * live read resolves to `approved` or `blocked`. The public readiness model
   * also represents `revoked`, `pending`, `unknown`, and `unavailable` so richer
   * protocol/indexer sources can be normalised without changing consumer logic.
   *
   * This is protocol state, not proof of off-chain legal/KYC status. Contracts
   * remain the final authority for whether any state-changing operation succeeds.
   */
  public async checkReadiness(address: string): Promise<ComplianceReadinessResult> {
    const checkedAt = new Date().toISOString();

    if (!StrKey.isValidEd25519PublicKey(address)) {
      return {
        address,
        state: 'unknown',
        eligible: false,
        verified: false,
        code: 'INVALID_ADDRESS',
        reason: 'A valid Stellar public key is required for a compliance readiness check.',
        checkedAt,
      };
    }

    try {
      const result = await this.simulateWhitelist(address);
      if (!rpc.Api.isSimulationSuccess(result) || !result.result || rpc.Api.isSimulationRestore(result)) {
        return mapComplianceReadiness(address, 'unavailable', checkedAt);
      }

      // RPC success responses already contain a parsed ScVal, not a base64 string.
      const status = scValToNative(result.result.retval);
      return mapComplianceReadiness(
        address,
        typeof status === 'boolean' ? status : 'unknown',
        checkedAt
      );
    } catch {
      return mapComplianceReadiness(address, 'unavailable', checkedAt);
    }
  }
}

