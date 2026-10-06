import type { AdminActionReceipt, AdminActionReceiptInput } from './admin-receipt';
import type { AegisContractEvent } from './contract-event';

export type AegisActivitySource = 'contract-event' | 'admin-receipt';

export type AegisActivityKind =
  | 'compliance'
  | 'mint'
  | 'transfer'
  | 'admin'
  | 'asset-metadata'
  | 'unknown';

export type AegisActivityStatus =
  | 'confirmed'
  | 'pending'
  | 'failed'
  | 'unknown';

export interface AegisActivityBase {
  id: string;
  source: AegisActivitySource;
  kind: AegisActivityKind;
  status: AegisActivityStatus;
  transactionHash: string | null;
  observedAt: string;
  summary: string;
  ledger?: number;
  contractId?: string;
}

export interface ComplianceActivity extends AegisActivityBase {
  kind: 'compliance';
  action: 'whitelist_add' | 'whitelist_remove';
  address: string;
  actor?: string;
}

export interface MintActivity extends AegisActivityBase {
  kind: 'mint';
  recipient: string;
  amount: string;
  assetId?: string;
  actor?: string;
}

export interface TransferActivity extends AegisActivityBase {
  kind: 'transfer';
  from: string;
  to: string;
  amount: string;
}

export interface AdminActivity extends AegisActivityBase {
  kind: 'admin';
  action: 'protocol_pause' | 'protocol_unpause' | 'asset_register';
  targetId?: string;
  actor?: string;
}

export interface AssetMetadataActivity extends AegisActivityBase {
  kind: 'asset-metadata';
  assetId: string;
  symbol: string;
  name: string;
  decimals: number;
  category?: string;
  isRwa?: boolean;
}

export interface UnknownActivity extends AegisActivityBase {
  kind: 'unknown';
  reason?: string;
}

export type AegisActivity =
  | ComplianceActivity
  | MintActivity
  | TransferActivity
  | AdminActivity
  | AssetMetadataActivity
  | UnknownActivity;

export type AdminActionReceiptUnion =
  AdminActionReceiptInput extends infer TInput
    ? TInput extends AdminActionReceiptInput
      ? AdminActionReceipt<TInput>
      : never
    : never;

export type AegisActivityInput = AegisContractEvent | AdminActionReceiptUnion;

export interface MapAegisHistoryOptions {
  /**
   * Include decoded contract events whose kind is `unknown`.
   * Defaults to true so callers do not silently lose forward-compatible data.
   */
  includeUnknownEvents?: boolean;
}
