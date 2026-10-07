import { Contract, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import type { AegisClient } from './client';
import { AssetTokenisationError } from './errors/asset-tokenisation';
import {
  AssetIssuanceConfiguration,
  AssetLifecycleStatus,
  AssetReadinessBlocker,
  AssetTokenisationReadiness,
  RwaAssetMetadata,
  TokenisationAmount,
} from './types/asset-tokenisation';
import { parseSorobanResult } from './utils/xdr-parser';

/**
 * Typed helpers for inspecting and preparing the current RWA asset lifecycle.
 *
 * The deployed Aegis contract has no separate "register_asset" entry point.
 * Asset configuration is metadata + lifecycle state, while issuance is
 * performed by "mint_asset".
 */
export class AssetTokenisationModule {
  private readonly client: AegisClient;

  constructor(client: AegisClient) {
    this.client = client;
  }

  public validateMetadata(input: unknown): RwaAssetMetadata {
    const record = this.toRecord(input, 'asset metadata');
    const name = this.requireString(record.name, 'name').trim();
    const symbol = this.requireString(record.symbol, 'symbol').trim();
    const uri = this.requireString(record.uri, 'uri').trim();

    if (!name || !symbol) {
      throw new AssetTokenisationError(
        'Asset metadata requires non-empty name and symbol values.',
        'INVALID_METADATA',
      );
    }

    return { name, symbol, uri };
  }

  public async getMetadata(): Promise<RwaAssetMetadata> {
    const raw = await this.readContractValue('get_asset_metadata');
    const record = this.toRecord(raw, 'contract asset metadata');

    return {
      name: this.requireString(record.name, 'name'),
      symbol: this.requireString(record.symbol, 'symbol'),
      uri: this.requireString(record.uri, 'uri'),
    };
  }

  public async getIssuanceConfiguration(): Promise<AssetIssuanceConfiguration> {
    const [
      lifecycleRaw,
      pausedRaw,
      totalSupplyRaw,
      supplyCapRaw,
      holdingCapRaw,
    ] = await Promise.all([
      this.readContractValue('get_asset_status'),
      this.readContractValue('is_paused'),
      this.readContractValue('get_total_supply'),
      this.readContractValue('get_supply_cap'),
      this.readContractValue('get_holding_cap'),
    ]);

    return {
      lifecycleStatus: this.normalizeLifecycleStatus(lifecycleRaw),
      contractPaused: this.normalizeBoolean(pausedRaw, 'is_paused'),
      totalSupply: this.normalizeIntegerString(totalSupplyRaw, 'get_total_supply'),
      supplyCap: this.normalizeIntegerString(supplyCapRaw, 'get_supply_cap'),
      holdingCap: this.normalizeIntegerString(holdingCapRaw, 'get_holding_cap'),
    };
  }

  public async checkReadiness(): Promise<AssetTokenisationReadiness> {
    const [metadata, issuance] = await Promise.all([
      this.getMetadata(),
      this.getIssuanceConfiguration(),
    ]);

    const blockers: AssetReadinessBlocker[] = [];

    if (!metadata.name.trim() || !metadata.symbol.trim()) {
      blockers.push({
        code: 'METADATA_INCOMPLETE',
        message: 'Asset name and symbol must be configured before issuance.',
      });
    }

    if (issuance.contractPaused) {
      blockers.push({
        code: 'CONTRACT_PAUSED',
        message: 'The contract-wide pause currently blocks issuance.',
      });
    }

    if (issuance.lifecycleStatus !== 'active') {
      blockers.push({
        code: 'ASSET_NOT_ACTIVE',
        message: `Asset lifecycle is ${issuance.lifecycleStatus}; issuance requires active.`,
      });
    }

    return {
      ready: blockers.length === 0,
      metadata,
      issuance,
      blockers,
      checkedAt: new Date().toISOString(),
      protocolOnly: true,
    };
  }

  /** Build the current contract's update_asset_metadata invocation only. */
  public buildMetadataUpdateOperation(
    caller: string,
    metadata: RwaAssetMetadata,
  ) {
    const valid = this.validateMetadata(metadata);
    const contract = new Contract(this.client.contractId);

    return contract.call(
      'update_asset_metadata',
      this.addressScVal(caller, 'caller'),
      nativeToScVal(valid.name),
      nativeToScVal(valid.symbol),
      nativeToScVal(valid.uri),
    );
  }

  /** Build the current contract's mint_asset invocation only. */
  public buildMintOperation(
    caller: string,
    recipient: string,
    amount: TokenisationAmount,
  ) {
    const normalizedAmount = this.normalizePositiveAmount(amount);
    const contract = new Contract(this.client.contractId);

    return contract.call(
      'mint_asset',
      this.addressScVal(caller, 'caller'),
      this.addressScVal(recipient, 'recipient'),
      nativeToScVal(normalizedAmount, { type: 'i128' }),
    );
  }

  private async readContractValue(method: string): Promise<unknown> {
    const contract = new Contract(this.client.contractId);
    const call = contract.call(method);

    let result;
    try {
      result = await this.client.runNetworkOperation(() =>
        this.client.rpcServer.simulateTransaction({
          transaction: call as any,
        } as any)
      );
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      throw new AssetTokenisationError(
        `Asset tokenisation RPC read failed for ${method}.`,
        'RPC_FAILURE',
        cause,
      );
    }

    if (!rpc.Api.isSimulationSuccess(result) || !result.result) {
      throw new AssetTokenisationError(
        `Contract read ${method} did not return a successful result.`,
        'INVALID_CONTRACT_RESPONSE',
      );
    }

    try {
      return parseSorobanResult(result.result.retval as any);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      throw new AssetTokenisationError(
        `Contract read ${method} returned an undecodable result.`,
        'INVALID_CONTRACT_RESPONSE',
        cause,
      );
    }
  }

  private toRecord(value: unknown, label: string): Record<string, unknown> {
    if (value instanceof Map) {
      return Object.fromEntries(value.entries()) as Record<string, unknown>;
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    throw new AssetTokenisationError(
      `Invalid ${label} response.`,
      'INVALID_CONTRACT_RESPONSE',
    );
  }

  private requireString(value: unknown, field: string): string {
    if (typeof value !== 'string') {
      throw new AssetTokenisationError(
        `Asset metadata field "${field}" must be a string.`,
        'INVALID_METADATA',
      );
    }
    return value;
  }

  private normalizeBoolean(value: unknown, method: string): boolean {
    if (typeof value !== 'boolean') {
      throw new AssetTokenisationError(
        `Contract read ${method} returned a non-boolean value.`,
        'INVALID_CONTRACT_RESPONSE',
      );
    }
    return value;
  }

  private normalizeIntegerString(value: unknown, method: string): string {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
    if (typeof value === 'string' && /^-?\d+$/.test(value)) return value;

    throw new AssetTokenisationError(
      `Contract read ${method} returned a non-integer value.`,
      'INVALID_CONTRACT_RESPONSE',
    );
  }

  private normalizeLifecycleStatus(value: unknown): AssetLifecycleStatus {
    const numeric: Record<number, AssetLifecycleStatus> = {
      0: 'draft',
      1: 'active',
      2: 'paused',
      3: 'retired',
      4: 'blocked',
    };

    if (typeof value === 'number' && Number.isInteger(value) && value in numeric) {
      return numeric[value];
    }
    if (typeof value === 'bigint') {
      const asNumber = Number(value);
      if (Number.isSafeInteger(asNumber) && asNumber in numeric) {
        return numeric[asNumber];
      }
    }

    let candidate: string | undefined;
    if (typeof value === 'string') {
      candidate = value;
    } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      candidate = value[0];
    } else if (typeof value === 'object' && value !== null) {
      const keys = value instanceof Map
        ? Array.from(value.keys()).map(String)
        : Object.keys(value as Record<string, unknown>);
      if (keys.length === 1) candidate = keys[0];
    }

    const normalized = candidate?.toLowerCase();
    if (
      normalized === 'draft' ||
      normalized === 'active' ||
      normalized === 'paused' ||
      normalized === 'retired' ||
      normalized === 'blocked'
    ) {
      return normalized;
    }

    throw new AssetTokenisationError(
      'Contract returned an unknown asset lifecycle status.',
      'INVALID_CONTRACT_RESPONSE',
    );
  }

  private normalizePositiveAmount(amount: TokenisationAmount): bigint {
    try {
      const normalized =
        typeof amount === 'bigint'
          ? amount
          : /^\d+$/.test(amount)
          ? BigInt(amount)
          : 0n;

      if (normalized <= 0n) {
        throw new AssetTokenisationError(
          'Mint amount must be a positive integer.',
          'INVALID_AMOUNT',
        );
      }
      return normalized;
    } catch (error) {
      if (error instanceof AssetTokenisationError) throw error;
      throw new AssetTokenisationError(
        'Mint amount must be a positive integer.',
        'INVALID_AMOUNT',
      );
    }
  }

  private addressScVal(address: string, field: string) {
    if (!address || typeof address !== 'string') {
      throw new AssetTokenisationError(
        `Asset tokenisation ${field} address is required.`,
        'INVALID_ADDRESS',
      );
    }

    try {
      return nativeToScVal(address, { type: 'address' });
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      throw new AssetTokenisationError(
        `Asset tokenisation ${field} address is invalid.`,
        'INVALID_ADDRESS',
        cause,
      );
    }
  }
}
