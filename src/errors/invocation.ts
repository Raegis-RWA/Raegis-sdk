export type SorobanInvocationErrorCode =
  | 'SIGNER_REQUIRED'
  | 'SIMULATION_FAILED'
  | 'MALFORMED_RESPONSE'
  | 'SUBMISSION_FAILED';

/**
 * Stable SDK error for invocation-layer failures that are not transport
 * failures. Network/RPC transport errors continue to use NetworkFailure.
 */
export class SorobanInvocationError extends Error {
  public readonly code: SorobanInvocationErrorCode;
  public readonly operation?: string;
  public readonly cause?: unknown;

  constructor(
    message: string,
    code: SorobanInvocationErrorCode,
    options: { operation?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'SorobanInvocationError';
    this.code = code;
    this.operation = options.operation;

    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        enumerable: false,
        configurable: false,
        writable: false,
      });
    }

    Object.setPrototypeOf(this, SorobanInvocationError.prototype);
  }
}
