import { rpc, Keypair } from '@stellar/stellar-sdk';
import { ComplianceModule } from './compliance';
import { AssetModule } from './asset';
import { InvestorModule } from './investor/portfolio';
import { RoleModule } from './role';
import { EventsModule } from './events/module';
import { AegisClientConfig, resolveClientConfig } from './config/validate';
import { AegisSdkError } from './errors/public';
import { classifyNetworkFailure } from './network/failures';
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

  public compliance: ComplianceModule;
  public asset: AssetModule;
  public investor: InvestorModule;
  public role: RoleModule;
  public events: EventsModule;

  constructor(config: AegisClientConfig) {
    const resolved = resolveClientConfig(config);
    const allowHttp = resolved.rpcUrl.startsWith('http://');

    this.rpcServer = new rpc.Server(resolved.rpcUrl, { allowHttp });
    this.contractId = resolved.contractId;
    this.networkPassphrase = resolved.networkPassphrase;
    this.keypair = resolved.keypair;

    this.compliance = new ComplianceModule(this);
    this.asset = new AssetModule(this);
    this.investor = new InvestorModule(this);
    this.role = new RoleModule(this);
    this.events = new EventsModule(this);
  }

  public requireSigner(): Keypair {
    if (!this.keypair) {
      throw new AegisSdkError({
        code: 'TRANSACTION_SIGNER_REQUIRED',
        category: 'transaction',
        message:
          'Transaction signing requires a Keypair to be configured on the AegisClient.',
      });
    }
    return this.keypair;
  }

  public async runNetworkOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw classifyNetworkFailure(error);
    }
  }

  public diagnoseNetworkFailure(error: unknown): NetworkFailureDiagnostic {
    return buildNetworkFailureDiagnostic(error);
  }
}
