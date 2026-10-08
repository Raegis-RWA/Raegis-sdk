import { Networks } from '@stellar/stellar-sdk';
import {
  TransactionReceiptError,
  buildTransactionExplorerUrl,
  buildTransactionReceipt,
} from '../src';

const HASH = 'B'.repeat(64);

describe('Transaction receipts', () => {
  it('builds a confirmed compliance receipt with a Testnet explorer link', () => {
    const receipt = buildTransactionReceipt({
      operation: 'compliance-update',
      target: { address: 'GINVESTOR', compliant: true },
      status: 'CONFIRMED',
      transactionHash: HASH,
      networkPassphrase: Networks.TESTNET,
      observedAt: '2026-10-05T23:00:00.000Z',
    });

    expect(receipt).toEqual({
      operation: 'compliance-update',
      target: { address: 'GINVESTOR', compliant: true },
      status: 'success',
      transactionHash: HASH.toLowerCase(),
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${HASH.toLowerCase()}`,
      observedAt: '2026-10-05T23:00:00.000Z',
      summary: 'Compliance update confirmed.',
    });
  });

  it.each([
    {
      operation: 'asset-mint' as const,
      target: { assetId: 'RWA-1', recipient: 'GRECIPIENT', amount: '10.5' },
    },
    {
      operation: 'asset-transfer' as const,
      target: { assetId: 'RWA-1', from: 'GSOURCE', to: 'GDEST', amount: '2' },
    },
    {
      operation: 'investor-update' as const,
      target: { investor: 'GINVESTOR' },
    },
  ])('builds a pending $operation receipt without requiring a hash', ({ operation, target }) => {
    const receipt = buildTransactionReceipt({
      operation,
      target,
      status: 'PENDING',
      networkPassphrase: Networks.PUBLIC,
    } as Parameters<typeof buildTransactionReceipt>[0]);

    expect(receipt.operation).toBe(operation);
    expect(receipt.status).toBe('pending');
    expect(receipt.transactionHash).toBeNull();
    expect(receipt.explorerUrl).toBeNull();
  });

  it('rejects malformed and explicitly empty transaction hashes', () => {
    expect(() => buildTransactionExplorerUrl('not-a-hash', Networks.TESTNET)).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSACTION_HASH' }),
    );
    expect(() => buildTransactionExplorerUrl('', Networks.TESTNET)).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSACTION_HASH' }),
    );
    expect(() =>
      buildTransactionReceipt({
        operation: 'investor-update',
        target: { investor: 'GINVESTOR' },
        status: 'PENDING',
        transactionHash: '',
        networkPassphrase: Networks.TESTNET,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_TRANSACTION_HASH' }));
  });

  it('requires a hash for a successful receipt', () => {
    expect(() =>
      buildTransactionReceipt({
        operation: 'investor-update',
        target: { investor: 'GINVESTOR' },
        status: 'SUCCESS',
        networkPassphrase: Networks.TESTNET,
      }),
    ).toThrow(expect.objectContaining({ code: 'MISSING_TRANSACTION_HASH' }));
  });

  it('uses HTTPS custom explorers and rejects non-positive transfer amounts', () => {
    expect(
      buildTransactionExplorerUrl(
        HASH,
        'Private Aegis Network',
        'https://explorer.example/transactions/',
      ),
    ).toBe(`https://explorer.example/transactions/${HASH.toLowerCase()}`);

    expect(() =>
      buildTransactionReceipt({
        operation: 'asset-transfer',
        target: { assetId: 'RWA-1', from: 'GSOURCE', to: 'GDEST', amount: '0' },
        status: 'PENDING',
        networkPassphrase: Networks.TESTNET,
      }),
    ).toThrow(TransactionReceiptError);
  });

  it('rejects ambiguous HTTPS custom explorer bases', () => {
    for (const explorerBaseUrl of [
      'https://user:pass@explorer.example/transactions',
      'https://explorer.example/transactions?network=private',
      'https://explorer.example/transactions#tx',
    ]) {
      expect(() =>
        buildTransactionExplorerUrl(
          HASH,
          'Private Aegis Network',
          explorerBaseUrl,
        ),
      ).toThrow(expect.objectContaining({ code: 'INVALID_EXPLORER_URL' }));
    }
  });
  it('rejects unsupported receipt operation values at the runtime boundary', () => {
    expect(() =>
      buildTransactionReceipt({
        operation: 'asset-freeze',
        target: { assetId: 'RWA-1' },
        status: 'PENDING',
        networkPassphrase: Networks.TESTNET,
      } as unknown as Parameters<typeof buildTransactionReceipt>[0]),
    ).toThrow(expect.objectContaining({ code: 'INVALID_TARGET' }));
  });

});
