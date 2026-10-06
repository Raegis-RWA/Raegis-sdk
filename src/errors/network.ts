import { AegisSdkError } from './public';

export type NetworkFailureCode =
  | 'TIMEOUT'
  | 'RPC_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'INVALID_NETWORK_PASSPHRASE'
  | 'MALFORMED_RESPONSE'
  | 'UNKNOWN';

export class NetworkFailure extends AegisSdkError<NetworkFailureCode> {
  public readonly retryable: boolean;
  public readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    code: NetworkFailureCode,
    retryable: boolean,
    options: {
      retryAfterSeconds?: number;
      cause?: unknown;
    } = {},
  ) {
    super({
      code,
      category: 'network',
      message,
      metadata: {
        retryable,
        ...(options.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: options.retryAfterSeconds }
          : {}),
      },
      cause: options.cause,
    });
    this.name = 'NetworkFailure';
    this.retryable = retryable;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
