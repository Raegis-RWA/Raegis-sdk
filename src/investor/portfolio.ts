import { Contract, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { AegisClient } from '../client';
import {
  InvestorPortfolio,
  PortfolioStatus,
  AssetHolding,
  AssetMetadata,
  FetchPortfolioOptions,
  TransferEligibility,
} from '../types/portfolio';
import {
  InvestorEligibilityExplanation,
  InvestorEligibilityExplanationInput,
} from '../types/eligibility';
import { PortfolioError } from '../errors/portfolio';
import { parseSorobanResult } from '../utils/xdr-parser';
import { buildInvestorEligibilityExplanation } from './eligibility';

/**
 * Module for querying and processing investor portfolio read models.
 */
export class InvestorModule {
  private client: AegisClient;

  constructor(client: AegisClient) {
    this.client = client;
  }

  /**
   * Explains investor eligibility from the live compliance whitelist check.
   *
   * Returns a frozen UI explanation with a reason code, safe message, and
   * suggested next action. Does not imply a legal or regulatory guarantee —
   * see `explanation.disclaimer`. A bare whitelist `false` maps to `blocked`;
   * pass `isKycRevoked` through {@link explainEligibilityFromSignals} when a
   * revoke is known from another source.
   */
  public async explainEligibility(
    investorAddress: string,
  ): Promise<InvestorEligibilityExplanation> {
    if (!investorAddress || typeof investorAddress !== 'string') {
      return buildInvestorEligibilityExplanation({
        address: investorAddress || '',
        invalidAddress: true,
      });
    }

    try {
      const isKycApproved =
        await this.client.compliance.checkWhitelist(investorAddress);
      return buildInvestorEligibilityExplanation({
        address: investorAddress,
        isKycApproved,
      });
    } catch {
      // Raw RPC/network messages are intentionally omitted so secrets and
      // provider payloads never reach dashboard copy.
      return buildInvestorEligibilityExplanation({
        address: investorAddress,
        complianceQueryFailed: true,
      });
    }
  }

  /**
   * Maps already-known compliance signals into an eligibility explanation
   * without contacting RPC. Useful when a portfolio or role result is already
   * in hand, or when an off-chain KYC system reports a revoke.
   */
  public explainEligibilityFromSignals(
    input: InvestorEligibilityExplanationInput,
  ): InvestorEligibilityExplanation {
    return buildInvestorEligibilityExplanation(input);
  }

  /**
   * Fetches the complete portfolio read model for a given investor address.
   *
   * @param investorAddress Stellar public key of the investor.
   * @param options Configuration options for fetching the portfolio.
   * @returns A promise resolving to the InvestorPortfolio read model.
   */
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

    // 1. Check Compliance / KYC Whitelist status safely
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

    // 2. Determine asset list to query
    const targetAssetContracts = options.assetContractIds && options.assetContractIds.length > 0
      ? options.assetContractIds
      : [this.client.contractId];

    const holdings: AssetHolding[] = [];

    // 3. Query holdings for each asset contract
    for (const contractId of targetAssetContracts) {
      try {
        const holding = await this.fetchAssetHolding(
          contractId,
          investorAddress,
          isKycApproved,
          options.includeMetadata !== false
        );
        if (holding) {
          holdings.push(holding);
        }
      } catch (error) {
        // If an individual asset query fails, we mark its eligibility as unavailable
        // while preserving overall portfolio resilience.
        const fallbackHolding: AssetHolding = {
          assetId: contractId,
          balance: '0',
          formattedBalance: '0.00',
          metadata: {
            symbol: 'UNKNOWN',
            name: 'Unavailable Asset',
            decimals: 7,
            isRwa: true,
            contractId,
          },
          isCompliant: isKycApproved,
          transferEligibility: {
            isEligible: false,
            reason: 'Asset state query failed.',
            code: 'QUERY_FAILED',
          },
        };
        holdings.push(fallbackHolding);
      }
    }

    // 4. Calculate counts & determine portfolio status
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

  /**
   * Helper to fetch balance and metadata for a single asset contract.
   */
  private async fetchAssetHolding(
    contractId: string,
    investorAddress: string,
    isKycApproved: boolean,
    includeMetadata: boolean
  ): Promise<AssetHolding | null> {
    const contract = new Contract(contractId);
    const call = contract.call(
      'balance',
      nativeToScVal(investorAddress, { type: 'address' })
    );

    let balanceRaw = '0';

    try {
      const result = await this.client.rpcServer.simulateTransaction({
        transaction: call as any,
      } as any);

      if (rpc.Api.isSimulationSuccess(result) && result.result) {
        const parsed = parseSorobanResult(result.result.retval as any);
        balanceRaw = parsed !== null && parsed !== undefined ? String(parsed) : '0';
      }
    } catch {
      balanceRaw = '0';
    }

    const metadata: AssetMetadata = includeMetadata
      ? await this.fetchAssetMetadata(contractId)
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

  /**
   * Helper to fetch asset metadata (symbol, name, decimals, category).
   */
  private async fetchAssetMetadata(contractId: string): Promise<AssetMetadata> {
    return {
      symbol: 'AEGIS-RWA',
      name: 'Aegis Tokenized Real Estate',
      decimals: 7,
      isRwa: true,
      category: 'Real Estate',
      contractId,
    };
  }

  /**
   * Helper to format raw integer balance string into decimal string representation.
   */
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

  /**
   * Helper to safely return an 'unavailable' portfolio when RPC or address error occurs.
   */
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
