import { diagnoseTransferRestrictions } from '../src/diagnostics/transfer';

describe('diagnoseTransferRestrictions', () => {
  it('reports ready only when all observable preflight signals are clear', () => {
    expect(
      diagnoseTransferRestrictions({
        amount: 10,
        senderWhitelist: 'whitelisted',
        recipientWhitelist: 'whitelisted',
        senderAddress: 'G-SENDER',
        signerAddress: 'G-SENDER',
      }),
    ).toEqual({
      status: 'ready',
      canAttempt: true,
      reasons: [],
    });
  });

  it('reports a protocol whitelist restriction without legal conclusions', () => {
    const result = diagnoseTransferRestrictions({
      amount: 10,
      senderWhitelist: 'whitelisted',
      recipientWhitelist: 'not-whitelisted',
    });

    expect(result.status).toBe('restricted');
    expect(result.canAttempt).toBe(false);
    expect(result.reasons).toEqual([
      expect.objectContaining({
        code: 'RECIPIENT_NOT_WHITELISTED',
        action: 'review-protocol-whitelist',
        retryable: false,
      }),
    ]);
  });

  it('fails closed when whitelist state is unavailable', () => {
    const result = diagnoseTransferRestrictions({
      amount: 10,
      senderWhitelist: 'unavailable',
      recipientWhitelist: 'whitelisted',
    });

    expect(result.status).toBe('unknown');
    expect(result.canAttempt).toBe(false);
    expect(result.reasons[0]).toMatchObject({
      code: 'SENDER_WHITELIST_UNAVAILABLE',
      action: 'inspect-network',
      retryable: true,
    });
  });

  it('fails closed when the expected sender is known but signer identity is missing', () => {
    const result = diagnoseTransferRestrictions({
      amount: 10,
      senderWhitelist: 'whitelisted',
      recipientWhitelist: 'whitelisted',
      senderAddress: 'G-SENDER',
    });

    expect(result.status).toBe('unknown');
    expect(result.canAttempt).toBe(false);
    expect(result.reasons).toEqual([
      expect.objectContaining({
        code: 'SIGNER_UNKNOWN',
        action: 'use-expected-signer',
        retryable: false,
      }),
    ]);
  });

  it('retains multiple hard restrictions', () => {
    const result = diagnoseTransferRestrictions({
      amount: 0,
      senderWhitelist: 'whitelisted',
      recipientWhitelist: 'whitelisted',
      senderAddress: 'G-SENDER',
      signerAddress: 'G-OTHER',
    });

    expect(result.status).toBe('restricted');
    expect(result.canAttempt).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      'INVALID_AMOUNT',
      'SIGNER_MISMATCH',
    ]);
  });
});
