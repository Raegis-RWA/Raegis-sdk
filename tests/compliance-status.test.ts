import { AegisClient } from '../src/client';
import { mapComplianceStatusTransition, normalizeComplianceStatus } from '../src/compliance-status';
import { Networks } from '@stellar/stellar-sdk';

describe('compliance status transitions', () => {
  const client = new AegisClient({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
    contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes untrusted values fail-closed', () => {
    expect(normalizeComplianceStatus(' APPROVED ')).toBe('approved');
    expect(normalizeComplianceStatus('not-a-status')).toBe('unknown');
    expect(normalizeComplianceStatus(null)).toBe('unknown');
  });

  it('maps pending to approved as a progression', () => {
    expect(mapComplianceStatusTransition('pending', 'approved')).toMatchObject({
      kind: 'progression',
      code: 'BECAME_APPROVED',
      changed: true,
      failClosed: false,
    });
  });

  it('maps approved to revoked as a restriction', () => {
    expect(mapComplianceStatusTransition('approved', 'revoked')).toMatchObject({
      kind: 'restriction',
      code: 'BECAME_RESTRICTED',
      changed: true,
      failClosed: true,
    });
  });

  it('keeps unavailable observations fail-closed', () => {
    expect(mapComplianceStatusTransition('approved', 'unavailable')).toMatchObject({
      kind: 'indeterminate',
      code: 'STATUS_UNAVAILABLE',
      failClosed: true,
    });
  });

  it('observes a positive whitelist result as approved', async () => {
    jest.spyOn(client.compliance, 'checkWhitelist').mockResolvedValue(true);

    await expect(client.compliance.getComplianceStatus('G_APPROVED')).resolves.toMatchObject({
      address: 'G_APPROVED',
      status: 'approved',
      code: 'WHITELIST_APPROVED',
    });
  });

  it('does not invent blocked or revoked state from a false whitelist result', async () => {
    jest.spyOn(client.compliance, 'checkWhitelist').mockResolvedValue(false);

    await expect(client.compliance.getComplianceStatus('G_UNSPECIFIED')).resolves.toMatchObject({
      status: 'unknown',
      code: 'NOT_APPROVED_UNSPECIFIED',
    });
  });

  it('maps thrown whitelist queries to unavailable without throwing', async () => {
    jest.spyOn(client.compliance, 'checkWhitelist').mockRejectedValue(new Error('rpc down'));

    await expect(client.compliance.getComplianceStatus('G_UNAVAILABLE')).resolves.toMatchObject({
      status: 'unavailable',
      code: 'QUERY_FAILED',
    });
  });
});
