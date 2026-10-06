import {
  AdminPreviewError,
  buildAdminTransactionPreview,
} from '../src';

describe('admin transaction previews', () => {
  it('builds immutable normalized whitelist and mint previews with review warnings', () => {
    const whitelist = buildAdminTransactionPreview({
      operation: 'whitelist-add',
      target: { address: '  GWHITELIST  ' },
    });

    expect(whitelist).toMatchObject({
      operation: 'whitelist-add',
      target: { address: 'GWHITELIST' },
      complianceImpact: 'changes-whitelist-state',
      reviewOnly: true,
      verified: false,
    });
    expect(whitelist.warnings.length).toBeGreaterThan(0);
    expect(Object.isFrozen(whitelist)).toBe(true);
    expect(Object.isFrozen(whitelist.target)).toBe(true);
    expect(Object.isFrozen(whitelist.warnings)).toBe(true);

    const mint = buildAdminTransactionPreview({
      operation: 'asset-mint',
      target: {
        assetId: '  RWA-1 ',
        recipient: ' GRECIPIENT ',
        amount: ' 12.50 ',
      },
    });

    expect(mint.target).toEqual({
      assetId: 'RWA-1',
      recipient: 'GRECIPIENT',
      amount: '12.50',
    });
    expect(mint.complianceImpact).toBe('requires-recipient-compliance');
    expect(mint.warnings.join(' ')).toContain('Minting changes token supply');
  });

  it('represents asset registration and assignable role previews', () => {
    expect(
      buildAdminTransactionPreview({
        operation: 'asset-register',
        target: { assetId: '  TREASURY-BOND  ' },
      }),
    ).toMatchObject({
      target: { assetId: 'TREASURY-BOND' },
      complianceImpact: 'changes-asset-registry',
    });

    expect(
      buildAdminTransactionPreview({
        operation: 'role-grant',
        target: {
          address: ' GADMIN ',
          role: 'compliance-operator',
        },
      }),
    ).toMatchObject({
      target: {
        address: 'GADMIN',
        role: 'compliance-operator',
      },
      complianceImpact: 'changes-privilege-surface',
    });
  });

  it('rejects missing targets, non-positive mint amounts, and unsupported roles', () => {
    expect(() =>
      buildAdminTransactionPreview({
        operation: 'whitelist-remove',
        target: { address: '   ' },
      }),
    ).toThrow(
      expect.objectContaining<Partial<AdminPreviewError>>({
        code: 'INVALID_TARGET',
      }),
    );

    expect(() =>
      buildAdminTransactionPreview({
        operation: 'asset-mint',
        target: {
          assetId: 'RWA-1',
          recipient: 'GRECIPIENT',
          amount: '0',
        },
      }),
    ).toThrow(
      expect.objectContaining<Partial<AdminPreviewError>>({
        code: 'INVALID_AMOUNT',
      }),
    );

    expect(() =>
      buildAdminTransactionPreview({
        operation: 'role-grant',
        target: {
          address: 'GADMIN',
          role: 'investor' as any,
        },
      }),
    ).toThrow(
      expect.objectContaining<Partial<AdminPreviewError>>({
        code: 'INVALID_ROLE',
      }),
    );
  });
});
