import {
  COMPLIANCE_AUDIT_DISCLAIMER,
  ComplianceAuditInputError,
  ComplianceModule,
  buildComplianceAuditReport,
} from '../src';
import type { AegisClient } from '../src/client';

describe('compliance audit reports', () => {
  it('builds a deterministic report with fail-closed status precedence', () => {
    const report = buildComplianceAuditReport({
      subject: '  portfolio-42  ',
      asOf: ' 2026-10-06T05:00:00Z ',
      evidence: [
        {
          id: 'kyc-state',
          source: 'protocol',
          description: 'On-chain KYC state',
          reference: ' ledger:42 ',
        },
        {
          id: 'asset-policy',
          source: 'operator',
          description: 'Approved asset policy',
        },
      ],
      checks: [
        {
          code: 'KYC',
          summary: 'KYC state is unavailable',
          status: 'unknown',
        },
        {
          code: 'ASSET',
          summary: 'Asset policy matches',
          status: 'pass',
          evidenceIds: ['asset-policy'],
        },
        {
          code: 'BLOCK',
          summary: 'Protocol state blocks the operation',
          status: 'fail',
          evidenceIds: ['kyc-state', 'asset-policy', 'kyc-state'],
        },
      ],
    });

    expect(report).toEqual({
      schemaVersion: 1,
      subject: 'portfolio-42',
      asOf: '2026-10-06T05:00:00Z',
      overallStatus: 'fail',
      summary: {
        total: 3,
        pass: 1,
        warn: 0,
        fail: 1,
        unknown: 1,
      },
      findings: [
        {
          code: 'ASSET',
          summary: 'Asset policy matches',
          status: 'pass',
          evidenceIds: ['asset-policy'],
        },
        {
          code: 'BLOCK',
          summary: 'Protocol state blocks the operation',
          status: 'fail',
          evidenceIds: ['asset-policy', 'kyc-state'],
        },
        {
          code: 'KYC',
          summary: 'KYC state is unavailable',
          status: 'unknown',
          evidenceIds: [],
        },
      ],
      evidence: [
        {
          id: 'asset-policy',
          source: 'operator',
          description: 'Approved asset policy',
          reference: undefined,
        },
        {
          id: 'kyc-state',
          source: 'protocol',
          description: 'On-chain KYC state',
          reference: 'ledger:42',
        },
      ],
      disclaimer: COMPLIANCE_AUDIT_DISCLAIMER,
    });
  });

  it('rejects unknown evidence references and evidenced statuses without evidence', () => {
    expect(() =>
      buildComplianceAuditReport({
        subject: 'portfolio-42',
        evidence: [],
        checks: [
          {
            code: 'KYC',
            summary: 'KYC state passes',
            status: 'pass',
            evidenceIds: ['missing'],
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining<Partial<ComplianceAuditInputError>>({
        code: 'UNKNOWN_EVIDENCE_REFERENCE',
      }),
    );

    expect(() =>
      buildComplianceAuditReport({
        subject: 'portfolio-42',
        evidence: [],
        checks: [
          {
            code: 'KYC',
            summary: 'KYC state passes',
            status: 'pass',
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining<Partial<ComplianceAuditInputError>>({
        code: 'EVIDENCE_REQUIRED',
      }),
    );
  });

  it('rejects unsupported runtime status values before summarizing', () => {
    expect(() =>
      buildComplianceAuditReport({
        subject: 'portfolio-42',
        evidence: [],
        checks: [
          {
            code: 'KYC',
            summary: 'Unexpected external status',
            status: 'skipped' as never,
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining<Partial<ComplianceAuditInputError>>({
        code: 'INVALID_STATUS',
      }),
    );
  });

  it('rejects unsupported runtime evidence sources before building a report', () => {
    expect(() =>
      buildComplianceAuditReport({
        subject: 'portfolio-42',
        evidence: [
          {
            id: 'kyc-state',
            source: 'external-registry' as never,
            description: 'Runtime source outside the typed SDK contract',
          },
        ],
        checks: [
          {
            code: 'KYC',
            summary: 'KYC state is unresolved',
            status: 'unknown',
            evidenceIds: ['kyc-state'],
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining<Partial<ComplianceAuditInputError>>({
        code: 'INVALID_EVIDENCE_SOURCE',
      }),
    );
  });

  it('rejects malformed runtime report input and strips undeclared evidence fields', () => {
    const sparseEvidence = new Array(1);
    const sparseChecks = new Array(1);
    const malformedInputs = [
      {
        subject: 'portfolio-42',
        evidence: sparseEvidence as never,
        checks: [{ code: 'KYC', summary: 'Pending', status: 'unknown' as const }],
      },
      {
        subject: 'portfolio-42',
        evidence: [],
        checks: sparseChecks as never,
      },
      {
        subject: 42 as never,
        evidence: [],
        checks: [{ code: 'KYC', summary: 'Pending', status: 'unknown' as const }],
      },
      {
        subject: 'portfolio-42',
        evidence: null as never,
        checks: [{ code: 'KYC', summary: 'Pending', status: 'unknown' as const }],
      },
      {
        subject: 'portfolio-42',
        evidence: [],
        checks: [{ code: 'KYC', summary: { private: 'value' } as never, status: 'unknown' as const }],
      },
      {
        subject: 'portfolio-42',
        evidence: [],
        checks: [{
          code: 'KYC',
          summary: 'Pending',
          status: 'unknown' as const,
          evidenceIds: 'kyc-state' as never,
        }],
      },
      {
        subject: 'portfolio-42',
        evidence: [],
        checks: [{
          code: 'KYC',
          summary: 'Pending',
          status: 'unknown' as const,
          evidenceIds: new Array(1) as never,
        }],
      },
    ];

    for (const input of malformedInputs) {
      expect(() => buildComplianceAuditReport(input as never)).toThrow(
        expect.objectContaining<Partial<ComplianceAuditInputError>>({
          code: 'INVALID_REPORT_INPUT',
        }),
      );
    }

    const report = buildComplianceAuditReport({
      subject: 'portfolio-42',
      evidence: [
        {
          id: 'kyc-state',
          source: 'protocol',
          description: 'Protocol state',
          privateNote: 'must not be published',
        } as never,
      ],
      checks: [
        {
          code: 'KYC',
          summary: 'Protocol state is unresolved',
          status: 'unknown',
          evidenceIds: ['kyc-state'],
        },
      ],
    });

    expect(report.evidence[0]).toEqual({
      id: 'kyc-state',
      source: 'protocol',
      description: 'Protocol state',
      reference: undefined,
    });
    expect(report.evidence[0]).not.toHaveProperty('privateNote');
  });

  it('exposes the same pure builder through ComplianceModule', () => {
    const module = new ComplianceModule({} as AegisClient);
    const report = module.buildAuditReport({
      subject: 'portfolio-42',
      evidence: [],
      checks: [
        {
          code: 'MANUAL_REVIEW',
          summary: 'Operator review is pending',
          status: 'unknown',
        },
      ],
    });

    expect(report.overallStatus).toBe('unknown');
    expect(report.summary.unknown).toBe(1);
    expect(report.disclaimer).toBe(COMPLIANCE_AUDIT_DISCLAIMER);
  });
});
