export type AssetLifecycleStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'retired'
  | 'blocked';

export type TokenisationAmount = bigint | string;

export interface RwaAssetMetadata {
  name: string;
  symbol: string;
  /** Optional off-chain metadata URI. Empty means no URI is configured. */
  uri: string;
}

export interface AssetIssuanceConfiguration {
  lifecycleStatus: AssetLifecycleStatus;
  contractPaused: boolean;
  totalSupply: string;
  /** "0" means the protocol does not enforce a global supply cap. */
  supplyCap: string;
  /** "0" means the protocol does not enforce a per-investor holding cap. */
  holdingCap: string;
}

export type AssetReadinessBlockerCode =
  | 'METADATA_INCOMPLETE'
  | 'CONTRACT_PAUSED'
  | 'ASSET_NOT_ACTIVE';

export interface AssetReadinessBlocker {
  code: AssetReadinessBlockerCode;
  message: string;
}

export interface AssetTokenisationReadiness {
  ready: boolean;
  metadata: RwaAssetMetadata;
  issuance: AssetIssuanceConfiguration;
  blockers: AssetReadinessBlocker[];
  checkedAt: string;
  /** Protocol state only; not authorization, recipient, legal, or execution proof. */
  protocolOnly: true;
}
