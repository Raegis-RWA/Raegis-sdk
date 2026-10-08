# Compliance audit report builder

The SDK provides a deterministic report builder for **caller-supplied protocol evidence**. It is available as the standalone `buildComplianceAuditReport()` helper and as `client.compliance.buildAuditReport()`.

The builder performs no RPC calls, does not discover evidence, and does not decide whether an entity is legally or financially compliant. Its output is a structured summary of the evidence and statuses supplied by the caller.

## Example

```typescript
import { AegisClient } from '@aegis/sdk';

const report = client.compliance.buildAuditReport({
  subject: 'asset-42',
  asOf: new Date().toISOString(),
  evidence: [
    {
      id: 'kyc-ledger',
      source: 'protocol',
      description: 'Current protocol whitelist observation',
      reference: 'ledger:123456',
    },
  ],
  checks: [
    {
      code: 'KYC_STATE',
      summary: 'Protocol whitelist observation is present',
      status: 'pass',
      evidenceIds: ['kyc-ledger'],
    },
  ],
});

console.log(report.overallStatus); // pass
```

The same operation is available without constructing a client:

```typescript
import { buildComplianceAuditReport } from '@aegis/sdk';
```

## Deterministic output

Reports use schema version `1`.

- findings are sorted by `code`;
- evidence is sorted by `id`;
- duplicate evidence references inside a finding are removed and sorted;
- summaries count `pass`, `warn`, `fail`, and `unknown`;
- overall precedence is `fail > unknown > warn > pass`.

The builder does not read the network or the local filesystem. The caller is responsible for obtaining evidence and choosing each check status.

## Validation and failure states

Invalid input throws `ComplianceAuditInputError` with a stable `code`:

| Code | Meaning |
| --- | --- |
| `EMPTY_SUBJECT` | Report subject is blank. |
| `EMPTY_CHECKS` | No checks were supplied. |
| `EMPTY_IDENTIFIER` | A check code or evidence id is blank. |
| `DUPLICATE_CHECK_CODE` | Two checks use the same normalized code. |
| `DUPLICATE_EVIDENCE_ID` | Two evidence records use the same normalized id. |
| `UNKNOWN_EVIDENCE_REFERENCE` | A finding references an evidence id not present in the input. |
| `EVIDENCE_REQUIRED` | A `pass`, `warn`, or `fail` finding has no evidence reference. |
| `INVALID_STATUS` | A runtime check status is outside `pass`, `warn`, `fail`, or `unknown`. |
| `INVALID_EVIDENCE_SOURCE` | A runtime evidence source is outside `protocol`, `sdk`, or `operator`. |
| `INVALID_REPORT_INPUT` | A runtime report, list, record, text field, or evidence-id list has the wrong shape or type. |

An `unknown` finding may intentionally have no evidence. That state represents an unresolved observation rather than an evidenced conclusion.

## Security and compliance boundary

Treat the builder as a formatting and normalization boundary, not an authority:

- runtime report shapes are validated before normalization; malformed arrays, records, and text fields fail with `INVALID_REPORT_INPUT` rather than leaking native exceptions;
- report evidence emits only the declared `id`, `source`, `description`, and optional `reference` fields; undeclared caller properties are not copied into exported reports;
- evidence is accepted as caller-supplied data and is not independently verified;
- a `pass` status does not establish legal, financial, regulatory, KYC, AML, or transfer eligibility;
- a `fail` status does not replace protocol enforcement or professional review;
- consumers should preserve authoritative evidence references so dashboards and audit trails can trace each finding back to its source;
- callers should avoid placing secrets, private keys, credentials, or unnecessary personal data in evidence descriptions or references.

Every report includes the SDK disclaimer: the report summarizes caller-supplied protocol evidence and is not legal or financial advice.
