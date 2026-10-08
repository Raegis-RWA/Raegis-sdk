import { NetworkFailureCode } from '../errors/network';
import { classifyNetworkFailure } from '../network/failures';

export type NetworkRecoveryAction =
  | 'retry'
  | 'retry-with-backoff'
  | 'check-configuration'
  | 'inspect-rpc-response'
  | 'report-unknown';

export interface NetworkFailureDiagnostic {
  code: NetworkFailureCode;
  message: string;
  retryable: boolean;
  action: NetworkRecoveryAction;
  retryAfterSeconds?: number;
}

const SAFE_DIAGNOSTIC_MESSAGES: Readonly<Record<NetworkFailureCode, string>> = {
  TIMEOUT: 'The network request timed out.',
  RPC_UNAVAILABLE: 'The Stellar RPC service is temporarily unavailable.',
  RATE_LIMITED: 'The Stellar RPC service is rate limiting requests.',
  INVALID_NETWORK_PASSPHRASE:
    'The configured network does not match the target transaction.',
  MALFORMED_RESPONSE: 'The Stellar RPC service returned an invalid response.',
  UNKNOWN: 'The network request failed for an unknown reason.',
};

const RECOVERY_ACTIONS: Readonly<
  Record<NetworkFailureCode, NetworkRecoveryAction>
> = {
  TIMEOUT: 'retry',
  RPC_UNAVAILABLE: 'retry-with-backoff',
  RATE_LIMITED: 'retry-with-backoff',
  INVALID_NETWORK_PASSPHRASE: 'check-configuration',
  MALFORMED_RESPONSE: 'inspect-rpc-response',
  UNKNOWN: 'report-unknown',
};

/**
 * Converts a raw failure into a serialisable diagnostic safe for logs, UI, or
 * GitHub support requests. The original error and its raw message are omitted.
 */
export function buildNetworkFailureDiagnostic(
  error: unknown,
): NetworkFailureDiagnostic {
  const failure = classifyNetworkFailure(error);

  return Object.freeze({
    code: failure.code,
    message: SAFE_DIAGNOSTIC_MESSAGES[failure.code],
    retryable: failure.retryable,
    action: RECOVERY_ACTIONS[failure.code],
    ...(failure.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: failure.retryAfterSeconds }
      : {}),
  });
}
