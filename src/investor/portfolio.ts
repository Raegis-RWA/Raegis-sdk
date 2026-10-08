import { Contract, nativeToScVal, rpc, StrKey } from '@stellar/stellar-sdk';
import { AegisClient } from '../client';
import {
  InvestorPortfolio,
  PortfolioStatus,
  AssetHolding,
  AssetMetadata,
  FetchPortfolioOptions,
  TransferEligibility,
} from '../types/portfolio';
import { InvestorTransferEligibility } from '../types/transfer-eligibility';
import { PortfolioError } from '../errors/portfolio';
import { parseSorobanResult } from '../utils/xdr-parser';

/**
 * Module for querying and processing investor portfolio read models.
 */
export class InvestorModule {
  private client: AegisClient;

  constructor(client: AegisClient) {
    this.client = client;
  }

  /**
   * Performs a read-only protocol whitelist preflight for a proposed investor transfer.
   *
   * This does not check balances, sign, simulate, or submit a transfer. Contract
   * authorization remains authoritative.
   */
  public async checkTransferEligibility(
    source: string,
    destination: string,
    amount: number,
  ): Promise<InvestorTransferEligibility> {
    const observedAt = new Date().toISOString();
    const result = (
      state: InvestorTransferEligibility['state'],
      code: InvestorTransferEligibility['code'],
      reason?: string,
    ): InvestorTransferEligibility => ({
      source,
      destination,
      amount,
      state,
      isEligible: state === 'eligible',
      code,
      reason,
      observedAt,
    });

    if (typeof source !== 'string' || !StrKey.isValidEd25519PublicKey(source)) {
      return result('ineligible', 'INVALID_SOURCE_ADDRESS', 'Source must be a Stellar account public key.');
    }
    if (typeof destination !== 'string' || !StrKey.isValidEd25519PublicKey(destination)) {
      return result('ineligible', 'INVALID_DESTINATION_ADDRESS', 'Destination must be a Stellar account public key.');
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return result('ineligible', 'INVALID_AMOUNT', 'Amount must be a positive finite number.');
    }

    // Observation results can arrive through adapters or caches. Never treat a
    // response for another account, a malformed state, or a contradictory
    // whitelist boolean/code as proof that THIS account is approved.
    const observeVerified = async (address: string): Promise<
      'approved' | 'not_approved' | 'unknown' | 'unavailable'
    > => {
      try {
        const value = await this.client.compliance.observeWhitelist(address);
        if (!value || value.address !== address) return 'unknown';
        if (value.state === 'approved' &&
            value.isWhitelisted === true &&
            value.code === 'WHITELIST_APPROVED') return 'approved';
        if (value.state === 'not_approved' &&
            value.isWhitelisted === false &&
            value.code === 'WHITELIST_NOT_APPROVED') return 'not_approved';
        if (value.state === 'unavailable' &&
            value.isWhitelisted === null &&
            value.code === 'WHITELIST_QUERY_FAILED') return 'unavailable';
        return 'unknown';
      } catch {
        return 'unavailable';
      }
    };

    const sourceStatus = await observeVerified(source);
    if (sourceStatus === 'not_approved') {
      return result('ineligible', 'SOURCE_NOT_WHITELISTED', 'Source is not whitelisted by the protocol.');
    }
    if (sourceStatus === 'unknown') {
      return result('unknown', 'SOURCE_STATUS_UNKNOWN', 'Source whitelist status could not be determined.');
    }
    if (sourceStatus === 'unavailable') {
      return result('unavailable', 'SOURCE_QUERY_FAILED', 'Source whitelist query was unavailable.');
    }

    const destinationStatus = await observeVerified(destination);
    if (destinationStatus === 'not_approved') {
      return result('ineligible', 'DESTINATION_NOT_WHITELISTED', 'Destination is not whitelisted by the protocol.');
    }
    if (destinationStatus === 'unknown') {
      return result('unknown', 'DESTINATION_STATUS_UNKNOWN', 'Destination whitelist status could not be determined.');
    }
    if (destinationStatus === 'unavailable') {
      return result('unavailable', 'DESTINATION_QUERY_FAILED', 'Destination whitelist query was unavailable.');
    }

    return result('eligible', 'ELIGIBLE');
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
