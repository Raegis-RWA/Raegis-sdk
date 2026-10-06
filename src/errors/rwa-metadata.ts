import type { RwaMetadataValidationIssue } from '../types/rwa-metadata';

export class RwaMetadataValidationError extends Error {
  public readonly issues: readonly RwaMetadataValidationIssue[];

  constructor(issues: readonly RwaMetadataValidationIssue[]) {
    super(
      issues.length === 1
        ? `RWA metadata validation failed: ${issues[0].message}`
        : `RWA metadata validation failed with ${issues.length} issues`
    );
    this.name = 'RwaMetadataValidationError';
    this.issues = [...issues];
  }
}
