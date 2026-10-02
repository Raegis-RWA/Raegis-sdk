import { Keypair } from '@stellar/stellar-sdk';
import {
  InvestorPortfolio,
  PortfolioStatus,
  AssetHolding,
  AssetMetadata,
  FetchPortfolioOptions,
  TransferEligibility,
} from '../types/portfolio';
import {
  ComplianceBatchOptions,
  ComplianceBatchResult,
} from '../types/compliance-batch';
import { executeComplianceBatch } from '../compliance/batch';
import {
  MOCK_CONTRACT_ID,
  DEFAULT_MOCK_ASSET_METADATA,
  buildMockTxHash,
} from './fixtures';

export interface MockTransactionReceipt {
  hash: string;
  type: 'mint' | 'transfer';
  from: string;
  to: string;
  amount: number;
  timestamp: string;
}

export interface MockAegisClientConfig {
  contractId?: string;
  keypair?: Keypair;
  /** When true, compliance checks throw instead of returning a boolean. */
  simulateComplianceFailure?: boolean;
}

type BalanceStore = Map<string, Map<string, string>>;

/**
 * In-memory mock of the Aegis SDK client for tests and dashboard examples.
 * Does not perform RPC calls or require network access.
 */
export class MockAegisClient {
  public contractId: string;
  public keypair?: Keypair;

  public compliance: MockComplianceModule;
  public asset: MockAssetModule;
  public investor: MockInvestorModule;

  /** Submitted mint/transfer receipts for test assertions. */
  public readonly transactions: MockTransactionReceipt[] = [];

  private whitelist: Map<string, boolean> = new Map();
  private balances: BalanceStore = new Map();
  private assetMetadata: Map<string, AssetMetadata> = new Map();
  private simulateComplianceFailure = false;
  private txSequence = 0;

  constructor(config: MockAegisClientConfig = {}) {
    this.contractId = config.contractId ?? MOCK_CONTRACT_ID;
    this.keypair = config.keypair;
    this.simulateComplianceFailure = config.simulateComplianceFailure ?? false;

    this.assetMetadata.set(this.contractId, {
      ...DEFAULT_MOCK_ASSET_METADATA,
      contractId: this.contractId,
    });

    this.compliance = new MockComplianceModule(this);
    this.asset = new MockAssetModule(this);
    this.investor = new MockInvestorModule(this);
  }

  public requireSigner(): Keypair {
    if (!this.keypair) {
      throw new Error(
        'Transaction signing requires a Keypair to be configured on the MockAegisClient.'
      );
    }
    return this.keypair;
  }

  /** Registers or updates whitelist status for an address. */
  public setWhitelisted(address: string, whitelisted: boolean): void {
    this.whitelist.set(address, whitelisted);
  }

  /** Sets a raw integer balance string for an investor and asset contract. */
  public setBalance(
    investorAddress: string,
    balance: string | bigint,
    contractId: string = this.contractId
  ): void {
    if (!this.balances.has(investorAddress)) {
      this.balances.set(investorAddress, new Map());
    }
    this.balances.get(investorAddress)!.set(contractId, String(balance));
  }

  /** Overrides metadata returned for a given asset contract. */
  public setAssetMetadata(contractId: string, metadata: AssetMetadata): void {
    this.assetMetadata.set(contractId, { ...metadata, contractId });
  }

  /** Clears in-memory state and transaction history. */
  public reset(): void {
    this.whitelist.clear();
    this.balances.clear();
    this.transactions.length = 0;
    this.txSequence = 0;
    this.simulateComplianceFailure = false;
    this.assetMetadata.clear();
    this.assetMetadata.set(this.contractId, {
      ...DEFAULT_MOCK_ASSET_METADATA,
      contractId: this.contractId,
    });
  }

  /** @internal */
  public _isWhitelisted(address: string): boolean {
    return this.whitelist.get(address) ?? false;
  }

  /** @internal */
  public _shouldSimulateComplianceFailure(): boolean {
    return this.simulateComplianceFailure;
  }

  /** @internal */
  public _setSimulateComplianceFailure(simulate: boolean): void {
    this.simulateComplianceFailure = simulate;
  }

  /** @internal */
  public _getBalance(investorAddress: string, contractId: string): string {
    return this.balances.get(investorAddress)?.get(contractId) ?? '0';
  }

  /** @internal */
  public _adjustBalance(
    investorAddress: string,
    contractId: string,
    delta: bigint
  ): void {
    const current = BigInt(this._getBalance(investorAddress, contractId));
    const next = current + delta;
    if (next < 0n) {
      throw new Error('Insufficient balance for transfer.');
    }
    this.setBalance(investorAddress, next, contractId);
  }

  /** @internal */
  public _getAssetMetadata(contractId: string): AssetMetadata {
    return (
      this.assetMetadata.get(contractId) ?? {
        symbol: 'RWA',
        name: 'Real World Asset',
        decimals: 7,
        isRwa: true,
        contractId,
      }
    );
  }

  /** @internal */
  public _recordTransaction(
    type: 'mint' | 'transfer',
    from: string,
    to: string,
    amount: number
  ): string {
    this.txSequence += 1;
    const hash = buildMockTxHash(this.txSequence, type);
    this.transactions.push({
      hash,
      type,
      from,
      to,
      amount,
      timestamp: new Date().toISOString(),
    });
    return hash;
  }
}

export class MockComplianceModule {
  private client: MockAegisClient;

  constructor(client: MockAegisClient) {
    this.client = client;
  }

  public async checkWhitelist(address: string): Promise<boolean> {
    if (this.client._shouldSimulateComplianceFailure()) {
      throw new Error('Mock compliance RPC failure.');
    }
    return this.client._isWhitelisted(address);
  }

  public async checkWhitelistBatch(
    addresses: readonly string[],
    options: ComplianceBatchOptions = {},
  ): Promise<ComplianceBatchResult> {
    return executeComplianceBatch(
      addresses,
      (address) => this.checkWhitelist(address),
      options,
    );
  }
}

export class MockAssetModule {
  private client: MockAegisClient;

  constructor(client: MockAegisClient) {
    this.client = client;
  }

  public async mint(to: string, amount: number): Promise<string> {
    const signer = this.client.requireSigner();
    const scaledAmount = BigInt(Math.trunc(amount));

    this.client._adjustBalance(to, this.client.contractId, scaledAmount);

    return this.client._recordTransaction(
      'mint',
      signer.publicKey(),
      to,
      amount
    );
  }

  public async transfer(to: string, amount: number): Promise<string> {
    const signer = this.client.requireSigner();
    const scaledAmount = BigInt(Math.trunc(amount));

    if (!this.client._isWhitelisted(signer.publicKey())) {
      throw new Error('Transfer transaction failed: sender is not whitelisted.');
    }
    if (!this.client._isWhitelisted(to)) {
      throw new Error('Transfer transaction failed: recipient is not whitelisted.');
    }

    this.client._adjustBalance(
      signer.publicKey(),
      this.client.contractId,
      -scaledAmount
    );
    this.client._adjustBalance(to, this.client.contractId, scaledAmount);

    return this.client._recordTransaction(
      'transfer',
      signer.publicKey(),
      to,
      amount
    );
  }
}

export class MockInvestorModule {
  private client: MockAegisClient;

  constructor(client: MockAegisClient) {
    this.client = client;
  }

  public async getPortfolio(
    investorAddress: string,
    options: FetchPortfolioOptions = {}
  ): Promise<InvestorPortfolio> {
    const fetchedAt = new Date().toISOString();

    if (!investorAddress || typeof investorAddress !== 'string') {
      return this.buildUnavailablePortfolio(
        investorAddress || '',
        'Invalid investor address provided.',
        fetchedAt
      );
    }

    let isKycApproved = false;
    let isBlocked = false;

    try {
      isKycApproved = await this.client.compliance.checkWhitelist(investorAddress);
      isBlocked = !isKycApproved;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return this.buildUnavailablePortfolio(
        investorAddress,
        `Compliance status query failed: ${errorMsg}`,
        fetchedAt
      );
    }

    const targetAssetContracts =
      options.assetContractIds && options.assetContractIds.length > 0
        ? options.assetContractIds
        : [this.client.contractId];

    const holdings: AssetHolding[] = [];

    for (const contractId of targetAssetContracts) {
      const holding = this.buildAssetHolding(
        contractId,
        investorAddress,
        isKycApproved,
        options.includeMetadata !== false
      );
      holdings.push(holding);
    }

    const totalHoldingsCount = holdings.length;
    const compliantHoldingsCount = holdings.filter((h) => h.isCompliant).length;
    const activeHoldings = holdings.filter((h) => BigInt(h.balance) > 0n);

    let status: PortfolioStatus;
    if (isBlocked) {
      status = 'blocked';
    } else if (activeHoldings.length === 0) {
      status = 'empty';
    } else {
      status = 'active';
    }

    return {
      investorAddress,
      status,
      totalHoldingsCount,
      compliantHoldingsCount,
      holdings,
      isKycApproved,
      isBlocked,
      fetchedAt,
    };
  }

  private buildAssetHolding(
    contractId: string,
    investorAddress: string,
    isKycApproved: boolean,
    includeMetadata: boolean
  ): AssetHolding {
    const balanceRaw = this.client._getBalance(investorAddress, contractId);
    const metadata: AssetMetadata = includeMetadata
      ? this.client._getAssetMetadata(contractId)
      : {
          symbol: 'RWA',
          name: 'Real World Asset',
          decimals: 7,
          isRwa: true,
          contractId,
        };

    const formattedBalance = this.formatBalance(balanceRaw, metadata.decimals);
    const isEligible = isKycApproved && BigInt(balanceRaw) > 0n;

    const transferEligibility: TransferEligibility = {
      isEligible,
      reason: !isKycApproved
        ? 'Investor is not KYC approved.'
        : BigInt(balanceRaw) <= 0n
          ? 'Insufficient asset balance.'
          : undefined,
      code: !isKycApproved
        ? 'NOT_WHITELISTED'
        : BigInt(balanceRaw) <= 0n
          ? 'ZERO_BALANCE'
          : undefined,
    };

    return {
      assetId: contractId,
      balance: balanceRaw,
      formattedBalance,
      metadata,
      isCompliant: isKycApproved,
      transferEligibility,
    };
  }

  private formatBalance(rawBalance: string, decimals: number): string {
    try {
      const bigIntBal = BigInt(rawBalance);
      if (bigIntBal === 0n) return '0.00';

      const factor = BigInt(10 ** decimals);
      const integerPart = (bigIntBal / factor).toString();
      const fractionalPart = (bigIntBal % factor)
        .toString()
        .padStart(decimals, '0')
        .slice(0, 2);

      return `${integerPart}.${fractionalPart}`;
    } catch {
      return '0.00';
    }
  }

  private buildUnavailablePortfolio(
    investorAddress: string,
    errorReason: string,
    fetchedAt: string
  ): InvestorPortfolio {
    return {
      investorAddress,
      status: 'unavailable',
      totalHoldingsCount: 0,
      compliantHoldingsCount: 0,
      holdings: [],
      isKycApproved: false,
      isBlocked: true,
      fetchedAt,
      error: errorReason,
    };
  }
}

/**
 * Factory helper for creating a preconfigured mock client.
 */
export function createMockAegisClient(
  config: MockAegisClientConfig = {}
): MockAegisClient {
  return new MockAegisClient(config);
}
