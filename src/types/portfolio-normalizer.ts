/**
 * Row-level outcome produced by the investor portfolio normalizer.
 *
 * - `supported`: the row has a stable asset identity, integer base-unit balance,
 *   and usable decimal precision.
 * - `unknown`: no stable asset identity was present; the row is preserved rather
 *   than silently discarded.
 * - `unsupported`: the asset is explicitly marked unsupported or its balance /
 *   decimal shape cannot be represented safely by the SDK normalizer.
 */
export type PortfolioHoldingNormalizationStatus =
  | 'supported'
  | 'unknown'
  | 'unsupported';

/** Stable reason codes for non-supported holding rows. */
export type PortfolioHoldingNormalizationCode =
  | 'MISSING_ASSET_ID'
  | 'UNSUPPORTED_ASSET'
  | 'INVALID_BALANCE'
  | 'INVALID_DECIMALS';

/**
 * Normalized metadata intentionally contains only fields observable in raw
 * portfolio/asset reads. Missing metadata stays null instead of being invented.
 */
export interface NormalizedPortfolioAssetMetadata {
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  category: string | null;
  contractId: string | null;
}

/**
 * One normalized holding row suitable for dashboards and other SDK consumers.
 *
 * `balance` is the canonical integer base-unit representation. `decimalBalance`
 * is the exact decimal expansion using metadata.decimals. Both are null when the
 * source row cannot be represented without guessing.
 */
export interface NormalizedPortfolioHolding {
  status: PortfolioHoldingNormalizationStatus;
  code?: PortfolioHoldingNormalizationCode;
  assetId: string | null;
  balance: string | null;
  decimalBalance: string | null;
  metadata: NormalizedPortfolioAssetMetadata;
}

/** Aggregate state of a normalized portfolio snapshot. */
export type PortfolioNormalizationState =
  | 'empty'
  | 'ready'
  | 'partial'
  | 'unusable';

/**
 * Typed, source-agnostic portfolio snapshot produced from heterogeneous holdings.
 */
export interface NormalizedInvestorPortfolio {
  state: PortfolioNormalizationState;
  holdings: NormalizedPortfolioHolding[];
  totalHoldingsCount: number;
  supportedHoldingsCount: number;
  unknownHoldingsCount: number;
  unsupportedHoldingsCount: number;
}

/**
 * Compatibility aliases accepted by the normalizer.
 *
 * The public function still accepts `unknown` so callers can pass decoded JSON
 * or contract/dashboard payloads without first asserting a shape; this interface
 * documents the supported field vocabulary.
 */
export interface PortfolioHoldingInput {
  assetId?: unknown;
  asset_id?: unknown;
  contractId?: unknown;
  contract_id?: unknown;
  id?: unknown;
  balance?: unknown;
  rawBalance?: unknown;
  raw_balance?: unknown;
  amount?: unknown;
  quantity?: unknown;
  symbol?: unknown;
  assetSymbol?: unknown;
  asset_symbol?: unknown;
  name?: unknown;
  assetName?: unknown;
  asset_name?: unknown;
  decimals?: unknown;
  assetDecimals?: unknown;
  asset_decimals?: unknown;
  category?: unknown;
  assetCategory?: unknown;
  asset_category?: unknown;
  supported?: unknown;
  isSupported?: unknown;
  unsupported?: unknown;
  status?: unknown;
  metadata?: unknown;
  asset?: unknown;
}

/** Optional compatibility assumptions for normalization. */
export interface PortfolioNormalizerOptions {
  /**
   * Decimal precision used only when a supported row omits precision entirely.
   * Defaults to 7 to match the SDK's existing Soroban holding model.
   */
  defaultDecimals?: number;
}
