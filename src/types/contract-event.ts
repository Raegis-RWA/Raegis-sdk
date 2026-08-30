/**
 * High-level categories for decoded Aegis contract events.
 */
import { xdr } from '@stellar/stellar-sdk';

export type ContractEventKind =
  | 'compliance'
  | 'mint'
  | 'transfer'
  | 'admin'
  | 'asset_metadata'
  | 'role'
  | 'unknown';

export interface ContractEventEnvelope {
  contractId?: string;
  txHash?: string;
  ledger?: number;
  inSuccessfulContractCall: boolean;
  eventName: string | null;
  decodedAt: string;
}

export interface ComplianceContractEvent extends ContractEventEnvelope {
  kind: 'compliance';
  action: 'whitelist_add' | 'whitelist_remove';
  address: string;
  admin?: string;
}

export interface MintContractEvent extends ContractEventEnvelope {
  kind: 'mint';
  to: string;
  amount: string;
  operator?: string;
  assetId?: string;
}

export interface TransferContractEvent extends ContractEventEnvelope {
  kind: 'transfer';
  from: string;
  to: string;
  amount: string;
}

export interface AdminContractEvent extends ContractEventEnvelope {
  kind: 'admin';
  action: 'protocol_pause' | 'protocol_unpause' | 'asset_register';
  contractId?: string;
  assetId?: string;
  admin?: string;
}

export interface AssetMetadataContractEvent extends ContractEventEnvelope {
  kind: 'asset_metadata';
  assetId: string;
  symbol: string;
  name: string;
  decimals: number;
  category?: string;
  isRwa?: boolean;
}

export interface UnknownContractEvent extends ContractEventEnvelope {
  kind: 'unknown';
  rawTopics: unknown[];
  rawValue: unknown;
  reason?: string;
}

export interface RoleContractEvent extends ContractEventEnvelope {
  kind: 'role';
  action: 'role_grant' | 'role_revoke';
  role: string;
  address: string;
  admin?: string;
}

export type AegisContractEvent =
  | ComplianceContractEvent
  | MintContractEvent
  | TransferContractEvent
  | AdminContractEvent
  | AssetMetadataContractEvent
  | RoleContractEvent
  | UnknownContractEvent;

/**
 * Input accepted by the contract event decoder.
 * Supports both raw Soroban RPC events (base64 topic/value strings)
 * and parsed `xdr.ScVal` instances from the Stellar SDK.
 */
export interface ContractEventInput {
  contractId?: string;
  txHash?: string;
  ledger?: number;
  inSuccessfulContractCall?: boolean;
  topic: Array<string | xdr.ScVal>;
  value: string | xdr.ScVal;
}

export interface DecodeContractEventOptions {
  /**
   * When true, decoding failures throw `EventDecodeError` instead of returning
   * an `unknown` event. Defaults to false (safe fallback).
   */
  strict?: boolean;
}
