import { AegisSdkError } from './public';

export type PortfolioErrorCode =
  | 'RPC_FAILURE'
  | 'PARSE_ERROR'
  | 'COMPLIANCE_ERROR'
  | 'UNAVAILABLE'
  | 'INVALID_ADDRESS';

/**
 * Custom error class for investor portfolio operations.
 */
export class PortfolioError extends AegisSdkError<PortfolioErrorCode> {
  constructor(message: string, code: PortfolioErrorCode, cause?: Error) {
    super({
      code,
      category: 'investor',
      message,
      cause,
    });
    this.name = 'PortfolioError';
  }
}
