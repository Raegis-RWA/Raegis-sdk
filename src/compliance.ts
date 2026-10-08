import { Contract, nativeToScVal, rpc, StrKey } from '@stellar/stellar-sdk';
import { AegisClient } from './client';
import { ComplianceLifecycleError } from './errors/compliance';
import type {
  ComplianceLifecycleDiagnostic,
  ComplianceStatusSnapshot,
} from './types/compliance-lifecycle';
import { parseSorobanResult } from './utils/xdr-parser';

export class ComplianceModule {
  private client: AegisClient;

  constructor(client: AegisClient) {
    this.client = client;
  }

  /**
   * Reads the contract's boolean whitelist value.
   *
   * `null` means the simulation did not produce a usable boolean. It is kept
   * distinct from `false` so lifecycle callers never interpret an unavailable
   * read as a confirmed rejection.
   */
  private async readWhitelist(address: string): Promise<boolean | null> {
    this.assertValidAddress(address, 'read');

    const contract = new Contract(this.client.contractId);
    const call = contract.call(
      'is_whitelisted',
      nativeToScVal(address, { type: 'address' }),
    );

    const result = await this.client.runNetworkOperation(() =>
      this.client.rpcServer.simulateTransaction({
        // Preserve the existing SDK adapter for the read-only invocation.
        transaction: call as any,
      } as any),
    );

    if (!rpc.Api.isSimulationSuccess(result) || !result.result) {
      return null;
    }

    const decoded: unknown = parseSorobanResult(result.result.retval as any);
    return typeof decoded === 'boolean' ? decoded : null;
  }

  /**
   * Compatibility boolean query for existing SDK consumers.
   *
   * A confirmed `true` remains true. A confirmed `false` or unavailable
   * simulation remains false for backwards compatibility. Prefer
   * `getComplianceStatus()` when callers must distinguish those cases.
   */
  public async checkWhitelist(address: string): Promise<boolean> {
    return (await this.readWhitelist(address)) === true;
  }

  /**
   * Returns the protocol whitelist state without overstating an unavailable
   * read as a compliance decision.
   */
  public async getComplianceStatus(
    address: string,
  ): Promise<ComplianceStatusSnapshot> {
    this.assertValidAddress(address, 'read');
    const observedAt = new Date().toISOString();

    try {
      const whitelisted = await this.readWhitelist(address);

      if (whitelisted === true) {
        return {
          address,
          status: 'approved',
          code: 'WHITELIST_APPROVED',
          eligible: true,
          observedAt,
        };
      }

      if (whitelisted === false) {
        return {
          address,
          status: 'not-approved',
          code: 'WHITELIST_NOT_APPROVED',
          eligible: false,
          observedAt,
        };
      }

      return {
        address,
        status: 'unavailable',
        code: 'READ_UNAVAILABLE',
        eligible: null,
        observedAt,
      };
    } catch (error) {
      if (
        error instanceof ComplianceLifecycleError &&
        error.code === 'INVALID_ADDRESS'
      ) {
        throw error;
      }

      return {
        address,
        status: 'unavailable',
        code: 'READ_UNAVAILABLE',
        eligible: null,
        observedAt,
      };
    }
  }

  /**
   * Describes the lifecycle capabilities present in this SDK build.
   *
   * This is a capability/configuration diagnostic only. It does not query an
   * investor's whitelist state and it is not legal/KYC advice.
   */
  public diagnoseLifecycle(): ComplianceLifecycleDiagnostic {
    return {
      module: 'available',
      read: {
        supported: true,
        contractMethod: 'is_whitelisted',
      },
      adminUpdate: {
        supported: false,
        requiresSigner: true,
        reasonCode: 'CONTRACT_WRITE_METHOD_UNAVAILABLE',
      },
      signerConfigured: this.client.keypair !== undefined,
      legalStatus: 'not-assessed',
    };
  }

  /**
   * Explicitly gated admin mutation path.
   *
   * The current SDK source has no verified contract whitelist-write method.
   * Requiring a signer first preserves the mutating-call security boundary,
   * then the method fails with a typed unsupported-operation error instead of
   * inventing a Soroban ABI call that could target the wrong function.
   */
  public async updateWhitelist(
    address: string,
    _approved: boolean,
  ): Promise<never> {
    this.assertValidAddress(address, 'admin-update');

    if (!this.client.keypair) {
      throw new ComplianceLifecycleError(
        'SIGNER_REQUIRED',
        'admin-update',
        'A signer is required before attempting a compliance admin update.',
      );
    }

    throw new ComplianceLifecycleError(
      'ADMIN_UPDATE_UNSUPPORTED',
      'admin-update',
      'This SDK build does not expose a verified contract whitelist-write method.',
    );
  }

  private assertValidAddress(
    address: string,
    operation: 'read' | 'admin-update',
  ): void {
    if (
      typeof address !== 'string' ||
      !StrKey.isValidEd25519PublicKey(address)
    ) {
      throw new ComplianceLifecycleError(
        'INVALID_ADDRESS',
        operation,
        'Compliance operations require a valid Stellar account address.',
      );
    }
  }
}
