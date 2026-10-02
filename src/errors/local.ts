/**
 * Typed failures for local-development configuration and network readiness.
 *
 * Messages are intentionally free of secrets, raw RPC URLs with credentials,
 * and secret-key material so they remain safe for logs and support pastes.
 */
export type LocalConfigErrorCode =
  | 'MISSING_CONTRACT_ID'
  | 'INVALID_CONTRACT_ID'
  | 'INVALID_RPC_URL'
  | 'NON_LOOPBACK_RPC_URL'
  | 'INVALID_SECRET_KEY'
  | 'INVALID_NETWORK_PASSPHRASE'
  | 'LOCAL_NETWORK_UNAVAILABLE'
  | 'LOCAL_NETWORK_MISCONFIGURED';

export class LocalConfigError extends Error {
  public readonly code: LocalConfigErrorCode;
  /** Optional recovery hint suitable for dashboards and docs. */
  public readonly hint?: string;

  constructor(message: string, code: LocalConfigErrorCode, hint?: string) {
    super(message);
    this.name = 'LocalConfigError';
    this.code = code;
    this.hint = hint;
    Object.setPrototypeOf(this, LocalConfigError.prototype);
  }
}
