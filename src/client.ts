import { rpc, Keypair } from '@stellar/stellar-sdk';
import { ComplianceModule } from './compliance';
import { AssetModule } from './asset';
import { InvestorModule } from './investor/portfolio';
import { RoleModule } from './role';
import { EventsModule } from './events/module';
import { AegisClientConfig, resolveClientConfig } from './config/validate';
import { classifyNetworkFailure } from './network/failures';
import {
  buildConfigDiagnostic,
  ConfigDiagnostic,
} from './diagnostics/config';
import {
  buildNetworkFailureDiagnostic,
  NetworkFailureDiagnostic,
} from './diagnostics/network';

export type { AegisClientConfig };

export class AegisClient {
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

  /** Safe configuration summary captured at construction. Never includes secrets. */
  private readonly configDiagnostic: ConfigDiagnostic;

  /**
   * Initializes the Aegis RWA SDK Client.
   * @param config AegisClientConfig object. Provide either an `environment` preset
   * (`testnet` | `local` | `mainnet`) or explicit `rpcUrl`/`networkPassphrase` values.
   */
  constructor(config: AegisClientConfig) {
    const resolved = resolveClientConfig(config);
    const allowHttp = resolved.rpcUrl.startsWith('http://');

    this.rpcServer = new rpc.Server(resolved.rpcUrl, { allowHttp });
    this.contractId = resolved.contractId;
    this.networkPassphrase = resolved.networkPassphrase;

    // TODO: Add support for browser-based wallet providers (Freighter/Albedo)
    this.keypair = resolved.keypair;

    // Capture the diagnostic from the original input so environment / allowMainnet
    // survive even though they are not retained as public fields.
    this.configDiagnostic = buildConfigDiagnostic(config);

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
   * Returns a frozen, redacted configuration diagnostic safe for GitHub support
   * requests. Prefer this over logging the client, Keypair, or raw config.
   */
  public diagnoseConfiguration(): ConfigDiagnostic {
    return this.configDiagnostic;
  }
}
