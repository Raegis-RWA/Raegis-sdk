import type { MintReadinessResult } from '../types/mint-readiness';

export type MintReadinessErrorCode = 'MINT_NOT_READY';

/**
 * Raised by `AssetModule.mintWhenReady()` before transaction construction or
 * signing when one or more readiness checks are not passed.
 */
export class MintReadinessError extends Error {
  public readonly code: MintReadinessErrorCode = 'MINT_NOT_READY';
  public readonly readiness: MintReadinessResult;

  constructor(readiness: MintReadinessResult) {
    const codes = readiness.blockingCodes.join(', ') || 'UNKNOWN';
    super(`Mint transaction is not ready: ${codes}`);
    this.name = 'MintReadinessError';
    this.readiness = readiness;
    Object.setPrototypeOf(this, MintReadinessError.prototype);
  }
}
