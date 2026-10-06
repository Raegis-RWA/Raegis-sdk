import { Networks } from '@stellar/stellar-sdk';
import {
  AegisActivityInput,
  AegisContractEvent,
  buildAdminActionReceipt,
  mapAegisActivity,
  mapAegisHistory,
} from '../src';

const HASH = 'A'.repeat(64);

function transferEvent(overrides: Partial<AegisContractEvent> = {}): AegisContractEvent {
  return {
    kind: 'transfer',
    from: 'GFROM',
    to: 'GTO',
    amount: '25000000',
    txHash: HASH,
    ledger: 42,
    contractId: 'CAEGIS',
    inSuccessfulContractCall: true,
    eventName: 'transfer',
    decodedAt: '2026-10-05T20:00:00.000Z',
    ...overrides,
  } as AegisContractEvent;
}

const invalidAdminActivityInput: AegisActivityInput = {
  operation: 'whitelist-add',
  // @ts-expect-error whitelist operations require an address target.
  target: { assetId: 'not-an-address' },
  status: 'pending',
  transactionHash: null,
  explorerUrl: null,
  observedAt: '2026-10-05T20:00:00.000Z',
  summary: 'invalid',
};
void invalidAdminActivityInput;

describe('Aegis activity mapper', () => {
  it('maps a decoded transfer into a confirmed typed activity', () => {
    const activity = mapAegisActivity(transferEvent(), 3);

    expect(activity).toEqual({
      id: `contract-event:${HASH.toLowerCase()}:transfer:3`,
      source: 'contract-event',
      kind: 'transfer',
      status: 'confirmed',
      transactionHash: HASH,
      observedAt: '2026-10-05T20:00:00.000Z',
      summary: 'Asset transfer observed.',
      ledger: 42,
      contractId: 'CAEGIS',
      from: 'GFROM',
      to: 'GTO',
      amount: '25000000',
    });
  });

  it('maps admin receipts without copying arbitrary receipt summary text', () => {
    const receipt = buildAdminActionReceipt({
      operation: 'whitelist-add',
      target: { address: 'GINVESTOR' },
      status: 'PENDING',
      networkPassphrase: Networks.TESTNET,
      observedAt: '2026-10-05T20:01:00.000Z',
    });

    const activity = mapAegisActivity({
      ...receipt,
      summary: 'caller-controlled text that should not be reused',
    });

    expect(activity).toMatchObject({
      source: 'admin-receipt',
      kind: 'compliance',
      status: 'pending',
      action: 'whitelist_add',
      address: 'GINVESTOR',
      summary: 'Whitelist addition pending.',
    });
    expect(JSON.stringify(activity)).not.toContain('caller-controlled');
  });

  it('maps asset mint receipts into the shared mint activity shape', () => {
    const receipt = buildAdminActionReceipt({
      operation: 'asset-mint',
      target: {
        assetId: 'RWA-1',
        recipient: 'GRECIPIENT',
        amount: '125.50',
      },
      status: 'SUCCESS',
      transactionHash: HASH,
      networkPassphrase: Networks.PUBLIC,
      observedAt: '2026-10-05T20:02:00.000Z',
    });

    expect(mapAegisActivity(receipt)).toMatchObject({
      kind: 'mint',
      status: 'confirmed',
      recipient: 'GRECIPIENT',
      amount: '125.50',
      assetId: 'RWA-1',
      transactionHash: HASH.toLowerCase(),
    });
  });

  it('does not copy raw payloads from unknown contract events', () => {
    const unknown: AegisContractEvent = {
      kind: 'unknown',
      rawTopics: ['future_event'],
      rawValue: { secret: 'DO_NOT_COPY' },
      reason: 'Unsupported event topic.',
      txHash: HASH,
      ledger: 43,
      inSuccessfulContractCall: true,
      eventName: 'future_event',
      decodedAt: '2026-10-05T20:03:00.000Z',
    };

    const activity = mapAegisActivity(unknown);

    expect(activity).toMatchObject({
      kind: 'unknown',
      reason: 'Unsupported event topic.',
      summary: 'Unrecognized Aegis contract event observed.',
    });
    expect(JSON.stringify(activity)).not.toContain('DO_NOT_COPY');
    expect(activity).not.toHaveProperty('rawValue');
    expect(activity).not.toHaveProperty('rawTopics');
  });

  it('preserves input order and stable position-based ids', () => {
    const failed = transferEvent({
      txHash: undefined,
      ledger: 44,
      inSuccessfulContractCall: false,
      decodedAt: '2026-10-05T20:04:00.000Z',
    });
    const pending = buildAdminActionReceipt({
      operation: 'protocol-pause',
      target: { contractId: 'CAEGIS' },
      status: 'PENDING',
      networkPassphrase: Networks.TESTNET,
      observedAt: '2026-10-05T20:05:00.000Z',
    });

    const history = mapAegisHistory([failed, pending]);

    expect(history.map((entry) => entry.kind)).toEqual(['transfer', 'admin']);
    expect(history[0]).toMatchObject({
      id: 'contract-event:ledger-44:transfer:0',
      status: 'failed',
    });
    expect(history[1]).toMatchObject({
      id: 'admin-receipt:unanchored:admin:1',
      status: 'pending',
    });
  });

  it('can omit unknown decoded events without renumbering later entries', () => {
    const unknown: AegisContractEvent = {
      kind: 'unknown',
      rawTopics: [],
      rawValue: null,
      reason: 'Unsupported event topic.',
      inSuccessfulContractCall: true,
      eventName: 'future_event',
      decodedAt: '2026-10-05T20:06:00.000Z',
    };
    const history = mapAegisHistory(
      [unknown, transferEvent()],
      { includeUnknownEvents: false },
    );

    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(
      `contract-event:${HASH.toLowerCase()}:transfer:1`,
    );
  });

  it('rejects invalid standalone tie-breaker positions', () => {
    expect(() => mapAegisActivity(transferEvent(), -1)).toThrow(RangeError);
  });
});
