import { Networks } from '@stellar/stellar-sdk';
import {
  AegisClient,
  EligibilityExplanationError,
  ELIGIBILITY_DISCLAIMER,
  buildInvestorEligibilityExplanation,
  explainWhitelistResult,
  normalizeInvestorEligibilityStatus,
} from '../src';

describe('normalizeInvestorEligibilityStatus', () => {
  it.each([
    ['approved', 'approved'],
    ['WHITELISTED', 'approved'],
    ['eligible', 'approved'],
    ['blocked', 'blocked'],
    ['NOT_WHITELISTED', 'blocked'],
    ['revoked', 'revoked'],
    ['KYC_REVOKED', 'revoked'],
    ['unknown', 'unknown'],
    ['unavailable', 'unavailable'],
  ] as const)('maps %s to %s', (input, expected) => {
    expect(normalizeInvestorEligibilityStatus(input)).toBe(expected);
  });

  it('treats unrecognised future statuses as unknown rather than approved', () => {
    expect(normalizeInvestorEligibilityStatus('PARTIALLY_APPROVED')).toBe(
      'unknown',
    );
  });
});

describe('buildInvestorEligibilityExplanation', () => {
  it('maps an approved whitelist signal', () => {
    const result = buildInvestorEligibilityExplanation({
      address: 'G_APPROVED',
      isKycApproved: true,
      evaluatedAt: '2026-07-29T00:00:00.000Z',
    });

    expect(result).toMatchObject({
      address: 'G_APPROVED',
      status: 'approved',
      code: 'WHITELISTED',
      nextAction: 'none',
      isEligible: true,
      isKycApproved: true,
      verified: false,
      evaluatedAt: '2026-07-29T00:00:00.000Z',
    });
    expect(result.message).toContain('whitelist');
    expect(result.disclaimer).toBe(ELIGIBILITY_DISCLAIMER);
  });

  it('maps a bare false whitelist result to blocked, not revoked', () => {
    const result = explainWhitelistResult(false, { address: 'G_BLOCKED' });

    expect(result.status).toBe('blocked');
    expect(result.code).toBe('NOT_WHITELISTED');
    expect(result.nextAction).toBe('complete-kyc');
    expect(result.isEligible).toBe(false);
  });

  it('maps an explicit revoke signal to revoked', () => {
    const result = buildInvestorEligibilityExplanation({
      address: 'G_REVOKED',
      isKycApproved: false,
      isKycRevoked: true,
    });

    expect(result).toMatchObject({
      status: 'revoked',
      code: 'KYC_REVOKED',
      nextAction: 'contact-compliance',
      isEligible: false,
      isKycApproved: false,
    });
  });

  it('prefers revoke over a conflicting approved boolean', () => {
    const result = buildInvestorEligibilityExplanation({
      isKycApproved: true,
      isKycRevoked: true,
    });

    expect(result.status).toBe('revoked');
  });

  it('maps compliance query failure to unavailable with a safe message', () => {
    const result = buildInvestorEligibilityExplanation({
      address: 'G_USER',
      complianceQueryFailed: true,
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      code: 'COMPLIANCE_QUERY_FAILED',
      nextAction: 'retry-with-backoff',
      isEligible: false,
    });
    expect(result.message).not.toContain('secret');
    expect(result.message).not.toContain('http');
  });

  it('maps an invalid address to unavailable', () => {
    const result = buildInvestorEligibilityExplanation({
      address: '',
      invalidAddress: true,
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      code: 'INVALID_ADDRESS',
      nextAction: 'verify-address',
    });
  });

  it('maps insufficient signals to unknown', () => {
    const result = buildInvestorEligibilityExplanation({ address: 'G_USER' });

    expect(result).toMatchObject({
      status: 'unknown',
      code: 'INSUFFICIENT_DATA',
      nextAction: 'inspect-compliance-response',
      isEligible: false,
    });
  });

  it('maps an unrecognised explicit status to unknown', () => {
    const result = buildInvestorEligibilityExplanation({
      status: 'PARTIALLY_APPROVED',
    });

    expect(result.status).toBe('unknown');
    expect(result.code).toBe('UNRECOGNIZED_STATUS');
  });

  it('accepts explicit status aliases including revoked', () => {
    expect(
      buildInvestorEligibilityExplanation({ status: 'KYC_REVOKED' }).status,
    ).toBe('revoked');
    expect(
      buildInvestorEligibilityExplanation({ status: 'approved' }).status,
    ).toBe('approved');
  });

  it('never implies a legal guarantee in the message or disclaimer', () => {
    const statuses = [
      { isKycApproved: true },
      { isKycApproved: false },
      { isKycRevoked: true },
      { complianceQueryFailed: true },
      { invalidAddress: true },
      {},
    ] as const;

    for (const input of statuses) {
      const result = buildInvestorEligibilityExplanation(input);
      const blob = `${result.message} ${result.disclaimer}`.toLowerCase();

      expect(blob).toContain('not legal');
      expect(blob).not.toContain('guarantees approval');
      expect(blob).not.toContain('legally eligible');
      expect(result.verified).toBe(false);
      expect(result.disclaimer).toBe(ELIGIBILITY_DISCLAIMER);
    }
  });

  it('returns a frozen result safe for dashboard caching', () => {
    const result = buildInvestorEligibilityExplanation({ isKycApproved: true });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects an invalid evaluation timestamp', () => {
    expect(() =>
      buildInvestorEligibilityExplanation({
        isKycApproved: true,
        evaluatedAt: 'not-a-date',
      }),
    ).toThrow(EligibilityExplanationError);
    expect(() =>
      buildInvestorEligibilityExplanation({
        isKycApproved: true,
        evaluatedAt: 'not-a-date',
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_TIMESTAMP' }));
  });

  it('omits raw provider payloads from serialised output', () => {
    const result = buildInvestorEligibilityExplanation({
      address: 'G_USER',
      complianceQueryFailed: true,
    });

    expect(JSON.stringify(result)).not.toContain('Bearer');
    expect(JSON.stringify(result)).not.toContain('authorization');
    expect(Object.keys(result)).toEqual([
      'address',
      'status',
      'code',
      'message',
      'nextAction',
      'isEligible',
      'isKycApproved',
      'verified',
      'disclaimer',
      'evaluatedAt',
    ]);
  });
});

describe('InvestorModule.explainEligibility', () => {
  let client: AegisClient;

  beforeEach(() => {
    client = new AegisClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractId: 'C...',
    });
  });

  it('explains an approved investor from the live whitelist check', async () => {
    jest
      .spyOn(client.compliance, 'checkWhitelist')
      .mockResolvedValue(true);

    const result = await client.investor.explainEligibility('G_APPROVED');

    expect(result.status).toBe('approved');
    expect(result.code).toBe('WHITELISTED');
    expect(result.address).toBe('G_APPROVED');
  });

  it('explains a blocked investor without promoting false to revoked', async () => {
    jest
      .spyOn(client.compliance, 'checkWhitelist')
      .mockResolvedValue(false);

    const result = await client.investor.explainEligibility('G_BLOCKED');

    expect(result.status).toBe('blocked');
    expect(result.code).toBe('NOT_WHITELISTED');
  });

  it('explains compliance failures as unavailable without copying raw errors', async () => {
    jest.spyOn(client.compliance, 'checkWhitelist').mockRejectedValue(
      Object.assign(new Error('https://rpc.example/?token=secret-value timed out'), {
        code: 'ETIMEDOUT',
      }),
    );

    const result = await client.investor.explainEligibility('G_USER');

    expect(result.status).toBe('unavailable');
    expect(result.code).toBe('COMPLIANCE_QUERY_FAILED');
    expect(JSON.stringify(result)).not.toContain('secret-value');
    expect(result.message).not.toContain('http');
  });

  it('explains an invalid address without contacting compliance', async () => {
    const spy = jest.spyOn(client.compliance, 'checkWhitelist');

    const result = await client.investor.explainEligibility('');

    expect(result.status).toBe('unavailable');
    expect(result.code).toBe('INVALID_ADDRESS');
    expect(spy).not.toHaveBeenCalled();
  });

  it('maps offline revoke signals without another RPC round trip', () => {
    const result = client.investor.explainEligibilityFromSignals({
      address: 'G_REVOKED',
      isKycRevoked: true,
    });

    expect(result.status).toBe('revoked');
    expect(result.nextAction).toBe('contact-compliance');
  });
});
