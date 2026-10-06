import {
  REDACTED_VALUE,
  classifyNetworkFailure,
  redactSensitiveText,
  redactSensitiveValue,
} from '../src';

describe('secret redaction', () => {
  const stellarSecret = `S${'A'.repeat(55)}`;
  const transactionXdr = `AAAA${'B'.repeat(120)}`;
  const ed25519Signature = `${'A'.repeat(86)}==`;

  it('redacts secret keys, bearer tokens, signatures, and transaction payloads from text', () => {
    const input =
      `submit failed ${ed25519Signature} secret=${stellarSecret} authorization=Bearer header.payload.sig xdr=${transactionXdr}`;
    const redacted = redactSensitiveText(input);

    expect(redacted).not.toContain(ed25519Signature);
    expect(redacted).not.toContain(stellarSecret);
    expect(redacted).not.toContain('header.payload.sig');
    expect(redacted).not.toContain(transactionXdr);
    expect(redacted.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('redacts quoted key/value assignments in serialized diagnostic text', () => {
    const redacted = redactSensitiveText(
      'provider body {"password":"hunter2","token":"short-token"}',
    );

    expect(redacted).not.toContain('hunter2');
    expect(redacted).not.toContain('short-token');
    expect(redacted.match(/\\[REDACTED\\]/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('returns a bounded safe copy of nested support data', () => {
    const redacted = redactSensitiveValue({
      requestId: 'req-123',
      secretKey: stellarSecret,
      nested: {
        message: `provider rejected ${stellarSecret}`,
        signature: 'abcdef',
      },
    });

    expect(redacted).toEqual({
      requestId: 'req-123',
      secretKey: REDACTED_VALUE,
      nested: {
        message: `provider rejected ${REDACTED_VALUE}`,
        signature: REDACTED_VALUE,
      },
    });
  });

  it('sanitizes retained network failure causes', () => {
    const failure = classifyNetworkFailure({
      code: 'ECONNRESET',
      message: `socket reset for ${stellarSecret}`,
      authorization: 'Bearer private-token',
    });
    const cause = JSON.stringify(failure.cause);

    expect(failure.code).toBe('RPC_UNAVAILABLE');
    expect(cause).not.toContain(stellarSecret);
    expect(cause).not.toContain('private-token');
    expect(cause).toContain(REDACTED_VALUE);
  });
});
