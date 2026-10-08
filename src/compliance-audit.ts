export type ComplianceAuditStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export type ComplianceAuditEvidenceSource = 'protocol' | 'sdk' | 'operator';

export interface ComplianceAuditEvidence {
  id: string;
  source: ComplianceAuditEvidenceSource;
  description: string;
  reference?: string;
}

export interface ComplianceAuditCheckInput {
  code: string;
  summary: string;
  status: ComplianceAuditStatus;
  evidenceIds?: readonly string[];
}

export interface ComplianceAuditInput {
  subject: string;
  asOf?: string;
  evidence: readonly ComplianceAuditEvidence[];
  checks: readonly ComplianceAuditCheckInput[];
}

export interface ComplianceAuditSummary {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  unknown: number;
}

export interface ComplianceAuditFinding {
  code: string;
  summary: string;
  status: ComplianceAuditStatus;
  evidenceIds: readonly string[];
}

export interface ComplianceAuditReport {
  schemaVersion: 1;
  subject: string;
  asOf?: string;
  overallStatus: ComplianceAuditStatus;
  summary: ComplianceAuditSummary;
  findings: readonly ComplianceAuditFinding[];
  evidence: readonly ComplianceAuditEvidence[];
  disclaimer: string;
}

export type ComplianceAuditInputErrorCode =
  | 'EMPTY_SUBJECT'
  | 'EMPTY_CHECKS'
  | 'EMPTY_IDENTIFIER'
  | 'DUPLICATE_CHECK_CODE'
  | 'DUPLICATE_EVIDENCE_ID'
  | 'UNKNOWN_EVIDENCE_REFERENCE'
  | 'EVIDENCE_REQUIRED'
  | 'INVALID_STATUS'
  | 'INVALID_EVIDENCE_SOURCE'
  | 'INVALID_REPORT_INPUT';

export class ComplianceAuditInputError extends Error {
  public readonly code: ComplianceAuditInputErrorCode;

  constructor(code: ComplianceAuditInputErrorCode, message: string) {
    super(message);
    this.name = 'ComplianceAuditInputError';
    this.code = code;
  }
}

export const COMPLIANCE_AUDIT_DISCLAIMER =
  'This report summarizes caller-supplied protocol evidence and is not legal or financial advice.';

const STATUS_RANK: Record<ComplianceAuditStatus, number> = {
  pass: 0,
  warn: 1,
  unknown: 2,
  fail: 3,
};

const EVIDENCE_SOURCES: Record<ComplianceAuditEvidenceSource, true> = {
  protocol: true,
  sdk: true,
  operator: true,
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invalidReportInput(field: string): never {
  throw new ComplianceAuditInputError(
    'INVALID_REPORT_INPUT',
    field + ' has an invalid runtime shape or type'
  );
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidReportInput(field);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    return invalidReportInput(field);
  }
  return value.trim();
}

function requireOptionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = requireText(value, field);
  return normalized || undefined;
}

function requireIdentifier(value: unknown, field: string): string {
  const normalized = requireText(value, field);
  if (!normalized) {
    throw new ComplianceAuditInputError(
      'EMPTY_IDENTIFIER',
      field + ' must be a non-empty identifier'
    );
  }
  return normalized;
}

function requireStatus(value: unknown, field: string): ComplianceAuditStatus {
  if (typeof value !== 'string') {
    return invalidReportInput(field);
  }
  if (!Object.prototype.hasOwnProperty.call(STATUS_RANK, value)) {
    throw new ComplianceAuditInputError(
      'INVALID_STATUS',
      field + ' must be one of pass, warn, fail, unknown'
    );
  }
  return value as ComplianceAuditStatus;
}

function requireEvidenceSource(
  value: unknown,
  field: string
): ComplianceAuditEvidenceSource {
  if (typeof value !== 'string') {
    return invalidReportInput(field);
  }
  if (!Object.prototype.hasOwnProperty.call(EVIDENCE_SOURCES, value)) {
    throw new ComplianceAuditInputError(
      'INVALID_EVIDENCE_SOURCE',
      field + ' must be one of protocol, sdk, operator'
    );
  }
  return value as ComplianceAuditEvidenceSource;
}

function normalizeEvidence(evidence: unknown): ComplianceAuditEvidence[] {
  if (!Array.isArray(evidence)) {
    return invalidReportInput('evidence');
  }

  const seen = new Set<string>();

  return Array.from(evidence)
    .map((value, index) => {
      const item = requireRecord(value, 'evidence[' + index + ']');
      const id = requireIdentifier(item.id, 'evidence[' + index + '].id');
      if (seen.has(id)) {
        throw new ComplianceAuditInputError(
          'DUPLICATE_EVIDENCE_ID',
          'duplicate evidence id: ' + id
        );
      }
      seen.add(id);

      return {
        id,
        source: requireEvidenceSource(item.source, 'evidence[' + index + '].source'),
        description: requireText(item.description, 'evidence[' + index + '].description'),
        reference: requireOptionalText(item.reference, 'evidence[' + index + '].reference'),
      };
    })
    .sort((left, right) => compareText(left.id, right.id));
}

function normalizeFindings(
  checks: unknown,
  evidenceIds: ReadonlySet<string>
): ComplianceAuditFinding[] {
  if (!Array.isArray(checks)) {
    return invalidReportInput('checks');
  }
  if (checks.length === 0) {
    throw new ComplianceAuditInputError(
      'EMPTY_CHECKS',
      'at least one compliance check is required'
    );
  }

  const seenCodes = new Set<string>();

  return Array.from(checks)
    .map((value, index) => {
      const check = requireRecord(value, 'checks[' + index + ']');
      const code = requireIdentifier(check.code, 'checks[' + index + '].code');
      const status = requireStatus(check.status, code + '.status');
      if (seenCodes.has(code)) {
        throw new ComplianceAuditInputError(
          'DUPLICATE_CHECK_CODE',
          'duplicate check code: ' + code
        );
      }
      seenCodes.add(code);

      const rawEvidenceIds = check.evidenceIds;
      if (rawEvidenceIds !== undefined && !Array.isArray(rawEvidenceIds)) {
        return invalidReportInput(code + '.evidenceIds');
      }
      const refs = Array.from(
        new Set(
          Array.from(rawEvidenceIds ?? []).map((id) =>
            requireIdentifier(id, code + '.evidenceId')
          )
        )
      ).sort(compareText);

      for (const evidenceId of refs) {
        if (!evidenceIds.has(evidenceId)) {
          throw new ComplianceAuditInputError(
            'UNKNOWN_EVIDENCE_REFERENCE',
            code + ' references unknown evidence id: ' + evidenceId
          );
        }
      }

      if (status !== 'unknown' && refs.length === 0) {
        throw new ComplianceAuditInputError(
          'EVIDENCE_REQUIRED',
          code + ' requires evidence for status ' + status
        );
      }

      return {
        code,
        summary: requireText(check.summary, code + '.summary'),
        status,
        evidenceIds: refs,
      };
    })
    .sort((left, right) => compareText(left.code, right.code));
}

function summarize(findings: readonly ComplianceAuditFinding[]): ComplianceAuditSummary {
  const summary: ComplianceAuditSummary = {
    total: findings.length,
    pass: 0,
    warn: 0,
    fail: 0,
    unknown: 0,
  };

  for (const finding of findings) {
    summary[finding.status] += 1;
  }

  return summary;
}

function overallStatus(findings: readonly ComplianceAuditFinding[]): ComplianceAuditStatus {
  let overall: ComplianceAuditStatus = 'pass';

  for (const finding of findings) {
    if (STATUS_RANK[finding.status] > STATUS_RANK[overall]) {
      overall = finding.status;
    }
  }

  return overall;
}

export function buildComplianceAuditReport(input: ComplianceAuditInput): ComplianceAuditReport {
  const reportInput = requireRecord(input, 'report');
  const subject = requireText(reportInput.subject, 'subject');
  if (!subject) {
    throw new ComplianceAuditInputError('EMPTY_SUBJECT', 'subject must be non-empty');
  }

  const evidence = normalizeEvidence(reportInput.evidence);
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const findings = normalizeFindings(reportInput.checks, evidenceIds);

  return {
    schemaVersion: 1,
    subject,
    asOf: requireOptionalText(reportInput.asOf, 'asOf'),
    overallStatus: overallStatus(findings),
    summary: summarize(findings),
    findings,
    evidence,
    disclaimer: COMPLIANCE_AUDIT_DISCLAIMER,
  };
}
