import { PortfolioError } from '../errors/portfolio';
import { RoleError } from '../errors/role';
import { ConfigValidationError } from '../errors/config';

export type ComplianceFailureDomain = 'portfolio' | 'role' | 'config' | 'unknown';

export interface ComplianceFailureClassification {
  domain: ComplianceFailureDomain;
  code: string;
  classified: boolean;
}

/**
 * Classifies a caught error into a safe, closed-vocabulary compliance
 * failure summary for support diagnostics.
 *
 * Only the error's `code` (a closed enum on every SDK error class) is ever
 * read — never `.message` or `.cause`, both of which interpolate raw values
 * elsewhere in the SDK (RPC URLs, upstream error text) and could carry an
 * investor address or other identity data. An error this function doesn't
 * recognize is reported as `{ domain: 'unknown', classified: false }` rather
 * than having its message inspected to guess a category.
 */
export function classifyComplianceFailure(error: unknown): ComplianceFailureClassification {
  if (error instanceof PortfolioError) {
    return Object.freeze({ domain: 'portfolio', code: error.code, classified: true });
  }
  if (error instanceof RoleError) {
    return Object.freeze({ domain: 'role', code: error.code, classified: true });
  }
  if (error instanceof ConfigValidationError) {
    return Object.freeze({ domain: 'config', code: error.code, classified: true });
  }
  return Object.freeze({ domain: 'unknown', code: 'UNKNOWN', classified: false });
}
