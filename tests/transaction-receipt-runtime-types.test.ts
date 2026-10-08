import { Networks } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
  buildTransactionReceipt,
  buildTransactionExplorerUrl,
  normalizeTransactionReceiptStatus,
} from '../src';

const mint = {
  operation: 'asset-mint' as const,
  target: { assetId: 'RWA-1', recipient: 'GRECIPIENT', amount: '2' },
  status: 'PENDING',
  networkPassphrase: Networks.TESTNET,
};

describe('receipt runtime type boundaries', () => {
  it('keeps malformed RPC statuses unknown instead of throwing or confirming', () => {
    expect(normalizeTransactionReceiptStatus(null as unknown as string)).toBe('unknown');
    const receipt = buildTransactionReceipt({
      ...mint, status: 7 as unknown as string,
    });
    expect(receipt.status).toBe('unknown');
    expect(receipt.summary).toContain('unknown outcome');
  });

  it('rejects wrong-type hashes and amounts with classified receipt errors', () => {
    expect(() => buildTransactionExplorerUrl(123 as unknown as string, Networks.TESTNET))
      .toThrow(expect.objectContaining({ code: 'INVALID_TRANSACTION_HASH' }));
    expect(() => buildTransactionReceipt({
      ...mint, target: { ...mint.target, amount: 7 as unknown as string },
    })).toThrow(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
  });

  it('rejects invalid optional runtime metadata instead of coercing it', () => {
    expect(() => buildTransactionReceipt({
      ...mint, failureCode: 123 as unknown as string,
    })).toThrow(expect.objectContaining({ code: 'INVALID_FAILURE_CODE' }));
    expect(() => buildTransactionReceipt({
      ...mint, observedAt: null as unknown as string,
    })).toThrow(expect.objectContaining({ code: 'INVALID_TIMESTAMP' }));
  });

  it('never invokes target accessors or accepts changed fields after validation', () => {
    let getterReads = 0;
    const accessor = {
      ...mint.target,
      get amount(): string {
        getterReads++;
        return getterReads === 1 ? '2' : 'not-an-amount';
      },
    };
    expect(() => buildTransactionReceipt({
      ...mint, target: accessor,
    })).toThrow(expect.objectContaining({ code: 'INVALID_TARGET' }));
    expect(getterReads).toBe(0);

    const inherited = Object.create(mint.target) as typeof mint.target;
    expect(() => buildTransactionReceipt({
      ...mint, target: inherited,
    })).toThrow(expect.objectContaining({ code: 'INVALID_TARGET' }));

    const { proxy, revoke } = Proxy.revocable(mint.target, {});
    revoke();
    expect(() => buildTransactionReceipt({
      ...mint, target: proxy,
    })).toThrow(expect.objectContaining({ code: 'INVALID_TARGET' }));

    const mutableTarget = { ...mint.target };
    const receipt = buildTransactionReceipt({ ...mint, target: mutableTarget });
    mutableTarget.amount = 'not-an-amount';
    expect(receipt.target.amount).toBe('2');
    expect(Object.isFrozen(receipt.target)).toBe(true);
  });

  it('rejects malformed target records and compliance flags with stable errors', () => {
    for (const target of [null, [], 7, true]) {
      expect(() => buildTransactionReceipt({
        ...mint, target: target as unknown as typeof mint.target,
      })).toThrow(expect.objectContaining({ code: 'INVALID_TARGET' }));
    }
    expect(() => buildTransactionReceipt(
      null as unknown as Parameters<typeof buildTransactionReceipt>[0],
    )).toThrow(expect.objectContaining({ code: 'INVALID_TARGET' }));
    expect(() => buildTransactionReceipt({
      ...mint, target: { ...mint.target, assetId: 42 as unknown as string },
    })).toThrow(expect.objectContaining({ code: 'INVALID_TARGET' }));
    expect(() => buildTransactionReceipt({
      operation: 'compliance-update',
      target: { address: 'GINVESTOR', compliant: 'yes' as unknown as boolean },
      status: 'PENDING',
      networkPassphrase: Networks.TESTNET,
    })).toThrow(expect.objectContaining({ code: 'INVALID_TARGET' }));
  });
});
