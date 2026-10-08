import { rpc, Keypair } from '@stellar/stellar-sdk';
import { ComplianceModule } from './compliance';
import { AssetModule } from './asset';
import { InvestorModule } from './investor/portfolio';
import { RoleModule } from './role';
import { EventsModule } from './events/module';
import { AegisClientConfig, resolveClientConfig } from './config/validate';
import { classifyNetworkFailure } from './network/failures';
import {
  buildNetworkFailureDiagnostic,
  NetworkFailureDiagnostic,
} from './diagnostics/network';
import {
  buildSdkDiagnosticsReport,
  AegisSdkDiagnosticsReport,
  BuildSdkDiagnosticsInput,
  SdkDiagnosticsOptions,
} from './diagnostics/report';

export type { AegisClientConfig };

export class AegisClient {
  private readonly diagnosticsConfig: Omit<
    BuildSdkDiagnosticsInput,
    'complianceAvailable'
  >;

  public rpcServer: rpc.Server;
  public contractId: string;
  public networkPassphrase: string;
  public keypair?: Keypair;

  // Modules
  public compliance: ComplianceModule;
  public asset: AssetModule;
  public investor: InvestorModule;
  public role: RoleModule;
  public events: EventsModule;

  /**
   * Initializes the Aegis RWA SDK Client.
   * @param config AegisClientConfig object. Provide either an `environment` preset
   * (`testnet` | `local` | `mainnet`) or explicit `rpcUrl`/`networkPassphrase` values.
   */
  constructor(config: AegisClientConfig) {
    const resolved = resolveClientConfig(config);
    const allowHttp = resolved.rpcUrl.startsWith('http://');

    this.diagnosticsConfig = {
      environment: config.environment,
      rpcUrl: resolved.rpcUrl,
      networkPassphrase: resolved.networkPassphrase,
      contractId: resolved.contractId,
      signerConfigured: resolved.keypair !== undefined,
    };

    this.rpcServer = new rpc.Server(resolved.rpcUrl, { allowHttp });
    this.contractId = resolved.contractId;
    this.networkPassphrase = resolved.networkPassphrase;

    // TODO: Add support for browser-based wallet providers (Freighter/Albedo)
    this.keypair = resolved.keypair;

    this.compliance = new ComplianceModule(this);
    this.asset = new AssetModule(this);
    this.investor = new InvestorModule(this);
    this.role = new RoleModule(this);
    this.events = new EventsModule(this);
  }

  /**
   * Helper to verify the client is configured for write operations.
   */
  public requireSigner(): Keypair {
    if (!this.keypair) {
      throw new Error("Transaction signing requires a Keypair to be configured on the AegisClient.");
    }
    return this.keypair;
  }

  /**
   * Runs an SDK network operation behind the stable network-failure boundary.
   */
  public async runNetworkOperation<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw classifyNetworkFailure(error);
    }
  }

  /**
   * Builds a serialisable, redacted diagnostic for support and dashboard UI.
   */
  public diagnoseNetworkFailure(error: unknown): NetworkFailureDiagnostic {
    return buildNetworkFailureDiagnostic(error);
  }

  /**
   * Builds a deterministic support report that omits raw RPC URLs, network
   * passphrases, contract identifiers, signer material, and raw error details.
   *
   * This reports configuration/module readiness only. It does not perform live
   * RPC or compliance checks and must not be treated as legal/KYC status.
   */
  public buildDiagnosticsReport(
    options: SdkDiagnosticsOptions = {},
  ): AegisSdkDiagnosticsReport {
    return buildSdkDiagnosticsReport(
      {
        ...this.diagnosticsConfig,
        complianceAvailable: Boolean(this.compliance),
      },
      options,
    );
  }
}
