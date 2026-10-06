/**
 * One of the five pre-signing checks required for an asset mint.
 */
export type MintReadinessCheckName =
  | 'issuer'
  | 'recipient'
  | 'asset'
  | 'amount'
  | 'network';

export type MintReadinessCheckStatus =
  | 'passed'
  | 'blocked'
  | 'unknown'
  | 'error';

export type MintReadinessCode =
  | 'OK'
  | 'NO_SIGNER_CONFIGURED'
  | 'ISSUER_AUTHORIZATION_UNAVAILABLE'
  | 'ISSUER_NOT_AUTHORIZED'
  | 'ISSUER_AUTHORIZATION_QUERY_FAILED'
  | 'INVALID_RECIPIENT'
  | 'RECIPIENT_NOT_WHITELISTED'
  | 'RECIPIENT_COMPLIANCE_QUERY_FAILED'
  | 'ASSET_STATUS_UNAVAILABLE'
  | 'ASSET_NOT_ACTIVE'
  | 'ASSET_STATUS_QUERY_FAILED'
  | 'INVALID_AMOUNT'
  | 'NETWORK_UNHEALTHY'
  | 'NETWORK_UNAVAILABLE';

export interface MintReadinessProbeContext {
  issuer: string;
  recipient: string;
  amount: number;
  contractId: string;
  networkPassphrase: string;
}

export type MintReadinessProbe = (
  context: MintReadinessProbeContext,
) => boolean | Promise<boolean>;

/**
 * Authoritative reads that the current Raegis contract interface does not
 * expose directly. Missing probes produce an `unknown` check and fail closed.
 */
export interface MintReadinessProbes {
  issuerAuthorized?: MintReadinessProbe;
  assetActive?: MintReadinessProbe;
  /**
   * Optional network override. When omitted, the SDK calls Soroban RPC
   * `getHealth()` and requires a `healthy` status.
   */
  networkReady?: MintReadinessProbe;
}

export interface MintReadinessCheck {
  name: MintReadinessCheckName;
  status: MintReadinessCheckStatus;
  code: MintReadinessCode;
  verified: boolean;
  message: string;
}

export interface MintReadinessChecks {
  issuer: MintReadinessCheck;
  recipient: MintReadinessCheck;
  asset: MintReadinessCheck;
  amount: MintReadinessCheck;
  network: MintReadinessCheck;
}

/**
 * A fail-closed pre-signing assessment. `ready` is true only when every check
 * is `passed`; `unknown` and `error` states are blocking.
 */
export interface MintReadinessResult {
  ready: boolean;
  issuer: string | null;
  recipient: string;
  amount: number;
  contractId: string;
  checks: MintReadinessChecks;
  blockingCodes: MintReadinessCode[];
  checkedAt: string;
}
