/**
 * Issuer-reported lifecycle states for an already-created RWA asset.
 *
 * These values match the dashboard lifecycle vocabulary. They describe
 * protocol/application state only and do not constitute a legal or financial
 * determination about the underlying asset.
 */
export const RWA_ASSET_STATUSES = [
  'active',
  'paused',
  'matured',
  'redeemed',
  'defaulted',
] as const;

export type RwaAssetStatus = (typeof RWA_ASSET_STATUSES)[number];

/**
 * Validated RWA metadata shared by SDK, contract-integration and dashboard
 * boundaries. Supply is kept as bigint so i128-sized values never pass through
 * a lossy JavaScript number.
 */
export interface RwaAssetMetadata {
  issuer: string;
  symbol: string;
  name: string;
  status: RwaAssetStatus;
  supply: bigint;
}
